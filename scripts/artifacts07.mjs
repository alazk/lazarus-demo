// scripts/artifacts07.mjs — read the eight artifact fields the 0.7 factory's
// deployPolicy() takes, straight off the existing policies, then ask the factory
// where an identical policy would land. If that address already has code, the
// policy is already redeployed and there is nothing to deploy. Views only.
import { createPublicClient, http, getAddress, isAddress } from "viem";
import { sepolia } from "viem/chains";

const RPC = process.env.SEPOLIA_RPC_URL && process.env.SEPOLIA_RPC_URL !== "[SENSITIVE]"
  ? process.env.SEPOLIA_RPC_URL : "https://ethereum-sepolia-rpc.publicnode.com";
const FACTORY_07 = "0x8dd5984f8f626a2fd1c61872217d1f8269a831da";
const OWNER = getAddress(process.env.NEWTON_OWNER || "0x8b4bA8708239757e84aD26a503500Bc5fC1c1a48");

const SUBJECTS = process.argv.slice(2).length ? process.argv.slice(2) : [
  "0x931602573f1C3D24A11aFd9263Ffc97AdE595654",
  "0x5A46A90e0B26Ed56201F24620dbF701D53433BB8",
  "0x1160AC847c1F13195875A106E6bebB9ac23E25b2",
  "0x95c66b29DB62136094DC95e40C33cc524cFe4ba1",
];

const FIELDS = [
  ["entrypoint", ["getEntrypoint", "entrypoint"], "string"],
  ["policyCid", ["getPolicyCid", "policyCid"], "string"],
  ["schemaCid", ["getSchemaCid", "schemaCid"], "string"],
  ["wasmCid", ["getWasmCid", "wasmCid"], "string"],
  ["secretsSchemaCid", ["getSecretsSchemaCid", "secretsSchemaCid"], "string"],
  ["metadataCid", ["getMetadataCid", "metadataCid"], "string"],
  ["policyCodeHash", ["getPolicyCodeHash", "policyCodeHash"], "bytes32"],
];
const extra = [["version", "string"], ["factory", "address"], ["owner", "address"]];

const factoryAbi = [
  { type:"function", name:"computePolicyAddress", stateMutability:"view",
    inputs:[{name:"_entrypoint",type:"string"},{name:"_policyCid",type:"string"},
      {name:"_schemaCid",type:"string"},{name:"_wasmCid",type:"string"},
      {name:"_secretsSchemaCid",type:"string"},{name:"_metadataCid",type:"string"},
      {name:"_owner",type:"address"},{name:"_policyCodeHash",type:"bytes32"}],
    outputs:[{name:"predicted",type:"address"}] },
  { type:"function", name:"isPolicy", inputs:[{type:"address"}], outputs:[{type:"bool"}], stateMutability:"view" },
];

const pc = createPublicClient({ chain: sepolia, transport: http(RPC) });
async function readAny(address, names, outType) {
  for (const name of names) {
    const abi = [{ type:"function", name, inputs:[], outputs:[{type:outType}], stateMutability:"view" }];
    try { return { value: await pc.readContract({ address, abi, functionName: name }), via: name }; } catch {}
  }
  return null;
}

console.log(`RPC    ${RPC}`);
console.log(`owner  ${OWNER}\n`);
const read = [];

for (const raw of SUBJECTS) {
  if (!isAddress(raw)) { console.log(`skipping ${raw}, not an address`); continue; }
  const a = getAddress(raw);
  const code = await pc.getCode({ address: a }).catch(() => null);
  console.log(`=== ${a} ===`);
  if (!code || code === "0x") { console.log("  no contract here\n"); continue; }
  const meta = {};
  for (const [name, type] of extra) {
    const r = await readAny(a, [name], type);
    if (r) { meta[name] = r.value; console.log(`  ${name.padEnd(17)}${r.value}`); }
  }
  const args = {}; let complete = true;
  for (const [key, names, type] of FIELDS) {
    const r = await readAny(a, names, type);
    if (r === null) { complete = false; console.log(`  ${key.padEnd(17)}UNREADABLE`); continue; }
    args[key] = r.value;
    console.log(`  ${key.padEnd(17)}${r.value === "" ? '""  (empty)' : r.value}   [via ${r.via}()]`);
  }
  console.log();
  read.push({ address: a, meta, args, complete });
}

console.log("=".repeat(68));
console.log("Where each of these would land on the 0.7 factory\n");
for (const p of read) {
  if (!p.complete) { console.log(`  ${p.address}  artifacts incomplete, cannot predict\n`); continue; }
  const a = p.args;
  let predicted;
  try {
    predicted = await pc.readContract({ address: FACTORY_07, abi: factoryAbi,
      functionName: "computePolicyAddress",
      args: [a.entrypoint, a.policyCid, a.schemaCid, a.wasmCid, a.secretsSchemaCid, a.metadataCid, OWNER, a.policyCodeHash] });
  } catch (e) {
    console.log(`  ${p.address}  could not predict: ${String(e.shortMessage || e.message).split("\n")[0]}\n`); continue;
  }
  predicted = getAddress(predicted);
  const code = await pc.getCode({ address: predicted }).catch(() => null);
  const known = await pc.readContract({ address: FACTORY_07, abi: factoryAbi, functionName: "isPolicy", args: [predicted] }).catch(() => undefined);
  console.log(`  source     ${p.address}  (${p.args.entrypoint})`);
  console.log(`  predicted  ${predicted}`);
  console.log(`  deployed   ${code && code !== "0x" ? "YES, already exists" : "no, would need deploying"}` +
              (known === undefined ? "" : `   factory.isPolicy=${known}`));
  console.log();
}
for (const p of read) {
  if (!p.complete) continue;
  const a = p.args;
  console.log("-".repeat(68));
  console.log(`deployPolicy arguments taken from ${p.address}:`);
  console.log(JSON.stringify({ entrypoint:a.entrypoint, policyCid:a.policyCid, schemaCid:a.schemaCid,
    wasmCid:a.wasmCid, secretsSchemaCid:a.secretsSchemaCid, metadataCid:a.metadataCid,
    owner:OWNER, policyCodeHash:a.policyCodeHash }, null, 2));
}
