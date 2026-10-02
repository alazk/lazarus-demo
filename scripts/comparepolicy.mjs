// scripts/comparepolicy.mjs — put our policy set next to the sanctions team's
// working 0.7 one, field by field, to find what ours is missing.
// Views only.
import { createPublicClient, http, getAddress, hexToString } from "viem";
import { sepolia } from "viem/chains";

const RPC = process.env.SEPOLIA_RPC_URL && process.env.SEPOLIA_RPC_URL !== "[SENSITIVE]"
  ? process.env.SEPOLIA_RPC_URL : "https://ethereum-sepolia-rpc.publicnode.com";

const SUBJECTS = [
  ["ours, 3 hops", "0xAbe39aa25ffB4B13C15166D10a27E9132f207BE8"],
  ["ours, 1 hop", "0x8a8F5389B1ab8Dee99829A9bB2E7b235809EaeC4"],
  ["sanctions team, works", "0x57F4fB0a4A4b34eA51D47BC7c99c960b80A58D18"],
];

const POLICY_SPEC = { type: "tuple[]", components: [
  { name: "policy", type: "address" },
  { name: "config", type: "tuple", components: [
    { name: "policyParams", type: "bytes" }, { name: "expireAfter", type: "uint32" } ] } ] };

const clientAbi = [
  { type: "function", name: "getPolicies", inputs: [], outputs: [POLICY_SPEC], stateMutability: "view" },
  { type: "function", name: "getOwner", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
  { type: "function", name: "getNewtonPolicyTaskManager", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
  { type: "function", name: "policyRevision", inputs: [], outputs: [{ type: "uint64" }], stateMutability: "view" },
];
const policyFields = [
  ["version", "string"], ["factory", "address"], ["owner", "address"],
  ["getEntrypoint", "string"], ["getPolicyCid", "string"], ["getSchemaCid", "string"],
  ["getWasmCid", "string"], ["getSecretsSchemaCid", "string"], ["getMetadataCid", "string"],
];

const pc = createPublicClient({ chain: sepolia, transport: http(RPC) });
const read = async (address, name, outType, args = []) => {
  const abi = [{ type: "function", name, inputs: args.map((_, i) => ({ type: "address" })),
    outputs: [{ type: outType }], stateMutability: "view" }];
  try { return await pc.readContract({ address, abi, functionName: name, args }); } catch { return undefined; }
};

for (const [label, addr] of SUBJECTS) {
  const a = getAddress(addr);
  console.log(`\n=== ${label} ===`);
  console.log(`client            ${a}`);
  const owner = await pc.readContract({ address: a, abi: clientAbi, functionName: "getOwner" }).catch(() => undefined);
  const rev = await pc.readContract({ address: a, abi: clientAbi, functionName: "policyRevision" }).catch(() => undefined);
  const tm = await pc.readContract({ address: a, abi: clientAbi, functionName: "getNewtonPolicyTaskManager" }).catch(() => undefined);
  console.log(`owner             ${owner ? getAddress(owner) : "unreadable"}`);
  console.log(`revision          ${rev}`);
  console.log(`taskManager       ${tm ? getAddress(tm) : "unreadable"}`);

  const set = await pc.readContract({ address: a, abi: clientAbi, functionName: "getPolicies" }).catch(() => undefined);
  if (!Array.isArray(set)) { console.log("  getPolicies unreadable"); continue; }
  for (const s of set) {
    const p = getAddress(s.policy);
    console.log(`\n  policy          ${p}`);
    console.log(`  expireAfter     ${s.config.expireAfter}`);
    console.log(`  paramsBytes     ${s.config.policyParams}`);
    let asText = "(not utf-8)";
    try { asText = hexToString(s.config.policyParams); } catch {}
    console.log(`  paramsAsText    ${asText}`);
    console.log(`  paramsByteLen   ${(s.config.policyParams.length - 2) / 2}`);

    for (const [fn, type] of policyFields) {
      const v = await read(p, fn, type);
      if (v !== undefined) {
        console.log(`    ${fn.padEnd(22)} ${v === "" ? '""  (empty)' : v}`);
      } else {
        console.log(`    ${fn.padEnd(22)} unreadable`);
      }
    }
  }
}

console.log("\nThe question: does the working client carry anything ours does not.");
