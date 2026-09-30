// api/screen.js — live 3-hop Lazarus exposure screening.
//
// The submitted wallet's own counterparties are fetched from Etherscan on every
// request. Everything deeper was precomputed by scripts/build_halo.py, so a
// screening costs three API calls rather than several hundred:
//
//   counterparty is a seed        -> 1 hop
//   counterparty at halo d = 1    -> 2 hops
//   counterparty at halo d = 2    -> 3 hops
//
// Edge filters here must stay in step with scripts/build_halo.py.

import fs from "node:fs";
import path from "node:path";

const DATA = path.join(process.cwd(), "data");
const read = (f) => JSON.parse(fs.readFileSync(path.join(DATA, f), "utf8"));

const CFG = read("config.json");
const SEEDS_FILE = read("seeds.json");
const SERVICES_FILE = read("services.json");
const HALO_FILE = read("halo.json");

const SEEDS = new Map(
  SEEDS_FILE.addresses.map((r) => [r.address.toLowerCase(), r])
);
const SERVICES = SERVICES_FILE.addresses;
const HALO = HALO_FILE.halo;

const API = "https://api.etherscan.io/v2/api";
const PAGE = 2000;

// ---------------------------------------------------------------------------

async function etherscan(params) {
  // Without a key every call returns NOTOK, and an empty result would read as
  // "no exposure found". A screening that cannot see the chain has to fail,
  // never answer clean.
  if (process.env.ETHERSCAN_API_KEY === undefined ||
      process.env.ETHERSCAN_API_KEY === "") {
    throw new Error("ETHERSCAN_API_KEY is not set, so the chain cannot be read");
  }

  const query = new URLSearchParams({
    ...params,
    chainid: String(CFG.chain_id),
    apikey: process.env.ETHERSCAN_API_KEY,
  });

  for (let attempt = 0; attempt < 3; attempt++) {
    const resp = await fetch(`${API}?${query}`, { signal: AbortSignal.timeout(10000) });
    if (!resp.ok) {
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      continue;
    }
    const body = await resp.json();

    // A populated result.
    if (body.status === "1" && Array.isArray(body.result)) return body.result;

    const message = String(body.message ?? "");
    const resultText = typeof body.result === "string" ? body.result : "";

    // An empty history is reported as status 0, with either an empty array or a
    // "No transactions found" string. Both genuinely mean nothing to trace.
    if (/no transactions/i.test(message) || /no transactions/i.test(resultText)) {
      return [];
    }

    // Rate limiting deserves another attempt.
    if (/rate limit|max calls|max rate/i.test(resultText) ||
        /rate limit|max calls|max rate/i.test(message)) {
      await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
      continue;
    }

    // Anything else is the API refusing to answer, most often a missing or
    // invalid key. Throwing routes it to the fail-closed path; returning an
    // empty list here would be indistinguishable from a wallet with no
    // exposure, which is the one wrong answer this service must never give.
    throw new Error(
      `etherscan refused the request: ${resultText || message || "unknown reason"}`);
  }
  throw new Error("etherscan unavailable");
}

// Daily closes. The file is built once, so a transfer dated after its last day
// is valued at the last close rather than dropped: dropping it would hide every
// recent ETH and BTC-pegged transfer and read as "no exposure".
const PRICES = read("prices.json").prices;
const PRICE_DAYS = Object.fromEntries(
  Object.entries(PRICES).map(([asset, byDay]) => [asset, Object.keys(byDay).sort()]));

function closeOn(asset, day) {
  const byDay = PRICES[asset];
  if (!byDay) return null;
  if (byDay[day]) return byDay[day];
  const days = PRICE_DAYS[asset];
  const last = days[days.length - 1];
  if (day > last) return byDay[last];
  // A gap inside the range: take the nearest earlier close within a week.
  const t = Date.parse(day);
  for (let back = 1; back <= 7; back++) {
    const d = new Date(t - back * 86400000).toISOString().slice(0, 10);
    if (byDay[d]) return byDay[d];
  }
  return null;
}

// Tokens are recognised by contract address on Ethereum mainnet. Matching on
// the symbol would let anyone deploy a token called "USDT", emit a transfer
// from a Lazarus address to any wallet, and make that wallet look exposed.
const TOKENS = {
  "0xdac17f958d2ee523a2206206994597c13d831ec7": "USD",  // USDT
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": "USD",  // USDC
  "0x6b175474e89094c44da98b954eedeac495271d0f": "USD",  // DAI
  "0x4fabb145d64652a948d72533023f6e7a623c7c53": "USD",  // BUSD
  "0x0000000000085d4780b73119b644ae5ecd22b376": "USD",  // TUSD
  "0x8e870d67f660d95d5be530380d0ec0bd388289e1": "USD",  // USDP
  "0x853d955acef822db058eb8505911ed77f175b99e": "USD",  // FRAX
  "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": "ETH",  // WETH
  "0xae7ab96520de3a18e5e111b5eaab095312d7fe84": "ETH",  // stETH
  "0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0": "ETH",  // wstETH
  "0xae78736cd615f374d3085123a210448e74fc6393": "ETH",  // rETH
  "0xbe9895146f7af43049ca1c1ae358b0541ea49704": "ETH",  // cbETH
  "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599": "BTC",  // WBTC
  "0x18084fba666a33d37592fa2633fd49a74dd93a88": "BTC",  // tBTC
};

/** Dollar value at the price on the day of the transfer, or null.
 *  Null means the asset cannot be valued, and an unvaluable edge is dropped
 *  rather than counted as zero. That is what keeps spam tokens out. */
function usdValue(asset, amount, timestamp) {
  if (asset === "USD") return amount;
  if (asset !== "ETH" && asset !== "BTC") return null;
  const day = new Date(Number(timestamp) * 1000).toISOString().slice(0, 10);
  const p = closeOn(asset, day);
  return p ? amount * p : null;
}

/** USD value of one transfer row, or null if it does not qualify. */
function edgeUsd(row, action) {
  try {
    if (action === "tokentx") {
      const decimals = Number(row.tokenDecimal || 18);
      const amount = Number(BigInt(row.value || "0")) / 10 ** decimals;
      const asset = TOKENS[String(row.contractAddress || "").toLowerCase()];
      return asset ? usdValue(asset, amount, row.timeStamp || 0) : null;
    }
    const amount = Number(BigInt(row.value || "0")) / 1e18;
    return usdValue("ETH", amount, row.timeStamp || 0);
  } catch {
    return null;
  }
}

// Contracts are terminal: a router, WETH or a bridge that Lazarus once used is
// used by millions of people, so a path through one says nothing about the
// wallet. The precomputed map predates this rule, so paths are checked here.
// Well-known ones need no lookup; anything else on a candidate path is asked
// of the chain once per instance.
const KNOWN_CONTRACTS = new Set([
  "0x7a250d5630b4cf539739df2c5dacb4c659f2488d", // Uniswap V2 Router02
  "0xe592427a0aece92de3edee1f18e0157c05861564", // Uniswap V3 SwapRouter
  "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45", // Uniswap SwapRouter02
  "0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad", // Uniswap Universal Router
  "0xef1c6e67703c7bd7107eed8303fbe6ec2554bf6b", // Uniswap Universal Router (old)
  "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", // WETH9
  "0x1111111254eeb25477b68fb85ed929f73a960582", // 1inch v5
  "0x1111111254fb6c44bac0bed2854e76f90643097d", // 1inch v4
  "0x11111112542d85b3ef69ae05771c2dccff4faa26", // 1inch v3
  "0x111111125421ca6dc452d289314280a0f8842a65", // 1inch v6
  "0xd9e1ce17f2641f24ae83637ab66a2cca9c378b9f", // SushiSwap router
  "0x881d40237659c251811cec9c364ef91dc08d300c", // MetaMask swap router
  "0x7be8076f4ea4a4ad08075c2508e481d6c946d12b", // OpenSea Wyvern v1
  "0x99c9fc46f92e8a1c0dec1b1747d010903e884be1", // Optimism gateway
  "0xa0c68c638235ee32657e8f720a23cec1bfc77c77", // Polygon bridge
]);
const CODE_CACHE = new Map();
const CODE_LOOKUPS_PER_SCREEN = 12;

/** True when the address holds code. Unknown answers count as not a contract,
 *  which keeps the path and so errs toward blocking. */
async function isContract(address, budget) {
  if (KNOWN_CONTRACTS.has(address)) return true;
  if (CODE_CACHE.has(address)) return CODE_CACHE.get(address);
  if (budget.left <= 0) { budget.exhausted = true; return false; }
  budget.left -= 1;
  try {
    const query = new URLSearchParams({
      module: "proxy", action: "eth_getCode", address, tag: "latest",
      chainid: String(CFG.chain_id), apikey: process.env.ETHERSCAN_API_KEY,
    });
    for (let attempt = 0; attempt < 3; attempt++) {
      const resp = await fetch(`${API}?${query}`, { signal: AbortSignal.timeout(8000) });
      const body = resp.ok ? await resp.json() : null;
      if (body && typeof body.result === "string" && body.result.startsWith("0x")) {
        const code = body.result !== "0x" && body.result !== "0x0";
        CODE_CACHE.set(address, code);
        return code;
      }
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  } catch { /* fall through */ }
  budget.exhausted = true;
  return false;
}

/** Counterparties of one address, filtered and ranked. */
async function counterparties(address) {
  const common = {
    module: "account",
    address,
    startblock: "0",
    endblock: "99999999",
    sort: "desc",
    page: "1",
    offset: String(PAGE),
  };

  const found = new Map();
  let totalRows = 0;
  let truncated = false;

  for (const action of ["txlist", "txlistinternal", "tokentx"]) {
    const rows = await etherscan({ ...common, action });
    totalRows += rows.length;
    if (rows.length >= PAGE) truncated = true;

    for (const row of rows) {
      if (row.isError === "1") continue;

      const usd = edgeUsd(row, action);
      if (usd === null || usd < CFG.min_edge_usd) continue;

      const from = (row.from || "").toLowerCase();
      const to = (row.to || "").toLowerCase();
      const other = from === address ? to : from;
      if (!other || other === address || !other.startsWith("0x")) continue;

      const prior = found.get(other);
      if (!prior || usd > prior.usd) {
        found.set(other, {
          usd,
          tx: row.hash,
          ts: Number(row.timeStamp || 0),
          direction: from === address ? "out" : "in",
        });
      }
    }
  }

  // Checking a counterparty against the halo is a dictionary lookup, not an
  // API call, so this cap is generous on purpose. Tightening it would discard
  // detections for no saving.
  const ranked = [...found.entries()]
    .sort((a, b) => b[1].usd - a[1].usd)
    .slice(0, CFG.max_fanout_query);

  return {
    counterparties: ranked,
    highDegree: totalRows >= CFG.high_degree_tx_count,
    truncated,
  };
}

function describe(address) {
  const seed = SEEDS.get(address);
  if (seed) return { address, role: "lazarus", label: seed.label };
  if (SERVICES[address]) return { address, role: "service", label: SERVICES[address] };
  return { address, role: "wallet", label: null };
}

// ---------------------------------------------------------------------------

async function screen(address, cps) {
  // 0 hops: the wallet is itself a known Lazarus address.
  if (SEEDS.has(address)) return directMatch(address);

  const candidates = [];
  for (const [other, edge] of cps) {
    let hop = null;
    let tail = null;

    if (SEEDS.has(other)) {
      // A seed is a match even if it is also a service address.
      hop = 1;
      tail = [other];
    } else if (SERVICES[other]) {
      // Services are terminal. Every exchange user shares counterparties with
      // Lazarus; that is not exposure and must not be traversed.
      continue;
    } else if (HALO[other]) {
      hop = HALO[other].d + 1;
      tail = HALO[other].via;
    }
    if (hop === null || hop > CFG.max_depth) continue;

    // Exposure value is the weakest link, not the largest. A wallet that
    // received $500,000 from an intermediary that received $30 from a Lazarus
    // address is exposed to $30.
    const tailMin = HALO[other]?.min_usd;
    const exposureUsd = tailMin === undefined ? edge.usd : Math.min(edge.usd, tailMin);
    candidates.push({ other, edge, hop, tail, exposureUsd });
  }

  // Fewest hops first; among equals, the most valuable link.
  candidates.sort((a, b) => a.hop - b.hop || b.exposureUsd - a.exposureUsd);

  const budget = { left: CODE_LOOKUPS_PER_SCREEN, exhausted: false };
  let skipped = 0;
  for (const c of candidates) {
    // Every address between the wallet and the Lazarus address must be a
    // wallet, not a contract. The Lazarus address itself may be anything.
    const intermediaries = c.tail.slice(0, -1);
    let viaContract = false;
    for (const node of intermediaries) {
      if (SERVICES[node] || await isContract(node, budget)) { viaContract = true; break; }
    }
    if (viaContract) { skipped += 1; continue; }

    return {
      direct_match: false,
      exposure: true,
      hop_count: c.hop,
      matched_wallet: c.tail[c.tail.length - 1],
      path: [address, ...c.tail],
      exposure_usd: Math.round(c.exposureUsd),
      first_edge_usd: Math.round(c.edge.usd),
      edges: [{ from: address, to: c.other, tx: c.edge.tx, ts: c.edge.ts,
                direction: c.edge.direction }],
      paths_through_contracts_skipped: skipped,
      contract_check_incomplete: budget.exhausted,
    };
  }

  return {
    direct_match: false,
    exposure: false,
    hop_count: null,
    matched_wallet: null,
    path: [],
    exposure_usd: null,
    edges: [],
    paths_through_contracts_skipped: skipped,
    contract_check_incomplete: budget.exhausted,
  };
}

function directMatch(address) {
  return {
    direct_match: true,
    exposure: true,
    hop_count: 0,
    matched_wallet: address,
    path: [address],
    exposure_usd: null,   // the wallet is the entity; no edge to value
    edges: [],
  };
}

function policy(result) {
  if (result.direct_match) {
    return { decision: "DENY", status: "NON_COMPLIANT",
             reason: "Direct Lazarus match" };
  }
  if (result.exposure) {
    return { decision: "DENY", status: "NON_COMPLIANT",
             reason: `${result.hop_count}-hop Lazarus exposure` };
  }
  return { decision: "ALLOW", status: "COMPLIANT",
           reason: result.counterparties_examined === 0
             ? "No qualifying transfers found for this wallet"
             : `No Lazarus exposure detected within ${CFG.max_depth} hops` };
}

// ---------------------------------------------------------------------------


export default async function handler(req, res) {
  const raw = (req.query?.address || req.body?.address || "").trim();
  const address = raw.toLowerCase();

  if (!/^0x[0-9a-f]{40}$/.test(address)) {
    return res.status(400).json({
      status: "INVALID_ADDRESS",
      reason: "Expected a 42-character Ethereum address.",
    });
  }

  let result;
  try {
    if (SEEDS.has(address)) {
      // A listed address needs no chain read, so an Etherscan outage cannot
      // turn a known Lazarus address into a failed check.
      result = directMatch(address);
      result.counterparties_examined = 0;
    } else {
      const { counterparties: cps, highDegree, truncated } = await counterparties(address);
      result = await screen(address, cps);
      result.counterparties_examined = cps.length;
      result.submitted_wallet_high_degree = highDegree;
      result.history_truncated = truncated;
    }
  } catch (err) {
    console.error("screen failed", address, err);
    // PRD section 13: fail closed, but never present a failure as exposure.
    return res.status(200).json({
      wallet: address,
      status: "SCREENING_FAILED",
      decision: "DENY",
      reason: "Unable to complete exposure check",
      detail: "The transaction history could not be read.",
      evaluated_at: new Date().toISOString(),
    });
  }

  if (result.direct_match) delete result.counterparties_examined;
  const verdict = policy(result);

  res.status(200).json({
    wallet: address,
    ...result,
    ...verdict,
    nodes: result.path.map(describe),
    evaluated_at: new Date().toISOString(),
    dataset: {
      seeds: SEEDS_FILE.count,
      seeds_pulled_at: SEEDS_FILE.pulled_at,
      graph_source: "Etherscan, queried live",
      halo_built_at: HALO_FILE.built_at,
      max_depth: CFG.max_depth,
      min_edge_usd: CFG.min_edge_usd,
      // The enforced floor depends on the policy client, so /api/evaluate
      // sets it from the client it submitted to.
      min_exposure_usd: 0,
    },
  });
}
