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

import screen from "./screen.js";

const EXPLORER_BASE =
  process.env.NEWTON_EXPLORER_BASE || "https://explorer.newton.xyz/task";

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

// Protocol 0.7 returns a boolean `allowed`. Before it, the verdict arrived as
// `evaluation_result`, a byte array whose trailing 1 allowed and whose zeros
// denied. Both are read here so a client that has not been migrated yet still
// reports a verdict rather than an unexplained failure.
function decodeVerdict(taskResponse) {
  if (!taskResponse) return null;
  if (typeof taskResponse.allowed === "boolean") return taskResponse.allowed;
  const bytes = taskResponse.evaluation_result;
  if (!Array.isArray(bytes) || bytes.length === 0) return null;
  return bytes[bytes.length - 1] === 1;
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
async function submitToNewton(walletAddress, policy) {
  const gateway = process.env.NEWTON_GATEWAY_URL
    || "https://gateway.testnet.newton.xyz/rpc";

  const resp = await fetch(gateway, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.NEWTON_API_KEY}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
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
        wasm_args: [
          "0x" + Buffer.from(
            JSON.stringify({ address: walletAddress }), "utf8").toString("hex"),
        ],
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
  const hops = Number(rawHops);
  const usd = Number(rawUsd);
  return available.find((c) => c.hops === hops && c.usd === usd)
    || available.find((c) => c.hops === 3 && c.usd === 0)
    || available[0];
}

/** The rules actually deployed, so the page offers only what exists. */
export function availableRules() {
  return configured().map(({ hops, usd }) => ({ hops, usd }));
}

export default async function handler(req, res) {
  const address = String(req.query?.address || req.body?.address || "").trim();

  const screening = await runScreening(address);

  if (screening.status === "INVALID_ADDRESS") {
    return res.status(400).json(screening);
  }

  if (!newtonConfigured()) {
    return res.status(200).json({
      ...screening,
      attestation: { status: "NOT_CONFIGURED" },
    });
  }

  const policy = clientFor(req.query?.max_hops, req.query?.min_usd);
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
    // An attestation we could not obtain is not a pass. The screening result
    // is still reported, but the decision reverts to deny, the same way the
    // policy itself behaves when it cannot reach a conclusion.
    return res.status(200).json({
      ...screening,
      dataset: { ...screening.dataset, max_hops: policy.hops,
                 min_exposure_usd: policy.usd },
      rules: availableRules(),
      status: "ATTESTATION_FAILED",
      decision: "DENY",
      reason: "Screened, but the policy evaluation could not be attested",
      attestation: { status: "FAILED", detail: String(err.message || err) },
    });
  }

  // Newton is the authority on the decision; this service only supplies the
  // input. If the two disagree, that is a defect worth seeing rather than
  // smoothing over, so it is reported instead of being resolved silently.
  const localAllow = screening.decision === "ALLOW";
  const disagreement = localAllow !== attestation.allowed;

  res.status(200).json({
    ...screening,
    dataset: { ...screening.dataset, max_hops: policy.hops,
               min_exposure_usd: policy.usd },
    rules: availableRules(),
    decision: attestation.allowed ? "ALLOW" : "DENY",
    status: attestation.allowed ? "COMPLIANT" : "NON_COMPLIANT",
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
      local_decision: screening.decision,
    }),
  });
}
