// scripts/deploy07.mjs — redeploy the Lazarus policy through the 0.7 factory.
// Dry run unless you pass --execute. Artifacts are read off the existing 0.5
// policy rather than re-uploaded, so the Rego and oracle are unchanged.
import { createPublicClient, createWalletClient, http, getAddress } from "viem";
import { sepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

const RPC = process.env.SEPOLIA_RPC_URL && process.env.SEPOLIA_RPC_URL !== "[SENSITIVE]"
  ? process.env.SEPOLIA_RPC_URL : "https://ethereum-sepolia-rpc.publicnode.com";
const FACTORY_07 = getAddress(process.env.NEWTON_POLICY_FACTORY
  || "0x8dd5984f8f626a2fd1c61872217d1f8269a831da");
const SOURCE_POLICY = getAddress(process.env.LAZARUS_POLICY || "0x5A46A90e0B26Ed56201F24620dbF701D53433BB8");
const OWNER = getAddress(process.env.NEWTON_OWNER || "0x8b4bA8708239757e84aD26a503500Bc5fC1c1a48");
const REFERENCE_CLIENT = getAddress(process.env.REFERENCE_CLIENT || "0x57F4fB0a4A4b34eA51D47BC7c99c960b80A58D18");
const EXECUTE = process.argv.includes("--execute");

const POLICY_SPEC = { type: "tuple[]", components: [
  { name: "policy", type: "address" },
  { name: "config", type: "tuple", components: [
    { name: "policyParams", type: "bytes" }, { name: "expireAfter", type: "uint32" } ] } ] };
const strs = ["_entrypoint","_policyCid","_schemaCid","_wasmCid","_secretsSchemaCid","_metadataCid"]
  .map((name) => ({ name, type: "string" }));
const deployInputs = [...strs, { name: "_owner", type: "address" }, { name: "_policyCodeHash", type: "bytes32" }];
const factoryAbi = [
  { type:"function", name:"deployPolicy", stateMutability:"nonpayable", inputs: deployInputs, outputs:[{name:"policyAddr",type:"address"}] },
  { type:"function", name:"computePolicyAddress", stateMutability:"view", inputs: deployInputs, outputs:[{name:"predicted",type:"address"}] },
  { type:"function", name:"isPolicy", inputs:[{type:"address"}], outputs:[{type:"bool"}], stateMutability:"view" },
];
const clientAbi = [
  { type:"function", name:"getPolicies", inputs:[], outputs:[POLICY_SPEC], stateMutability:"view" },
  { type:"function", name:"getOwner", inputs:[], outputs:[{type:"address"}], stateMutability:"view" },
  { type:"function", name:"getNewtonPolicyTaskManager", inputs:[], outputs:[{type:"address"}], stateMutability:"view" },
  { type:"function", name:"policyRevision", inputs:[], outputs:[{type:"uint64"}], stateMutability:"view" },
  { type:"function", name:"supportsInterface", inputs:[{type:"bytes4"}], outputs:[{type:"bool"}], stateMutability:"view" },
];

const pc = createPublicClient({ chain: sepolia, transport: http(RPC) });
async function readAny(address, names, outType) {
  for (const name of names) {
    const abi = [{ type:"function", name, inputs:[], outputs:[{type:outType}], stateMutability:"view" }];
    try { return await pc.readContract({ address, abi, functionName: name }); } catch {}
  }
  return undefined;
}
const call = (address, functionName, args = [], abi = clientAbi) =>
  pc.readContract({ address, abi, functionName, args }).catch(() => undefined);

console.log(`RPC     ${RPC}`);
console.log(`mode    ${EXECUTE ? "EXECUTE, this will send a transaction" : "dry run, view calls only"}`);
console.log(`owner   ${OWNER}`);
console.log(`source  ${SOURCE_POLICY}\n`);

const entrypoint = await readAny(SOURCE_POLICY, ["getEntrypoint","entrypoint"], "string");
const policyCid = await readAny(SOURCE_POLICY, ["getPolicyCid","policyCid"], "string");
const schemaCid = await readAny(SOURCE_POLICY, ["getSchemaCid","schemaCid"], "string");
const metadataCid = await readAny(SOURCE_POLICY, ["getMetadataCid","metadataCid"], "string");
const codeHash = await readAny(SOURCE_POLICY, ["getPolicyCodeHash","policyCodeHash"], "bytes32");
const wasmCid = process.env.LAZARUS_WASM_CID ?? "";
const secretsSchemaCid = process.env.LAZARUS_SECRETS_SCHEMA_CID ?? "";

const missing = Object.entries({ entrypoint, policyCid, schemaCid, metadataCid, codeHash })
  .filter(([, v]) => v === undefined).map(([k]) => k);
if (missing.length) { console.log(`Cannot proceed: unreadable on the source policy: ${missing.join(", ")}`); process.exit(1); }

const args = [entrypoint, policyCid, schemaCid, wasmCid, secretsSchemaCid, metadataCid, OWNER, codeHash];
console.log("deployPolicy arguments");
console.log(`  entrypoint        ${entrypoint}`);
console.log(`  policyCid         ${policyCid}`);
console.log(`  schemaCid         ${schemaCid}`);
console.log(`  wasmCid           ${wasmCid === "" ? '""  (empty, as on the working 0.7 policy)' : wasmCid}`);
console.log(`  secretsSchemaCid  ${secretsSchemaCid === "" ? '""  (empty)' : secretsSchemaCid}`);
console.log(`  metadataCid       ${metadataCid}`);
console.log(`  owner             ${OWNER}`);
console.log(`  policyCodeHash    ${codeHash}\n`);

let predicted;
try {
  predicted = getAddress(await pc.readContract({ address: FACTORY_07, abi: factoryAbi, functionName: "computePolicyAddress", args }));
} catch (e) {
  console.log(`The factory would not predict an address: ${String(e.shortMessage || e.message).split("\n")[0]}`);
  console.log("That usually means one of the arguments is not acceptable to 0.7.");
  process.exit(1);
}
const existing = await pc.getCode({ address: predicted }).catch(() => null);
const alreadyThere = Boolean(existing && existing !== "0x");
console.log(`predicted policy address  ${predicted}`);
console.log(`already deployed          ${alreadyThere ? "YES" : "no"}`);
if (alreadyThere) {
  console.log(`  factory.isPolicy        ${await call(predicted, "isPolicy", [predicted], factoryAbi) ?? await pc.readContract({address:FACTORY_07,abi:factoryAbi,functionName:"isPolicy",args:[predicted]}).catch(()=>undefined)}`);
  console.log(`  version                 ${await readAny(predicted, ["version"], "string")}`);
  console.log("\nNothing to deploy. Use this address as the policy in setPolicies.");
}

console.log(`\n=== reference 0.7 client ${REFERENCE_CLIENT} ===`);
const rcode = await pc.getCode({ address: REFERENCE_CLIENT }).catch(() => null);
if (!rcode || rcode === "0x") console.log("  no contract there, so no reference available");
else {
  console.log(`  runtime bytecode  ${(rcode.length - 2) / 2} bytes`);
  const is1167 = /^0x363d3d373d3d3d363d73[0-9a-f]{40}5af43d82803e903d91602b57fd5bf3$/i.test(rcode);
  const slot = await pc.getStorageAt({ address: REFERENCE_CLIENT, slot: "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc" }).catch(() => null);
  const impl = slot && /[1-9a-f]/.test(slot.slice(26)) ? getAddress("0x" + slot.slice(26)) : null;
  const owner = await call(REFERENCE_CLIENT, "getOwner");
  const set = await call(REFERENCE_CLIENT, "getPolicies");
  console.log(`  EIP-1167 proxy    ${is1167 ? "yes" : "no"}`);
  console.log(`  ERC-1967 impl     ${impl ?? "none"}`);
  console.log(`  0.7 interface     ${await call(REFERENCE_CLIENT, "supportsInterface", ["0xf67e14d6"])}`);
  console.log(`  owner             ${owner ? getAddress(owner) : "unreadable"}${owner && getAddress(owner) === OWNER ? "   same as yours" : ""}`);
  const tm = await call(REFERENCE_CLIENT, "getNewtonPolicyTaskManager");
  console.log(`  taskManager       ${tm ? getAddress(tm) : "unreadable"}`);
  console.log(`  revision          ${await call(REFERENCE_CLIENT, "policyRevision")}`);
  if (Array.isArray(set)) {
    console.log(`  policy set        ${set.length} entry(ies)`);
    for (const s of set) console.log(`    ${getAddress(s.policy)}  expireAfter=${s.config.expireAfter}`);
  }
  console.log(is1167 || impl
    ? "\n  This is a proxy, so an identical client can be deployed without the source."
    : "\n  This is a bespoke contract, so our own clients need its Solidity source\n  (SanctionsDemoClient.sol) or an equivalent of our own.");
}

if (!EXECUTE) { console.log("\nDry run only. Re-run with --execute to deploy the policy."); process.exit(0); }
if (alreadyThere) { console.log("\nRefusing to deploy: that policy already exists."); process.exit(0); }
const key = process.env.DEMO_PRIVATE_KEY;
if (!key || key === "[SENSITIVE]") {
  console.log(`\nDEMO_PRIVATE_KEY is needed to execute, and must be the key for ${OWNER}`); process.exit(1);
}
const account = privateKeyToAccount(key.startsWith("0x") ? key : "0x" + key);
if (getAddress(account.address) !== OWNER) {
  console.log(`\nRefusing to deploy: that key is ${account.address}, but the owner is ${OWNER}.`);
  console.log("Deploying under a different owner would leave the gateway returning 401."); process.exit(1);
}
const balance = await pc.getBalance({ address: account.address });
console.log(`\nbalance ${Number(balance) / 1e18} ETH`);
if (balance === 0n) { console.log("No Sepolia ETH in that wallet."); process.exit(1); }
const wc = createWalletClient({ account, chain: sepolia, transport: http(RPC) });
console.log("sending deployPolicy…");
const hash = await wc.writeContract({ address: FACTORY_07, abi: factoryAbi, functionName: "deployPolicy", args });
console.log(`tx ${hash}`);
const receipt = await pc.waitForTransactionReceipt({ hash });
console.log(`status ${receipt.status}, block ${receipt.blockNumber}`);
if (receipt.status !== "success") process.exit(1);
const code = await pc.getCode({ address: predicted });
console.log(`\npolicy deployed at ${predicted}`);
console.log(`  has code          ${Boolean(code && code !== "0x")}`);
console.log(`  factory.isPolicy  ${await pc.readContract({address:FACTORY_07,abi:factoryAbi,functionName:"isPolicy",args:[predicted]}).catch(()=>undefined)}`);
console.log(`\nRecord this as NEWTON_POLICY. Clients then need setPolicies against it.`);
