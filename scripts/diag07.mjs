// scripts/diag07.mjs — ask the Newton gateway to simulate the Lazarus policy,
// without submitting a task or spending gas, and show what the oracle and the
// policy actually produce. Answers two questions:
//   1. Does the 0x prefix on wasm_args break the oracle input?
//   2. Does the policy run its oracle at all (its wasmCid is empty)?
//
// Needs NEWTON_API_KEY in the environment.

const KEY = process.env.NEWTON_API_KEY;
if (KEY === undefined || KEY === "" || KEY === "[SENSITIVE]") {
  console.log("Set NEWTON_API_KEY first."); process.exit(1);
}
const GATEWAY = process.env.NEWTON_GATEWAY_URL || "https://gateway.testnet.newton.xyz/rpc";
const CHAIN_ID = 11155111;

const POLICY = "0xcd23ab50D9a3867B9B75E72f7087B420d62BF65f";
const CLIENT = {
  1: "0x8a8F5389B1ab8Dee99829A9bB2E7b235809EaeC4",
  2: "0x426B922f21bdb1201Cac1470d224B6F9b92630fe",
  3: "0xAbe39aa25ffB4B13C15166D10a27E9132f207BE8",
};
const THREE = "0x1fc2e37e99ae7ac11353f183d7bfbb8105148bdf";
const CLEAN = "0x00000000219ab540356cbb839cbe05303d7705fa";

const argsFor = (addr) => Buffer.from(JSON.stringify({ address: addr }), "utf8").toString("hex");

async function rpc(method, params) {
  const resp = await fetch(GATEWAY, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${KEY}` },
    // The gateway rejects anything but a UUID string as the request id.
    body: JSON.stringify({ jsonrpc: "2.0", id: crypto.randomUUID(), method, params }),
  });
  const text = await resp.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 300) }; }
  return { http: resp.status, body };
}

const show = (v, n = 900) => {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > n ? s.slice(0, n) + " …" : s;
};

const intentFor = (to) => ({
  from: "0x0000000000000000000000000000000000000000",
  to, value: "0x0", data: "0x",
  chain_id: "0x" + CHAIN_ID.toString(16),
  function_signature: "",
});

// --- 1. Does the oracle run for this policy at all? ------------------------

console.log("=".repeat(72));
console.log("1. newt_simulatePolicyData on the policy itself (does its oracle run?)");
console.log("=".repeat(72));
for (const [label, wa] of [["unprefixed", argsFor(THREE)], ["0x-prefixed", "0x" + argsFor(THREE)]]) {
  const r = await rpc("newt_simulatePolicyData",
    { policy_address: POLICY, wasm_args: wa, chain_id: CHAIN_ID });
  console.log(`\n  [${label}] HTTP ${r.http}`);
  console.log("  " + show(r.body.error ?? r.body.result ?? r.body));
}

// --- 2. The full policy, through each client -------------------------------

const cases = [
  ["3-hop wallet, 2-hop client (should ALLOW)", THREE, 2],
  ["clean wallet, 3-hop client (should ALLOW)", CLEAN, 3],
  ["3-hop wallet, 3-hop client (should DENY)", THREE, 3],
];

console.log("\n" + "=".repeat(72));
console.log("2. newt_simulatePolicy through the client (the whole evaluation)");
console.log("=".repeat(72));
const verdicts = [];
for (const [label, wallet, h] of cases) {
  for (const [argLabel, wa] of [["unprefixed", argsFor(wallet)], ["0x-prefixed", "0x" + argsFor(wallet)]]) {
    const r = await rpc("newt_simulatePolicy", {
      policy_client: CLIENT[h], chain_id: CHAIN_ID, intent: intentFor(wallet), wasm_args: [wa],
    });
    const res = r.body.result;
    // The result is either a single outcome or a per-policy list.
    const list = Array.isArray(res) ? res : Array.isArray(res?.results) ? res.results
      : Array.isArray(res?.policies) ? res.policies : null;
    const allowed = list ? list.map((x) => x.allowed) : res?.allowed ?? res?.allow ?? null;
    console.log(`\n  ${label}  [${argLabel}]  HTTP ${r.http}`);
    console.log(`    allowed: ${JSON.stringify(allowed)}`);
    console.log("    " + show(r.body.error ?? res ?? r.body, 700));
    verdicts.push({ label, argLabel, allowed, error: r.body.error ? show(r.body.error, 120) : null });
  }
}

console.log("\n" + "=".repeat(72));
console.log("Summary");
console.log("=".repeat(72));
for (const v of verdicts) {
  console.log(`  ${v.argLabel.padEnd(12)} ${v.label.padEnd(44)} allowed=${JSON.stringify(v.allowed)}${v.error ? "  ERROR " + v.error : ""}`);
}
