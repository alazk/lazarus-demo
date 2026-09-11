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

async function submitToNewton(walletAddress) {
  const { createWalletClient, http } = await import("viem");
  const { privateKeyToAccount } = await import("viem/accounts");
  const { sepolia } = await import("viem/chains");
  const { newtonWalletClientActions } = await import("@newton-xyz/sdk");

  const account = privateKeyToAccount(process.env.DEMO_PRIVATE_KEY);

  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport: http(process.env.SEPOLIA_RPC_URL ||
                    "https://eth-sepolia.g.alchemy.com/v2/demo"),
  }).extend(
    newtonWalletClientActions({ apiKey: process.env.NEWTON_API_KEY })
  );

  // The policy denies unless the screened address matches the intent's `to`,
  // so this has to be the wallet that was actually screened.
  const { result, waitForTaskResponded } =
    await walletClient.submitEvaluationRequest({
      policyClient: process.env.NEWTON_POLICY_CLIENT,
      intent: {
        from: account.address,
        to: walletAddress,
        value: "0x0",
        data: "0x",
        chainId: SEPOLIA_CHAIN_ID,
        functionSignature: "0x",
      },
      timeout: 60,
    });

  const response = await waitForTaskResponded({ timeoutMs: 120000 });

  return {
    task_id: result.taskId,
    tx_hash: result.txHash,
    allowed: response.taskResponse.evaluationResult,
    expiration: response.attestation?.expiration ?? null,
    explorer_url: `${EXPLORER_BASE}/${result.taskId}`,
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
