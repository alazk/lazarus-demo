// scripts/why-unattested.mjs — find out why checks come back "Not attested".
// Read-only except step 4, which submits one ordinary task, exactly what the
// demo does for every check. Needs NEWTON_API_KEY in the environment.
//
//   node scripts/why-unattested.mjs            wallet B under Policy A
//   node scripts/why-unattested.mjs 0x… 3      any wallet, any policy (1, 2, 3 or 0 for D)
import fs from "node:fs";
import { createPublicClient, http, getAddress } from "viem";
import { sepolia } from "viem/chains";

const KEY = process.env.NEWTON_API_KEY;
if (!KEY) { console.log("Set NEWTON_API_KEY first (the same key as in Vercel)."); process.exit(1); }
const GATEWAY = process.env.NEWTON_GATEWAY_URL || "https://gateway.testnet.newton.xyz/rpc";
const RPC = process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
const wallet = (process.argv[2] || "0x0a3b4bde9116a950a036204bf0d7a16d285f8995").toLowerCase();
const hops = Number(process.argv[3] ?? 1);

const record = JSON.parse(fs.readFileSync("policy/out/clients.sepolia.json", "utf8"));
const byHops = { 1: record.h1v0, 2: record.h2v0, 3: record.h3v0, 0: record.allow };
const client = byHops[hops];
if (!client) { console.log(`No recorded client for policy with ${hops} hops.`); process.exit(1); }

const ok = (s) => console.log(`  ok    ${s}`);
const bad = (s) => console.log(`  FAIL  ${s}`);
const findings = [];

// 1. The oracle's own data source, as the operators reach it: anonymously.
console.log("\n1. The screening endpoint the policy's oracle calls");
const policyJs = fs.readFileSync("policy/policy.js", "utf8");
const ENDPOINT = (policyJs.match(/const ENDPOINT = "([^"]+)"/) || [])[1];
console.log(`  ${ENDPOINT}`);
if (hops === 0) ok("Policy D has no oracle, so this does not apply to it");
else try {
  const t0 = Date.now();
  const r = await fetch(`${ENDPOINT}?address=${wallet}`, { signal: AbortSignal.timeout(30000) });
  const text = await r.text();
  let body = null; try { body = JSON.parse(text); } catch {}
  const ms = Date.now() - t0;
  if (r.status === 200 && body && body.wallet) ok(`HTTP 200 in ${ms} ms, decision ${body.decision}, ${body.hop_count ?? "no"} hops`);
  else { bad(`HTTP ${r.status} in ${ms} ms: ${text.slice(0, 160).replace(/\s+/g, " ")}`);
    findings.push("The oracle cannot read its screening endpoint. If that Vercel project was moved, deleted or put behind deployment protection, the operators cannot screen and every task fails."); }
  if (ms > 20000) findings.push(`The screening endpoint took ${ms} ms. Operators give the oracle a limited time; slow answers fail the task.`);
} catch (e) { bad(`no answer: ${e.message}`); findings.push("The oracle's screening endpoint does not answer at all."); }

// 2. What the client is bound to onchain right now.
console.log(`\n2. Policy client ${client.address}`);
const pc = createPublicClient({ chain: sepolia, transport: http(RPC) });
const SPEC = { type: "tuple[]", components: [{ name: "policy", type: "address" }, { name: "config", type: "tuple", components: [{ name: "policyParams", type: "bytes" }, { name: "expireAfter", type: "uint32" }] }] };
const abi = [
  { type: "function", name: "getPolicies", inputs: [], outputs: [SPEC], stateMutability: "view" },
  { type: "function", name: "policyRevision", inputs: [], outputs: [{ type: "uint64" }], stateMutability: "view" },
  { type: "function", name: "getOwner", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
];
try {
  const [set, rev, owner] = await Promise.all(["getPolicies", "policyRevision", "getOwner"].map((f) => pc.readContract({ address: client.address, abi, functionName: f })));
  const bound = getAddress(set[0].policy);
  const params = Buffer.from(set[0].config.policyParams.slice(2), "hex").toString("utf8");
  console.log(`  policy   ${bound}\n  params   ${params}\n  revision ${rev}\n  owner    ${owner}`);
  if (bound !== getAddress(client.policy)) { bad(`bound to ${bound}, but the record says ${client.policy}`);
    findings.push("The client was repointed to a different policy. The deployer wallet is shared, so another team's script may have done it again. Re-run scripts/repoint07.mjs."); }
  else ok("bound to the recorded policy");
  if (record.h1v0 && Number(rev) > 2 && hops !== 0) findings.push(`The client's policy set is at revision ${rev}; ours was set at revision 2. Something changed it.`);
} catch (e) { bad(`could not read the client: ${e.shortMessage || e.message}`); findings.push("The client contract does not answer the 0.7 interface. A protocol upgrade may have changed it again."); }

const intent = { from: "0x0000000000000000000000000000000000000000", to: wallet, value: "0x0", data: "0x", chain_id: "0x" + sepolia.id.toString(16), function_signature: "" };
// Policy D is pure Rego: the gateway wants its wasm_args entry empty.
let wasm_args = [hops === 0 ? "0x" : "0x" + Buffer.from(JSON.stringify({ address: wallet }), "utf8").toString("hex")];
async function call(method, params, timeout = 75000) {
  const t0 = Date.now();
  const r = await fetch(GATEWAY, { method: "POST", signal: AbortSignal.timeout(timeout),
    headers: { "content-type": "application/json", authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ jsonrpc: "2.0", id: crypto.randomUUID(), method, params }) });
  const text = await r.text();
  return { status: r.status, ms: Date.now() - t0, text, body: (() => { try { return JSON.parse(text); } catch { return null; } })() };
}

// 3. A simulation: the policy evaluated, nothing signed.
console.log("\n3. Gateway simulation (nothing is signed)");
try {
  const s = await call("newt_simulatePolicy", { policy_client: client.address, chain_id: sepolia.id, intent, wasm_args });
  if (s.status === 401) { bad("HTTP 401"); findings.push("The gateway refuses the API key. Check NEWTON_API_KEY in Vercel, and that the client owner is the wallet behind that key."); }
  else if (s.body?.error) { bad(`gateway error: ${JSON.stringify(s.body.error).slice(0, 300)}`); findings.push("The gateway returns an error even for a simulation."); }
  else ok(`HTTP ${s.status} in ${s.ms} ms, allowed = ${s.body?.result?.allowed}`);
} catch (e) { bad(`no answer: ${e.message}`); findings.push("The Newton gateway does not answer. It may be down."); }

// 4. A real task, exactly as the demo submits it.
console.log("\n4. A real task, as the demo sends it");
try {
  let t = await call("newt_createTask", { policy_client: client.address, intent, wasm_args, timeout: 60 });
  if (hops === 0 && /must be empty/.test(JSON.stringify(t.body?.error ?? ""))) {
    console.log(`  "0x" refused as non-empty, retrying with ""`);
    wasm_args = [""];
    t = await call("newt_createTask", { policy_client: client.address, intent, wasm_args, timeout: 60 });
  }
  if (hops === 0 && !t.body?.error) console.log(`  sent wasm_args ${JSON.stringify(wasm_args)}`);
  const res = t.body?.result;
  if (t.status === 401) bad("HTTP 401");
  else if (t.body?.error) { bad(`gateway error after ${t.ms} ms: ${JSON.stringify(t.body.error).slice(0, 400)}`); findings.push("Task submission fails at the gateway. The error above says why."); }
  else if (!res || res.status !== "success") { bad(`task did not succeed after ${t.ms} ms: ${JSON.stringify(res?.error ?? res).slice(0, 400)}`); findings.push("The operators did not complete the task. The detail above says why."); }
  else ok(`attested in ${t.ms} ms, allowed = ${res.task_response?.allowed}, https://explorer.newton.xyz/testnet/task/${res.task_id}`);
  if (t.ms > 55000) findings.push(`The task took ${t.ms} ms. The demo gives up at 70 s, and Vercel may cut the function off sooner.`);
} catch (e) { bad(`no answer: ${e.message}`); findings.push(e.name === "TimeoutError" ? "The task did not finish within 75 s, so the demo times out." : "The task request failed outright."); }

console.log("\n=== verdict ===");
if (!findings.length) console.log("Everything answers now. The failure was probably passing; if it keeps happening, check the Vercel function log for the line starting 'attestation failed'.");
else findings.forEach((f, i) => console.log(`${i + 1}. ${f}`));
