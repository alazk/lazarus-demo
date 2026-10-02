// scripts/inspectpolicy.mjs <policy> — compare a policy with ours field by
// field, then ask the gateway what its oracle returns for a clean wallet, a
// 3-hop wallet and a known Lazarus address. No task, no gas.
// Needs NEWTON_API_KEY for the simulation half.
import { createPublicClient, http, getAddress, isAddress } from "viem";
import { sepolia } from "viem/chains";

const TARGET = process.argv[2];
if (TARGET === undefined || isAddress(TARGET) === false) {
  console.log("usage: node scripts/inspectpolicy.mjs <policy address>"); process.exit(1);
}
const OURS = getAddress("0xcd23ab50D9a3867B9B75E72f7087B420d62BF65f");
const KEY = process.env.NEWTON_API_KEY;
const RPC = process.env.SEPOLIA_RPC_URL && process.env.SEPOLIA_RPC_URL !== "[SENSITIVE]"
  ? process.env.SEPOLIA_RPC_URL : "https://ethereum-sepolia-rpc.publicnode.com";
const GATEWAY = process.env.NEWTON_GATEWAY_URL || "https://gateway.testnet.newton.xyz/rpc";
const CHAIN_ID = 11155111;

const pc = createPublicClient({ chain: sepolia, transport: http(RPC) });
const read = (address, name, type) => pc.readContract({ address, functionName: name,
  abi: [{ type: "function", name, inputs: [], outputs: [{ type }], stateMutability: "view" }] })
  .catch(() => undefined);

const FIELDS = [
  ["version", "string"], ["factory", "address"], ["owner", "address"],
  ["getEntrypoint", "string"], ["getPolicyCid", "string"], ["getSchemaCid", "string"],
  ["getWasmCid", "string"], ["getSecretsSchemaCid", "string"], ["getMetadataCid", "string"],
  ["getPolicyCodeHash", "bytes32"],
];

const t = getAddress(TARGET);
console.log(`${"field".padEnd(20)} ${"this policy".padEnd(64)} same as ours?`);
console.log("-".repeat(100));
for (const [f, type] of FIELDS) {
  const a = await read(t, f, type);
  const b = await read(OURS, f, type);
  const show = (v) => v === undefined ? "unreadable" : v === "" ? '""' : String(v);
  const same = String(a) === String(b) ? "yes" : "DIFFERENT";
  console.log(`${f.padEnd(20)} ${show(a).slice(0, 62).padEnd(64)} ${same}`);
  if (same === "DIFFERENT") console.log(`${"".padEnd(20)} ours: ${show(b).slice(0, 70)}`);
}

if (KEY === undefined || KEY === "" || KEY === "[SENSITIVE]") {
  console.log("\nNEWTON_API_KEY not set, skipping the oracle check."); process.exit(0);
}

const WALLETS = [
  ["clean wallet", "0x00000000219ab540356cbb839cbe05303d7705fa"],
  ["3-hop wallet", "0x1fc2e37e99ae7ac11353f183d7bfbb8105148bdf"],
  ["known Lazarus address", "0x0004a76e39d33edfeac7fc3c8d3994f54428a0be"],
];
console.log(`\n=== what this policy's oracle returns (newt_simulatePolicyData) ===`);
for (const [label, wallet] of WALLETS) {
  const hex = Buffer.from(JSON.stringify({ address: wallet }), "utf8").toString("hex");
  for (const [form, args] of [["unprefixed", hex], ["0x-prefixed", "0x" + hex]]) {
    const resp = await fetch(GATEWAY, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${KEY}` },
      body: JSON.stringify({ jsonrpc: "2.0", id: crypto.randomUUID(), method: "newt_simulatePolicyData",
        params: { policy_address: t, wasm_args: args, chain_id: CHAIN_ID } }),
    });
    const body = await resp.json().catch(() => ({}));
    const r = body.result ?? {};
    const out = r.success ? JSON.stringify(r.policy_data?.data ?? r.policy_data).slice(0, 260)
      : `error: ${JSON.stringify(r.error ?? body.error ?? body).slice(0, 200)}`;
    console.log(`  ${label.padEnd(22)} [${form.padEnd(11)}] ${out}`);
    if (r.success) break;
  }
}
