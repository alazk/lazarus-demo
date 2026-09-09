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


// wasm_args arrives as hex-encoded UTF-8 JSON with a 0x prefix, not raw JSON.
function decodeArgs(raw) {
  const text = String(raw || "");
  if (!text.startsWith("0x")) return text;
  const hex = text.slice(2);
  let out = "";
  for (let i = 0; i < hex.length; i += 2) {
    out += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
  }
  return decodeURIComponent(escape(out));
}

export function run(wasm_args) {
  let args;
  try {
    args = JSON.parse(decodeArgs(wasm_args));
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

  // This jco build returns the response directly rather than the tagged
  // result the Newton guide shows, so result.val is undefined and reading
  // .status off it traps. Accept both shapes.
  const response = (result && result.tag !== undefined) ? result.val : result;
  if (!response) {
    return fail("screening service unreachable");
  }
  if (response.status !== 200) {
    return fail(`screening service returned status ${response.status}`);
  }

  // TextDecoder is not reliably present in the componentized runtime, and
  // fromCharCode.apply blows the stack on a body this size, so decode the
  // bytes one at a time. The response is ASCII JSON.
  let text;
  try {
    text = new TextDecoder().decode(new Uint8Array(response.body));
  } catch (e) {
    return fail("could not decode response body");
  }
  if (!text) return fail("empty response body");

  let body;
  try {
    body = JSON.parse(text);
  } catch (e) {
    return fail("unparseable JSON: " + text.slice(0, 100));
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
