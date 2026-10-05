// api/evaluate.js — what the UI calls.
//
// Screens the wallet, then submits the intent to Newton so the decision is
// attested rather than merely computed here.
//
// This is deliberately separate from /api/screen. The Newton oracle calls
// /api/screen during evaluation, so if that endpoint submitted tasks the
// operators would call back into it and submit another, without end. Screening
// stays pure; only this endpoint talks to Newton.
//
// Env:
//   NEWTON_API_KEY        gateway key
//   NEWTON_POLICY_CLIENT  policy client contract address, from deployment
//   SEPOLIA_RPC_URL       optional, defaults to Alchemy's public demo endpoint
//   NEWTON_EXPLORER_BASE  optional, defaults to the public explorer
//
// No private key is needed. The gateway authenticates with the API key and the
// operators evaluate the policy, so nothing here signs a transaction.
//
// With either of the first two unset the endpoint still screens and returns a
// result, marked as unattested. The demo stays usable before the policy exists.

import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import screen from "./screen.js";

// The precomputed map keeps, for each wallet, the transfer that links it one
// hop closer to Lazarus. The page shows every step of a reported path with its
// transaction so anyone can check it on Etherscan. Only this endpoint adds
// them; /api/screen, which the Newton oracle reads, is unchanged.
const HALO = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "halo.json"), "utf8")).halo;

/** The transfers along a reported path, one per hop: the first from the live
 *  read, the rest from the precomputed map when it links the same wallets. */
function withHops(screening) {
  const p = screening?.path;
  if (!Array.isArray(p) || p.length < 2) return screening;
  const hops = [{ from: p[0], to: p[1], tx: screening.edges?.[0]?.tx || null,
                  usd: typeof screening.first_edge_usd === "number" ? screening.first_edge_usd : null }];
  for (let i = 1; i < p.length - 1; i++) {
    const h = HALO[p[i]];
    const linked = h && Array.isArray(h.via) && h.via[1] === p[i + 1];
    hops.push({ from: p[i], to: p[i + 1], tx: linked ? h.tx || null : null,
                usd: linked && typeof h.usd === "number" ? Math.round(h.usd) : null });
  }
  return { ...screening, hops };
}

// Confirmed against a real task: the network is a path segment, and
// /task/<id> without it returns 404.
const EXPLORER_DEFAULT = "https://explorer.newton.xyz/testnet/task";

// A base that is not an absolute http(s) URL would be resolved relative to this
// site, turning every attestation link into a 404 on our own domain. Ignore
// anything that cannot be a link and fall back to the known-good default.
function explorerBase() {
  const configured = (process.env.NEWTON_EXPLORER_BASE || "").trim();
  if (/^https?:\/\/[^\s]+$/i.test(configured)) {
    return configured.replace(/\/+$/, "");
  }
  if (configured) {
    console.warn(
      `NEWTON_EXPLORER_BASE is not an absolute URL (${configured}), using ${EXPLORER_DEFAULT}`);
  }
  return EXPLORER_DEFAULT;
}

const EXPLORER_BASE = explorerBase();

const SEPOLIA_CHAIN_ID = 11155111;

/** Call the screening handler in-process rather than over HTTP. */
async function runScreening(address) {
  let captured;
  const res = {
    status() { return this; },
    json(body) { captured = body; return this; },
  };
  await screen({ query: { address } }, res);
  return captured;
}

function newtonConfigured() {
  return Boolean(
    process.env.NEWTON_API_KEY &&
    process.env.NEWTON_POLICY_CLIENT
  );
}

// Protocol 0.7 returns a boolean `allowed`. Anything else is not a verdict.
function decodeVerdict(taskResponse) {
  if (taskResponse && typeof taskResponse.allowed === "boolean") return taskResponse.allowed;
  return null;
}

// The SDK's submitEvaluationRequest returns an empty body through this path,
// surfacing as "Unexpected end of JSON input" with no status to go on. The
// gateway's newt_createTask works directly, so this speaks to it instead.
// Gateway fields are snake_case, chain_id is a hex string, and wasm_args is
// hex-encoded UTF-8 JSON. Without it the oracle screens nothing and the
// policy fails closed.
//
// Under protocol 0.7 a client holds a policy set and wasm_args is an array with
// one entry per policy in that set. Our clients carry a single policy, so the
// array has one element. Sending the bare string to a 0.7 client is rejected
// before the oracle runs.
//
// Policy D is pure Rego with no oracle, and the gateway refuses a task whose
// wasm_args entry for a pure-Rego policy is not empty. So D sends an empty
// entry. "0x" first; if the gateway still calls it non-empty, "" once.
async function submitToNewton(walletAddress, policy) {
  const first = policy.all
    ? "0x"
    : "0x" + Buffer.from(
        JSON.stringify({ address: walletAddress }), "utf8").toString("hex");
  try {
    return await submitTask(walletAddress, policy, first);
  } catch (err) {
    if (policy.all && /wasm_args\[0\] must be empty/.test(String(err.message))) {
      return submitTask(walletAddress, policy, "");
    }
    throw err;
  }
}

async function submitTask(walletAddress, policy, wasmArg) {
  const gateway = process.env.NEWTON_GATEWAY_URL
    || "https://gateway.testnet.newton.xyz/rpc";

  const resp = await fetch(gateway, {
    signal: AbortSignal.timeout(70000),
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.NEWTON_API_KEY}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: randomUUID(),
      method: "newt_createTask",
      params: {
        policy_client: policy.address,
        intent: {
          // The policy denies unless the screened address matches the
          // intent's `to`, so this has to be the wallet screened.
          from: process.env.DEMO_FROM_ADDRESS
            || "0x0000000000000000000000000000000000000000",
          to: walletAddress,
          value: "0x0",
          data: "0x",
          chain_id: "0x" + SEPOLIA_CHAIN_ID.toString(16),
          function_signature: "",
        },
        wasm_args: [wasmArg],
        timeout: 60,
      },
    }),
  });

  const text = await resp.text();
  // A 401 here is almost always ownership rather than a bad key: under 0.7
  // the policy client's owner must be the wallet behind NEWTON_API_KEY. The
  // clients deploy cleanly when it is not, and every task fails at this line.
  if (resp.status === 401) {
    throw new Error(
      "gateway rejected the task (HTTP 401). Check that the policy client's " +
      "owner is the wallet behind NEWTON_API_KEY."
    );
  }
  if (!text) throw new Error(`gateway returned an empty body (HTTP ${resp.status})`);

  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`gateway returned unparseable JSON: ${text.slice(0, 200)}`);
  }
  if (payload.error) throw new Error(`gateway error: ${JSON.stringify(payload.error)}`);

  const result = payload.result;
  if (!result || result.status !== "success") {
    throw new Error(`task did not succeed: ${JSON.stringify(result?.error ?? result)}`);
  }

  const allowed = decodeVerdict(result.task_response);
  if (allowed === null) throw new Error("task returned no verdict");

  return {
    task_id: result.task_id,
    tx_hash: null,
    allowed,
    expiration: result.expiration ?? null,
    explorer_url: `${EXPLORER_BASE}/${result.task_id}`,
  };
}

// Each combination of parameters is a separate policy client bound to the
// same policy. Selecting one selects which contract the task is submitted to,
// so the rule is still fixed on-chain before the evidence is evaluated — the
// caller picks a policy, it does not supply one.
const CLIENTS = [
  { hops: 1, usd: 0,       env: "NEWTON_POLICY_CLIENT_H1V0" },
  { hops: 2, usd: 0,       env: "NEWTON_POLICY_CLIENT_H2V0" },
  { hops: 3, usd: 0,       env: "NEWTON_POLICY_CLIENT" },
  { hops: 3, usd: 1000000, env: "NEWTON_POLICY_CLIENT_H3V1M" },
  // A different policy, not a parameter set: its rule allows every wallet.
  // It exists to show that the operators enforce whatever the policy says.
  // The screening still runs in full, so the page can show what the data
  // found next to what the rule decided.
  { hops: 0, usd: 0, all: true, env: "NEWTON_POLICY_CLIENT_ALLOW" },
];

function configured() {
  return CLIENTS
    .map((c) => ({ ...c, address: process.env[c.env] }))
    .filter((c) => Boolean(c.address));
}

/** The client for a requested rule, falling back to the default. */
function clientFor(rawHops, rawUsd) {
  const available = configured();
  if (available.length === 0) return null;
  // No parameters means the default rule. A rule that was asked for but has no
  // deployed client is refused, never swapped for a different one.
  const hops = rawHops === undefined || rawHops === "" ? 3 : Number(rawHops);
  const usd = rawUsd === undefined || rawUsd === "" ? 0 : Number(rawUsd);
  return available.find((c) => c.hops === hops && c.usd === usd) || "unsupported";
}

/**
 * What the policy should decide for this screening under one client's rule,
 * mirroring params_schema.json: a known Lazarus address is always denied;
 * otherwise deny only when the exposure sits at or within max_hops and its
 * smallest transfer is worth at least min_exposure_usd.
 */
function decisionUnder(screening, rule) {
  // An unscreened wallet is denied, exactly as the policy denies it.
  if (screening.status === "SCREENING_FAILED" || screening.exposure === undefined) return "DENY";
  if (rule.all) return "ALLOW";
  if (screening.direct_match) return "DENY";
  if (screening.exposure
      && typeof screening.hop_count === "number" && screening.hop_count <= rule.hops
      && Number(screening.exposure_usd ?? 0) >= rule.usd) return "DENY";
  return "ALLOW";
}

/** The rules actually deployed, so the page offers only what exists. */
export function availableRules() {
  return configured().map(({ hops, usd, all }) => ({ hops, usd, ...(all && { all: true }) }));
}

/** The reason line under the rule that was actually applied. */
function reasonUnder(screening, rule, allowed) {
  const hops = (n) => `${n} ${n === 1 ? "hop" : "hops"}`;
  if (rule.all && allowed) return "This policy allows every wallet";
  if (screening.direct_match) return "Direct Lazarus match";
  if (!screening.exposure) {
    return screening.counterparties_examined === 0
      ? "No qualifying transfers found for this wallet"
      : "No Lazarus exposure found within 3 hops";
  }
  const found = `${hops(screening.hop_count)} Lazarus exposure`;
  if (!allowed) return `${found}, inside the rule`;
  if (screening.hop_count > rule.hops) return `${found}, outside a radius of ${hops(rule.hops)}`;
  if (Number(screening.exposure_usd ?? 0) < rule.usd) return `${found}, below the rule's value floor`;
  return `${found}, but the operators allowed it`;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const address = String(req.query?.address || req.body?.address || "").trim();

  // Refuse an undeployed rule before spending any Etherscan calls on it.
  const policy = newtonConfigured() ? clientFor(req.query?.max_hops, req.query?.min_usd) : null;
  if (policy === "unsupported") {
    return res.status(400).json({
      status: "UNSUPPORTED_RULE",
      reason: "No policy client is deployed for that radius and floor.",
      rules: availableRules(),
    });
  }

  const screening = withHops(await runScreening(address));

  if (screening.status === "INVALID_ADDRESS") {
    return res.status(400).json(screening);
  }

  // A wallet that could not be screened is not sent for attestation: the
  // result would be a verdict with no evidence behind it. It is reported as a
  // failed check and denied.
  if (screening.status === "SCREENING_FAILED") {
    return res.status(200).json({ ...screening, attestation: { status: "SKIPPED" } });
  }

  if (!newtonConfigured()) {
    return res.status(200).json({
      ...screening,
      attestation: { status: "NOT_CONFIGURED" },
    });
  }

  if (!policy) {
    return res.status(200).json({
      ...screening,
      attestation: { status: "NOT_CONFIGURED" },
    });
  }

  let attestation;
  try {
    attestation = await submitToNewton(screening.wallet, policy);
  } catch (err) {
    console.error("attestation failed", screening.wallet, policy.env, err);
    // An attestation we could not obtain is not a pass. The screening result
    // is still reported, but the decision reverts to deny, the same way the
    // policy itself behaves when it cannot reach a conclusion.
    return res.status(200).json({
      ...screening,
      dataset: { ...screening.dataset, max_hops: policy.hops,
                 min_exposure_usd: policy.usd, ...(policy.all && { allow_all: true }) },
      rules: availableRules(),
      status: "ATTESTATION_FAILED",
      decision: "DENY",
      reason: "Screened, but the policy evaluation could not be attested",
      attestation: { status: "FAILED", detail: "The operators' decision could not be obtained." },
    });
  }

  // Newton is the authority on the decision; this service only supplies the
  // input. If the two disagree, that is a defect worth seeing rather than
  // smoothing over, so it is reported instead of being resolved silently.
  //
  // The comparison has to use the rule the operators were actually asked about.
  // screening.decision is computed at the screen's fixed depth and ignores the
  // radius, so comparing against it reported a disagreement for every wallet
  // whose exposure sits past the chosen radius, which the policy correctly
  // allows.
  const localDecision = decisionUnder(screening, policy);
  const disagreement = (localDecision === "ALLOW") !== attestation.allowed;

  res.status(200).json({
    ...screening,
    dataset: { ...screening.dataset, max_hops: policy.hops,
               min_exposure_usd: policy.usd, ...(policy.all && { allow_all: true }) },
    rules: availableRules(),
    decision: attestation.allowed ? "ALLOW" : "DENY",
    status: attestation.allowed ? "COMPLIANT" : "NON_COMPLIANT",
    reason: reasonUnder(screening, policy, attestation.allowed),
    explorer_url: attestation.explorer_url,
    attestation: {
      status: "ATTESTED",
      task_id: attestation.task_id,
      tx_hash: attestation.tx_hash,
      expiration: attestation.expiration,
      network: "Ethereum Sepolia",
    },
    ...(disagreement && {
      warning: "The attested decision differs from the local screening result",
      local_decision: localDecision,
    }),
  });
}
