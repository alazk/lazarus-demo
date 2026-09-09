// policy.js — Newton data oracle for Lazarus exposure screening.
//
// Compiled to WASM and executed by Newton operators at evaluation time. It
// calls the screening service and returns a flat object that becomes
// data.wasm inside policy.rego.
//
// The endpoint is a constant on purpose. wasm_args come from the caller, so an
// endpoint passed in at evaluation time would let anyone point the oracle at a
// server of their own that answers "clean" to everything. Compiling it in means
// the data source is fixed at deploy time and is part of what gets attested.
//
// Build:
//   jco componentize -w newton-provider.wit -o policy.wasm policy.js \
//     -d stdio random clocks http fetch-event

import { fetch as httpFetch } from "newton:provider/http@0.2.0";

const ENDPOINT = "https://lazarus-exposure-demo-git-main-k-93d6.vercel.app/api/screen";

// Sentinel for "no exposure found". Rego comparisons against null are awkward,
// and a number larger than any reachable distance is unambiguous.
const NO_EXPOSURE = 99;

function fail(reason) {
  return JSON.stringify({
    screened: false,
    wallet: "",
    direct_match: false,
    exposure: false,
    hop_count: NO_EXPOSURE,
    matched_wallet: "",
    error: reason,
  });
}

export function run(wasm_args) {
  let args;
  try {
    args = JSON.parse(wasm_args);
  } catch (e) {
    return fail("wasm_args is not valid JSON");
  }

  const address = String(args.address || "").toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(address)) {
    return fail("address is not a 42-character Ethereum address");
  }

  const result = httpFetch({
    url: `${ENDPOINT}?address=${address}`,
    method: "GET",
    headers: [["Accept", "application/json"]],
    body: null,
  });

  if (result.tag === "err") {
    return fail(`screening service unreachable: ${result.val}`);
  }

  const response = result.val;
  if (response.status !== 200) {
    return fail(`screening service returned status ${response.status}`);
  }

  let body;
  try {
    body = JSON.parse(new TextDecoder().decode(new Uint8Array(response.body)));
  } catch (e) {
    return fail("screening service returned unparseable JSON");
  }

  // The service fails closed on its own side too. Carry that through rather
  // than treating a failed screening as an absence of exposure.
  if (body.status === "SCREENING_FAILED" || body.status === "INVALID_ADDRESS") {
    return fail(body.reason || body.status);
  }

  return JSON.stringify({
    screened: true,
    wallet: String(body.wallet || ""),
    direct_match: body.direct_match === true,
    exposure: body.exposure === true,
    hop_count: typeof body.hop_count === "number" ? body.hop_count : NO_EXPOSURE,
    matched_wallet: String(body.matched_wallet || ""),
  });
}
