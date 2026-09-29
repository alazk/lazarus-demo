// scripts/classify07.mjs — say what each address actually is onchain, and for a
// policy client decode its policy set so the rule it enforces names the env var
// it belongs to. Views only; deploys nothing.
// Usage: node scripts/classify07.mjs [address …]
import { createPublicClient, http, getAddress, hexToString, isAddress } from "viem";
import { sepolia } from "viem/chains";

const RPC = process.env.SEPOLIA_RPC_URL && process.env.SEPOLIA_RPC_URL !== "[SENSITIVE]"
  ? process.env.SEPOLIA_RPC_URL : "https://ethereum-sepolia-rpc.publicnode.com";
const FACTORY_07 = "0x8dd5984f8f626a2fd1c61872217d1f8269a831da";
const FACTORY_OLD = "0xdfd5ac2d40fa29985995a2f358f53e64cdff3b62";
const CLIENT_IFACE = "0xf67e14d6";

const CANDIDATES = [
  "0x749753713fc04bbdb5daf9c66cde293512fe0ee7",
  "0x23cb3d02c653b14278950ca5af3771823a675237",
  "0xfd054556b4d00d8b0f897b1ae377ecd17fccae78",
  "0x931602573f1c3d24a11afd9263ffc97ade595654",
  "0x0710868cba0a72453e9f1a955cf917d3a7a6951a",
  "0x1160ac847c1f13195875a106e6bebb9ac23e25b2",
  "0x3286ab6cd3eee550f851fc584e4f4d99f0269fea",
  "0xf5c9d9eddcb85395e4d53db309ae3e915ad3897d",
  "0xddd3ac3cee21a096407e3d9c921908db1fb743d2",
  "0xea89c1b6d90bda86af9024e9d63c905a365437b7",
  "0xbf49966c6accafb579101bd1b01ffddaadc823e3",
  "0x990a6e4f57a2561a744eec169e3fa92dba098682",
  "0x8bf8cd7f001d0584f98f53a3d82ed0ba498cc3de",
  "0x7d0371875617d103c8cc28e257125869fa341008",
  "0x618627398db4ef5091463bd9bd23bc05ce38675c",
  "0x46b43286c9c4ac7146c548deff21f4aa780a4ffe",
  "0x439dbbd47dcac62e58aa499da5338b63ae57a974",
  "0x175d44451403edf28469df03a9280c1197adb92c",
  "0x1fc2e37e99ae7ac11353f183d7bfbb8105148bdf",
  "0x0dbd6e44a1814f5efe4f67a00b7f28642e3064dd",
  "0x8b4ba8708239757e84ad26a503500bc5fc1c1a48",
  "0x5a46a90e0b26ed56201f24620dbf701d53433bb8",
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
  { type:"function", name:"getPolicyId", inputs:[], outputs:[{type:"bytes32"}], stateMutability:"view" },
  { type:"function", name:"supportsInterface", inputs:[{type:"bytes4"}], outputs:[{type:"bool"}], stateMutability:"view" },
];
const policyAbi = [
  { type:"function", name:"version", inputs:[], outputs:[{type:"string"}], stateMutability:"view" },
  { type:"function", name:"factory", inputs:[], outputs:[{type:"address"}], stateMutability:"view" },
  { type:"function", name:"owner", inputs:[], outputs:[{type:"address"}], stateMutability:"view" },
  { type:"function", name:"getWasmCid", inputs:[], outputs:[{type:"string"}], stateMutability:"view" },
  { type:"function", name:"getEntrypoint", inputs:[], outputs:[{type:"string"}], stateMutability:"view" },
];
const factoryAbi = [
  { type:"function", name:"getAllPoliciesByOwner", inputs:[{type:"address"}], outputs:[{type:"address[]"}], stateMutability:"view" },
];

const pc = createPublicClient({ chain: sepolia, transport: http(RPC) });
const read = async (address, abi, functionName, args = []) => {
  try { return await pc.readContract({ address, abi, functionName, args }); } catch { return undefined; }
};
function ruleOf(hex) {
  if (!hex || hex === "0x") return null;
  try { const o = JSON.parse(hexToString(hex)); if (o && typeof o === "object") return o; } catch {}
  return null;
}
function envNameFor(rule) {
  if (!rule) return null;
  const h = Number(rule.max_hops), u = Number(rule.min_exposure_usd);
  if (!Number.isFinite(h) || !Number.isFinite(u)) return null;
  const v = u === 0 ? "V0" : u === 100000 ? "V100K" : u === 1000000 ? "V1M" : `V${u}`;
  if (h === 3 && u === 0) return "NEWTON_POLICY_CLIENT";
  return `NEWTON_POLICY_CLIENT_H${h}${v}`;
}

const list = (process.argv.slice(2).length ? process.argv.slice(2) : CANDIDATES)
  .filter(isAddress).map((a) => getAddress(a));
console.log(`RPC ${RPC}\nchecking ${list.length} address(es)\n`);

const clients = [], policies = [], preClients = [], others = [], eoas = [];
const owners = new Set();

for (const a of list) {
  const code = await pc.getCode({ address: a }).catch(() => null);
  if (!code || code === "0x") { eoas.push(a); continue; }

  const pols = await read(a, clientAbi, "getPolicies");
  if (pols !== undefined) {
    const owner = await read(a, clientAbi, "getOwner");
    const rev = await read(a, clientAbi, "policyRevision");
    const iface = await read(a, clientAbi, "supportsInterface", [CLIENT_IFACE]);
    if (owner) owners.add(getAddress(owner));
    clients.push({ a, owner: owner && getAddress(owner), rev, iface,
      specs: pols.map((s) => ({ policy: getAddress(s.policy), rule: ruleOf(s.config.policyParams),
        raw: s.config.policyParams, expireAfter: s.config.expireAfter })) });
    continue;
  }
  const ver = await read(a, policyAbi, "version");
  const fac = await read(a, policyAbi, "factory");
  if (ver !== undefined && fac !== undefined) {
    const owner = await read(a, policyAbi, "owner");
    if (owner) owners.add(getAddress(owner));
    policies.push({ a, ver, fac: getAddress(fac), owner: owner && getAddress(owner),
      wasm: await read(a, policyAbi, "getWasmCid"), entry: await read(a, policyAbi, "getEntrypoint") });
    continue;
  }
  const owner = await read(a, clientAbi, "getOwner");
  const pid = await read(a, clientAbi, "getPolicyId");
  const tm = await read(a, clientAbi, "getNewtonPolicyTaskManager");
  if (owner !== undefined || pid !== undefined || tm !== undefined) {
    if (owner) owners.add(getAddress(owner));
    preClients.push({ a, owner: owner && getAddress(owner), pid, tm: tm && getAddress(tm) });
    continue;
  }
  others.push(a);
}

console.log(`=== 0.7 policy clients (${clients.length}) ===`);
for (const c of clients) {
  console.log(`\n  ${c.a}`);
  console.log(`    0.7 interface   ${c.iface === true ? "yes" : c.iface === false ? "NO" : "unreadable"}`);
  console.log(`    owner           ${c.owner ?? "unreadable"}`);
  if (c.rev !== undefined) console.log(`    revision        ${c.rev}`);
  if (!c.specs.length) console.log(`    policy set      EMPTY, needs setPolicies`);
  for (const s of c.specs) {
    console.log(`    policy          ${s.policy}`);
    console.log(`    params          ${s.rule ? JSON.stringify(s.rule) : (s.raw === "0x" ? "(empty)" : s.raw.slice(0, 60) + "…")}`);
    const env = envNameFor(s.rule);
    if (env) console.log(`    -> env var      ${env}`);
    console.log(`    expireAfter     ${s.expireAfter}`);
  }
}
if (!clients.length) console.log("  none");

console.log(`\n=== pre-0.7 policy clients (${preClients.length}) ===`);
for (const c of preClients) {
  console.log(`\n  ${c.a}`);
  console.log(`    no getPolicies(), so 0.7 rejects it`);
  console.log(`    owner           ${c.owner ?? "unreadable"}`);
  if (c.pid) console.log(`    policyId        ${c.pid}`);
  if (c.tm) console.log(`    taskManager     ${c.tm}`);
}
if (!preClients.length) console.log("  none");

console.log(`\n=== policies (${policies.length}) ===`);
for (const p of policies) {
  console.log(`\n  ${p.a}`);
  console.log(`    version         ${p.ver}`);
  console.log(`    factory         ${p.fac}${p.fac.toLowerCase() === FACTORY_OLD ? "  (pre-0.7 factory)" : p.fac.toLowerCase() === FACTORY_07 ? "  (0.7 factory)" : ""}`);
  console.log(`    owner           ${p.owner ?? "unreadable"}`);
  if (p.entry) console.log(`    entrypoint      ${p.entry}`);
  if (p.wasm) console.log(`    wasmCid         ${p.wasm}`);
}
if (!policies.length) console.log("  none");

console.log(`\n=== other contracts (${others.length}) ===`);
console.log(others.length ? others.map((a) => "  " + a).join("\n") : "  none");
console.log(`\n=== wallets, no code (${eoas.length}) ===`);
console.log(eoas.length ? eoas.map((a) => "  " + a).join("\n") : "  none");

for (const owner of owners) {
  for (const [label, f] of [["0.7 factory", FACTORY_07], ["pre-0.7 factory", FACTORY_OLD]]) {
    const got = await read(f, factoryAbi, "getAllPoliciesByOwner", [owner]);
    if (got === undefined) continue;
    console.log(`\n=== policies ${owner} owns on the ${label} ===`);
    console.log(got.length ? got.map((x) => "  " + getAddress(x)).join("\n") : "  none");
  }
}

console.log("\n" + "=".repeat(64));
console.log(`0.7 clients: ${clients.filter((c) => c.iface === true).length}`);
console.log(`clients needing redeployment: ${preClients.length + clients.filter((c) => c.iface !== true).length}`);
console.log(`policies not from the 0.7 factory: ${policies.filter((p) => p.fac.toLowerCase() !== FACTORY_07).length}`);
