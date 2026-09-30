// scripts/check07.mjs — read the live Sepolia state of the Lazarus policy and
// its clients, and say which of them protocol 0.7 rejects. Views only.
import { readFileSync } from "node:fs";
import { createPublicClient, http, getAddress, hexToString, isAddress } from "viem";
import { sepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

for (const f of [".env.local", ".env"]) {
  try {
    for (const line of readFileSync(f, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (!m) continue;
      const v = m[2].trim().replace(/^["']|["']$/g, "");
      // `vercel env pull` writes [SENSITIVE] for values it will not hand back.
      if (v === "[SENSITIVE]" || v === "") continue;
      if (!process.env[m[1]]) process.env[m[1]] = v;
    }
  } catch {}
}

const RPC = process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
const FACTORY = process.env.NEWTON_POLICY_FACTORY || "0x8dd5984f8f626a2fd1c61872217d1f8269a831da";
const CLIENT_IFACE = "0xf67e14d6";
const CLIENT_VARS = [
  ["NEWTON_POLICY_CLIENT", "3 hops, any value (default)"],
  ["NEWTON_POLICY_CLIENT_H1V0", "1 hop, any value"],
  ["NEWTON_POLICY_CLIENT_H2V0", "2 hops, any value"],
  ["NEWTON_POLICY_CLIENT_H1V100K", "1 hop, $100k floor"],
  ["NEWTON_POLICY_CLIENT_H1V1M", "1 hop, $1m floor"],
  ["NEWTON_POLICY_CLIENT_H2V1M", "2 hops, $1m floor"],
  ["NEWTON_POLICY_CLIENT_H3V100K", "3 hops, $100k floor"],
  ["NEWTON_POLICY_CLIENT_H3V1M", "3 hops, $1m floor"],
  ["NEWTON_POLICY_CLIENT_100K", "unclear, $100k floor"],
  ["NEWTON_POLICY_CLIENT_1M", "unclear, $1m floor"],
];

const POLICY_SPEC = { type: "tuple[]", components: [
  { name: "policy", type: "address" },
  { name: "config", type: "tuple", components: [
    { name: "policyParams", type: "bytes" }, { name: "expireAfter", type: "uint32" } ] } ] };
const clientAbi = [
  { type:"function", name:"getPolicies", inputs:[], outputs:[POLICY_SPEC], stateMutability:"view" },
  { type:"function", name:"getOwner", inputs:[], outputs:[{type:"address"}], stateMutability:"view" },
  { type:"function", name:"getNewtonPolicyTaskManager", inputs:[], outputs:[{type:"address"}], stateMutability:"view" },
  { type:"function", name:"policyRevision", inputs:[], outputs:[{type:"uint64"}], stateMutability:"view" },
  { type:"function", name:"supportsInterface", inputs:[{type:"bytes4"}], outputs:[{type:"bool"}], stateMutability:"view" },
];
const policyAbi = [
  { type:"function", name:"version", inputs:[], outputs:[{type:"string"}], stateMutability:"view" },
  { type:"function", name:"factory", inputs:[], outputs:[{type:"address"}], stateMutability:"view" },
  { type:"function", name:"owner", inputs:[], outputs:[{type:"address"}], stateMutability:"view" },
  { type:"function", name:"getWasmCid", inputs:[], outputs:[{type:"string"}], stateMutability:"view" },
];
const factoryAbi = [
  { type:"function", name:"version", inputs:[], outputs:[{type:"string"}], stateMutability:"view" },
  { type:"function", name:"isPolicy", inputs:[{type:"address"}], outputs:[{type:"bool"}], stateMutability:"view" },
  { type:"function", name:"getAllPoliciesByOwner", inputs:[{type:"address"}], outputs:[{type:"address[]"}], stateMutability:"view" },
];

const pc = createPublicClient({ chain: sepolia, transport: http(RPC) });
const problems = [];
const note = (s) => problems.push(s);
async function tryRead(address, abi, functionName, args = []) {
  try { return { ok: true, value: await pc.readContract({ address, abi, functionName, args }) }; }
  catch (e) { return { ok: false, error: String(e.shortMessage || e.message || e).split("\n")[0] }; }
}
function paramsText(hex) {
  if (!hex || hex === "0x") return "(empty)";
  try { const s = hexToString(hex); if (/^[\x20-\x7e\s]+$/.test(s)) return s; } catch {}
  return hex.length > 66 ? hex.slice(0, 66) + "…" : hex;
}
const is07 = (v) => /^0\.(7|8|9)|^[1-9]/.test(v);

console.log(`RPC     ${RPC.replace(/\/[A-Za-z0-9_-]{16,}$/, "/…")}`);
let wallet = null;
if (process.env.DEMO_PRIVATE_KEY) {
  try {
    const k = process.env.DEMO_PRIVATE_KEY.startsWith("0x") ? process.env.DEMO_PRIVATE_KEY : "0x" + process.env.DEMO_PRIVATE_KEY;
    wallet = privateKeyToAccount(k).address;
    console.log(`wallet  ${wallet}  (from DEMO_PRIVATE_KEY)`);
  } catch { note("DEMO_PRIVATE_KEY is set but is not a usable key"); }
} else if (process.env.NEWTON_OWNER && isAddress(process.env.NEWTON_OWNER)) {
  wallet = getAddress(process.env.NEWTON_OWNER);
  console.log(`wallet  ${wallet}  (from NEWTON_OWNER)`);
} else console.log("wallet  not checked (set DEMO_PRIVATE_KEY or NEWTON_OWNER)");

let chainId = null, rpcError = null;
try { chainId = await pc.getChainId(); } catch (e) { rpcError = String(e.shortMessage || e.message).split("\n")[0]; }
if (chainId !== 11155111) {
  console.log(rpcError
    ? `\nThe RPC did not answer: ${rpcError}\nSet SEPOLIA_RPC_URL to a reachable Sepolia endpoint.`
    : `\nThe RPC answered chainId ${chainId}, not Sepolia (11155111).`);
  process.exit(1);
}

console.log(`\n=== factory ${FACTORY} ===`);
const fVer = await tryRead(FACTORY, factoryAbi, "version");
console.log(`  version           ${fVer.ok ? fVer.value : "unreadable: " + fVer.error}`);
if (fVer.ok && !is07(fVer.value)) note(`factory ${FACTORY} reports version ${fVer.value}, not 0.7 or later`);

const policySeen = new Map();
for (const [envVar, label] of CLIENT_VARS) {
  const raw = process.env[envVar];
  console.log(`\n=== ${envVar}  (${label}) ===`);
  if (!raw) { console.log("  unset"); continue; }
  if (!isAddress(raw)) { console.log(`  not an address: ${raw}`); note(`${envVar} is not an address`); continue; }
  const a = getAddress(raw);
  console.log(`  address           ${a}`);
  const code = await pc.getCode({ address: a }).catch(() => null);
  if (!code || code === "0x") { console.log("  NO CONTRACT at this address"); note(`${envVar} points at an address with no contract`); continue; }
  const iface = await tryRead(a, clientAbi, "supportsInterface", [CLIENT_IFACE]);
  const gp = await tryRead(a, clientAbi, "getPolicies");
  console.log(`  supportsInterface ${iface.ok ? (iface.value ? "yes" : "NO") : "unreadable"}  (${CLIENT_IFACE})`);
  console.log(`  getPolicies()     ${gp.ok ? `${gp.value.length} policy(ies)` : "NOT PRESENT  <- pre-0.7 client"}`);
  if (!gp.ok) note(`${envVar} (${a}) has no getPolicies(); pre-0.7 client, must be redeployed`);
  else if (gp.value.length === 0) note(`${envVar} (${a}) is a 0.7 client with an empty policy set; call setPolicies`);
  else {
    for (const s of gp.value) {
      const p = getAddress(s.policy);
      console.log(`    policy          ${p}`);
      console.log(`    params          ${paramsText(s.config.policyParams)}`);
      console.log(`    expireAfter     ${s.config.expireAfter}`);
      policySeen.set(p, (policySeen.get(p) || []).concat(envVar));
    }
    const rev = await tryRead(a, clientAbi, "policyRevision");
    if (rev.ok) console.log(`  policyRevision    ${rev.value}`);
  }
  const owner = await tryRead(a, clientAbi, "getOwner");
  if (owner.ok) {
    const o = getAddress(owner.value);
    const match = wallet && o === getAddress(wallet);
    console.log(`  getOwner()        ${o}${wallet ? (match ? "  matches your key" : "  DOES NOT MATCH your key") : ""}`);
    if (wallet && !match) note(`${envVar} is owned by ${o}, not ${wallet}; gateway returns 401 unless the owner is the wallet behind NEWTON_API_KEY`);
  }
  const tm = await tryRead(a, clientAbi, "getNewtonPolicyTaskManager");
  if (tm.ok) console.log(`  taskManager       ${getAddress(tm.value)}`);
}

if (process.env.NEWTON_POLICY && isAddress(process.env.NEWTON_POLICY)) {
  const p = getAddress(process.env.NEWTON_POLICY);
  if (!policySeen.has(p)) policySeen.set(p, ["NEWTON_POLICY"]);
}
for (const [a, usedBy] of policySeen) {
  console.log(`\n=== policy ${a} ===`);
  console.log(`  referenced by     ${usedBy.join(", ")}`);
  const code = await pc.getCode({ address: a }).catch(() => null);
  if (!code || code === "0x") { console.log("  NO CONTRACT at this address"); note(`policy ${a} has no contract`); continue; }
  const ver = await tryRead(a, policyAbi, "version");
  const fac = await tryRead(a, policyAbi, "factory");
  const own = await tryRead(a, policyAbi, "owner");
  const wasm = await tryRead(a, policyAbi, "getWasmCid");
  console.log(`  version           ${ver.ok ? ver.value : "unreadable"}${ver.ok && !is07(ver.value) ? "  <- pre-0.7 policy" : ""}`);
  console.log(`  factory           ${fac.ok ? getAddress(fac.value) : "unreadable"}`);
  if (own.ok) console.log(`  owner             ${getAddress(own.value)}`);
  if (wasm.ok) console.log(`  wasmCid           ${wasm.value}`);
  if (ver.ok && !is07(ver.value)) note(`policy ${a} is version ${ver.value}; redeploy through the 0.7 factory`);
  if (fac.ok && getAddress(fac.value) !== getAddress(FACTORY)) note(`policy ${a} came from factory ${getAddress(fac.value)}, not the 0.7 factory`);
  const known = await tryRead(FACTORY, factoryAbi, "isPolicy", [a]);
  if (known.ok) { console.log(`  factory.isPolicy  ${known.value ? "yes" : "NO"}`); if (!known.value) note(`the 0.7 factory does not recognise policy ${a}`); }
}
if (wallet) {
  const mine = await tryRead(FACTORY, factoryAbi, "getAllPoliciesByOwner", [wallet]);
  if (mine.ok) {
    console.log(`\n=== policies your key already owns on the 0.7 factory ===`);
    console.log(mine.value.length ? mine.value.map((x) => "  " + getAddress(x)).join("\n") : "  none yet");
  }
}
console.log("\n" + "=".repeat(64));
if (!CLIENT_VARS.some(([v]) => process.env[v])) {
  console.log("No client addresses were available, so nothing was checked.");
  console.log("Export them, or put them in .env.local, and run again.");
  process.exit(2);
}
if (!problems.length) console.log("Nothing here blocks 0.7. If tasks still fail, the error is elsewhere.");
else { console.log(`${problems.length} thing(s) to fix:\n`); problems.forEach((p, i) => console.log(`  ${i + 1}. ${p}`)); }
