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
  const query = new URLSearchParams({
    ...params,
    chainid: String(CFG.chain_id),
    apikey: process.env.ETHERSCAN_API_KEY,
  });

  for (let attempt = 0; attempt < 3; attempt++) {
    const resp = await fetch(`${API}?${query}`);
    if (!resp.ok) {
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      continue;
    }
    const body = await resp.json();
    if (body.status === "1" && Array.isArray(body.result)) return body.result;
    if (typeof body.result === "string") {
      if (body.result.includes("No transactions")) return [];
      if (body.result.toLowerCase().includes("rate limit")) {
        await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
        continue;
      }
    }
    return [];
  }
  throw new Error("etherscan unavailable");
}

const PRICES = (() => {
  try { return read("prices.json").prices; } catch { return {}; }
})();

const STABLES = new Set(["USDT", "USDC", "DAI", "BUSD", "TUSD", "USDP", "FRAX"]);
const ETH_PEGGED = new Set(["WETH", "STETH", "WSTETH", "RETH", "CBETH"]);
const BTC_PEGGED = new Set(["WBTC", "TBTC"]);

/** Dollar value at the price on the day of the transfer, or null.
 *  Null means the asset cannot be valued, and an unvaluable edge is dropped
 *  rather than counted as zero. That is what keeps spam tokens out. */
function usdValue(symbol, amount, timestamp) {
  const day = new Date(Number(timestamp) * 1000).toISOString().slice(0, 10);
  const s = String(symbol || "").toUpperCase();
  if (STABLES.has(s)) return amount;
  if (ETH_PEGGED.has(s) || s === "ETH") {
    const p = PRICES.ETH?.[day];
    return p ? amount * p : null;
  }
  if (BTC_PEGGED.has(s)) {
    const p = PRICES.BTC?.[day];
    return p ? amount * p : null;
  }
  return null;
}

/** USD value of one transfer row, or null if it does not qualify. */
function edgeUsd(row, action) {
  try {
    if (action === "tokentx") {
      const decimals = Number(row.tokenDecimal || 18);
      const amount = Number(BigInt(row.value || "0")) / 10 ** decimals;
      return usdValue(row.tokenSymbol, amount, row.timeStamp || 0);
    }
    const amount = Number(BigInt(row.value || "0")) / 1e18;
    return usdValue("ETH", amount, row.timeStamp || 0);
  } catch {
    return null;
  }
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

  for (const action of ["txlist", "txlistinternal", "tokentx"]) {
    const rows = await etherscan({ ...common, action });
    totalRows += rows.length;

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
  };
}

function describe(address) {
  const seed = SEEDS.get(address);
  if (seed) return { address, role: "lazarus", label: seed.label };
  if (SERVICES[address]) return { address, role: "service", label: SERVICES[address] };
  return { address, role: "wallet", label: null };
}

// ---------------------------------------------------------------------------

function screen(address, cps) {
  // 0 hops: the wallet is itself a known Lazarus address.
  if (SEEDS.has(address)) {
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

  let best = null;

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
    if (best && best.hop_count <= hop) continue;

    // Exposure value is the weakest link, not the largest. A wallet that
    // received $500,000 from an intermediary that received $30 from a Lazarus
    // address is exposed to $30.
    const tailMin = HALO[other]?.min_usd;
    const exposureUsd = tailMin === undefined
      ? edge.usd
      : Math.min(edge.usd, tailMin);

    best = {
      direct_match: false,
      exposure: true,
      hop_count: hop,
      matched_wallet: tail[tail.length - 1],
      path: [address, ...tail],
      exposure_usd: Math.round(exposureUsd),
      first_edge_usd: Math.round(edge.usd),
      edges: [{ from: address, to: other, tx: edge.tx, ts: edge.ts,
                direction: edge.direction }],
    };
  }

  return (
    best || {
      direct_match: false,
      exposure: false,
      hop_count: null,
      matched_wallet: null,
      path: [],
      exposure_usd: null,
      edges: [],
    }
  );
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
           reason: `No Lazarus exposure detected within ${CFG.max_depth} hops` };
}

// ---------------------------------------------------------------------------


/** The enforced threshold, read from the policy client's stored params. */
async function liveThreshold() {
  if (!process.env.NEWTON_POLICY_CLIENT) return 0;
  try {
    const { createPublicClient, http, hexToString } = await import("viem");
    const { sepolia } = await import("viem/chains");
    const pub = createPublicClient({
      chain: sepolia,
      transport: http(process.env.SEPOLIA_RPC_URL
        || "https://ethereum-sepolia-rpc.publicnode.com"),
    });
    const raw = await pub.readContract({
      address: process.env.NEWTON_POLICY_CLIENT,
      abi: [{ type: "function", name: "policyParams", stateMutability: "view",
              inputs: [], outputs: [{ type: "bytes" }] }],
      functionName: "policyParams",
    });
    const parsed = JSON.parse(hexToString(raw));
    return Number(parsed.min_exposure_usd ?? 0);
  } catch {
    return 0;
  }
}

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
    const { counterparties: cps, highDegree } = await counterparties(address);
    result = screen(address, cps);
    result.counterparties_examined = cps.length;
    result.submitted_wallet_high_degree = highDegree;
  } catch (err) {
    // PRD section 13: fail closed, but never present a failure as exposure.
    return res.status(200).json({
      wallet: address,
      status: "SCREENING_FAILED",
      decision: "DENY",
      reason: "Unable to complete exposure check",
      detail: String(err.message || err),
      evaluated_at: new Date().toISOString(),
    });
  }

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
      // The live policy parameter, so the page can mark which
      // threshold is the one actually enforced on-chain.
      // Read from the chain rather than an env var, since the page can now
      // change it and a stale env var would mislabel which one is enforced.
      min_exposure_usd: await liveThreshold(),
    },
  });
}
