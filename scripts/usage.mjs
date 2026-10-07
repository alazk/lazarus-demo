// scripts/usage.mjs — count the demo's signed checks from the Newton Explorer API.
// Read-only. Needs NEWTON_API_KEY (the same gw_ key the demo uses).
//
//   node ~/Desktop/lazarus-demo/scripts/usage.mjs   all time, from any folder
//   node scripts/usage.mjs --since 2026-10-06    from a date (UTC)
//   node scripts/usage.mjs --wallets       also fetch each task's intent to split
//                                          example wallets from wallets people typed in

const KEY = process.env.NEWTON_API_KEY;
if (!KEY) { console.log("Set NEWTON_API_KEY first."); process.exit(1); }
const API = "https://explorer.api.newton.xyz/v1";
const NET = process.env.NEWTON_NETWORK || "testnet";
const args = process.argv.slice(2);
const since = args.includes("--since") ? new Date(args[args.indexOf("--since") + 1] + "T00:00:00Z") : null;
const wantWallets = args.includes("--wallets");

// Inlined from policy/out/clients.sepolia.json and data/demo_wallets.json so this
// runs from any folder. Update here if a client is redeployed.
const CLIENTS = {
  "0x8a8f5389b1ab8dee99829a9bb2e7b235809eaec4": { letter: "A", policy: "0xcc3957c06472f9e599ed2eeba754d5854f23321b" },
  "0x426b922f21bdb1201cac1470d224b6f9b92630fe": { letter: "B", policy: "0xcc3957c06472f9e599ed2eeba754d5854f23321b" },
  "0xabe39aa25ffb4b13c15166d10a27e9132f207be8": { letter: "C", policy: "0xcc3957c06472f9e599ed2eeba754d5854f23321b" },
  "0x8eaa2e2795daf950211113b6d7e1d084c7fed0bb": { letter: "D", policy: "0x5ac862b6db3121b5ffa5f754045bda7b59d4b9c6" }
};
const clientLetter = {};
const policies = new Set();
for (const [addr, { letter, policy }] of Object.entries(CLIENTS)) { clientLetter[addr] = letter; policies.add(policy); }

const EXAMPLE = new Set([
  "0x0004a76e39d33edfeac7fc3c8d3994f54428a0be",
  "0x0a3b4bde9116a950a036204bf0d7a16d285f8995",
  "0x001139ead8b38f353c2151af48df7d3bf2363c9d",
  "0x1fc2e37e99ae7ac11353f183d7bfbb8105148bdf",
  "0x00000000219ab540356cbb839cbe05303d7705fa"
]);

async function get(path) {
  const r = await fetch(API + path, { headers: { authorization: `Bearer ${KEY}`, "x-protocol-network": NET } });
  if (!r.ok) throw new Error(`${r.status} ${path}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

// Every task under our two policies, newest first, until we pass --since.
const tasks = [];
for (const policy of policies) {
  for (let page = 1; ; page++) {
    const body = await get(`/policy/address/${policy}/task?page=${page}&size=100`);
    let stop = false;
    for (const t of body.results) {
      if (since && new Date(t.task_created_at) < since) { stop = true; break; }
      tasks.push(t);
    }
    if (stop || body.results.length < 100) break;
  }
}

const letterOf = (t) => clientLetter[(t.policy_client_address || "").toLowerCase()] || "other";
// evaluation_result is a 32-byte word: …0001 allowed, …0000 denied.
const outcome = (t) => {
  if (t.error || t.operator_errors?.length) return "failed";
  const r = String(t.evaluation_result ?? "").toLowerCase();
  if (/^0x0*1$/.test(r) || r === "true" || r === "allow") return "compliant";
  if (/^0x0+$/.test(r) || r === "false" || r === "deny") return "non-compliant";
  return t.task_responded_at ? r || "no result" : "pending";
};

if (wantWallets) {
  for (const t of tasks) {
    try { const d = await get(`/task/${t.id}`); t.wallet = (d.intent?.to || "").toLowerCase(); } catch { t.wallet = ""; }
  }
}

const count = (xs, f) => xs.reduce((m, x) => (m[f(x)] = (m[f(x)] || 0) + 1, m), {});
const pad = (s, n) => String(s).padEnd(n);
const sortedKeys = (m) => Object.keys(m).sort();

console.log(`\n${tasks.length} signed checks${since ? ` since ${since.toISOString().slice(0, 10)}` : ""} (${NET})`);

console.log("\nBy policy");
const byPolicy = count(tasks, letterOf);
for (const k of sortedKeys(byPolicy)) {
  const sub = count(tasks.filter((t) => letterOf(t) === k), outcome);
  console.log(`  ${pad("Policy " + k, 10)} ${pad(byPolicy[k], 6)} ${Object.entries(sub).map(([a, b]) => `${a} ${b}`).join(", ")}`);
}

console.log("\nBy day");
const byDay = count(tasks, (t) => t.task_created_at.slice(0, 10));
for (const k of sortedKeys(byDay)) console.log(`  ${k}  ${byDay[k]}`);

if (wantWallets) {
  const example = tasks.filter((t) => EXAMPLE.has(t.wallet)).length;
  const own = tasks.length - example;
  console.log(`\nWallets\n  example wallets  ${example}\n  typed in         ${own}`);
  const top = Object.entries(count(tasks.filter((t) => !EXAMPLE.has(t.wallet)), (t) => t.wallet))
    .sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (top.length) { console.log("  most checked, not an example:"); for (const [w, n] of top) console.log(`    ${w}  ${n}`); }
}

const slow = tasks.filter((t) => t.task_responded_at && new Date(t.task_responded_at) - new Date(t.task_created_at) > 30000).length;
if (slow) console.log(`\n${slow} check(s) took the operators more than 30 s.`);
console.log();
