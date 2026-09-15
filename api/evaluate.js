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
//   DEMO_PRIVATE_KEY      funded Sepolia key that signs task submissions
//   SEPOLIA_RPC_URL       optional, defaults to Alchemy's public demo endpoint
//   NEWTON_EXPLORER_BASE  optional, defaults to the public explorer
//
// With any of the first three unset the endpoint still screens and returns a
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
    process.env.NEWTON_POLICY_CLIENT &&
    process.env.DEMO_PRIVATE_KEY
  );
}

/** evaluation_result is a byte array: a trailing 1 allows, all zeros denies. */
function decodeResult(bytes) {
  if (!Array.isArray(bytes) || bytes.length === 0) return null;
  return bytes[bytes.length - 1] === 1;
}

// The SDK's submitEvaluationRequest returns an empty body through this path,
// surfacing as "Unexpected end of JSON input" with no status to go on. The
// gateway's newt_createTask works directly, so this speaks to it instead.
// Two shapes the SDK was hiding: gateway fields are snake_case, and chain_id
// is a hex string rather than a number.
async function submitToNewton(walletAddress) {
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
        policy_client: process.env.NEWTON_POLICY_CLIENT,
        intent: {
          from: process.env.DEMO_FROM_ADDRESS
            || "0x0000000000000000000000000000000000000000",
          to: walletAddress,
          value: "0x0",
          data: "0x",
          chain_id: "0x" + SEPOLIA_CHAIN_ID.toString(16),
          function_signature: "",
        },
        wasm_args: "0x",
        timeout: 60,
      },
    }),
  });

  const text = await resp.text();
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

  const allowed = decodeResult(result.task_response?.evaluation_result);
  if (allowed === null) throw new Error("task returned no evaluation result");

  return {
    task_id: result.task_id,
    tx_hash: null,
    allowed,
    expiration: result.expiration ?? null,
    signers: result.bls_aggregation_result?.signers_count ?? null,
    explorer_url: `${EXPLORER_BASE}/${result.task_id}`,
  };
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

  let attestation;
  try {
    attestation = await submitToNewton(screening.wallet);
  } catch (err) {
    // An attestation we could not obtain is not a pass. The screening result
    // is still reported, but the decision reverts to deny, the same way the
    // policy itself behaves when it cannot reach a conclusion.
    return res.status(200).json({
      ...screening,
      status: "ATTESTATION_FAILED",
      decision: "DENY",
      reason: "Screened, but the policy evaluation could not be attested",
      attestation: { status: "FAILED", detail: JSON.stringify(err, Object.getOwnPropertyNames(err)).slice(0, 600) },
    });
  }

  // Newton is the authority on the decision; this service only supplies the
  // input. If the two disagree, that is a defect worth seeing rather than
  // smoothing over, so it is reported instead of being resolved silently.
  const localAllow = screening.decision === "ALLOW";
  const disagreement = localAllow !== attestation.allowed;

  res.status(200).json({
    ...screening,
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
