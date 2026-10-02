// scripts/checkclient.mjs <client> — before wiring a policy client into the
// app, check it onchain and ask the gateway to simulate it against a clean
// wallet, a 3-hop wallet and a known Lazarus address. No task, no gas.
// Needs NEWTON_API_KEY in the environment.
import { createPublicClient, http, getAddress, hexToString, isAddress } from "viem";
import { sepolia } from "viem/chains";

const CLIENT_ARG = process.argv[2];
if (CLIENT_ARG === undefined || isAddress(CLIENT_ARG) === false) {
  console.log("usage: node scripts/checkclient.mjs <policy client address>"); process.exit(1);
}
const CLIENT = getAddress(CLIENT_ARG);
const KEY = process.env.NEWTON_API_KEY;
const OUR_WALLET = getAddress("0x8b4bA8708239757e84aD26a503500Bc5fC1c1a48");
const RPC = process.env.SEPOLIA_RPC_URL && process.env.SEPOLIA_RPC_URL !== "[SENSITIVE]"
  ? process.env.SEPOLIA_RPC_URL : "https://ethereum-sepolia-rpc.publicnode.com";
const GATEWAY = process.env.NEWTON_GATEWAY_URL || "https://gateway.testnet.newton.xyz/rpc";
const CHAIN_ID = 11155111;

const WALLETS = [
  ["clean wallet", "0x00000000219ab540356cbb839cbe05303d7705fa", null, 0],
  ["3-hop wallet", "0x1fc2e37e99ae7ac11353f183d7bfbb8105148bdf", 3, 5857588],
  ["known Lazarus address", "0x0004a76e39d33edfeac7fc3c8d3994f54428a0be", 0, null],
];

const POLICY_SPEC = { type: "tuple[]", components: [
  { name: "policy", type: "address" },
  { name: "config", type: "tuple", components: [
    { name: "policyParams", type: "bytes" }, { name: "expireAfter", type: "uint32" } ] } ] };
const clientAbi = [
  { type: "function", name: "getPolicies", inputs: [], outputs: [POLICY_SPEC], stateMutability: "view" },
  { type: "function", name: "getOwner", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
  { type: "function", name: "supportsInterface", inputs: [{ type: "bytes4" }], outputs: [{ type: "bool" }], stateMutability: "view" },
];
const pc = createPublicClient({ chain: sepolia, transport: http(RPC) });
const call = (address, abi, functionName, args = []) =>
  pc.readContract({ address, abi, functionName, args }).catch(() => undefined);
const str = (address, name) => call(address,
  [{ type: "function", name, inputs: [], outputs: [{ type: "string" }], stateMutability: "view" }], name);

console.log(`client      ${CLIENT}`);
const code = await pc.getCode({ address: CLIENT }).catch(() => null);
if (code === null || code === undefined || code === "0x") { console.log("no contract there"); process.exit(1); }

const iface = await call(CLIENT, clientAbi, "supportsInterface", ["0xf67e14d6"]);
const owner = await call(CLIENT, clientAbi, "getOwner");
const set = await call(CLIENT, clientAbi, "getPolicies");
console.log(`0.7 client  ${iface === true ? "yes" : "NO"}`);
console.log(`owner       ${owner ? getAddress(owner) : "unreadable"}` +
  (owner && getAddress(owner) === OUR_WALLET ? "   same wallet as the current clients"
    : "   DIFFERENT from 0x8b4bA870, so the API key must belong to this owner"));

let params = null;
if (Array.isArray(set) && set.length) {
  for (const s of set) {
    const p = getAddress(s.policy);
    let text = "(not utf-8)";
    try { text = hexToString(s.config.policyParams); } catch {}
    try { params = JSON.parse(text); } catch {}
    console.log(`\npolicy      ${p}`);
    console.log(`  params        ${text}`);
    console.log(`  expireAfter   ${s.config.expireAfter}`);
    for (const f of ["version", "getEntrypoint", "getWasmCid"]) {
      const v = await str(p, f);
      console.log(`  ${f.padEnd(13)} ${v === undefined ? "unreadable" : v === "" ? '""  (empty)' : v}`);
    }
  }
} else {
  console.log("policy set  empty or unreadable");
}

if (KEY === undefined || KEY === "" || KEY === "[SENSITIVE]") {
  console.log("\nNEWTON_API_KEY not set, skipping the simulation."); process.exit(0);
}

const maxHops = Number(params?.max_hops);
const minUsd = Number(params?.min_exposure_usd ?? 0);
const expect = (hop, usd) => {
  if (hop === 0) return false;
  if (hop === null) return true;
  if (Number.isFinite(maxHops) === false) return "?";
  return hop <= maxHops && usd >= minUsd ? false : true;
};

console.log("\n=== simulated through this client ===");
for (const [label, wallet, hop, usd] of WALLETS) {
  const resp = await fetch(GATEWAY, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ jsonrpc: "2.0", id: crypto.randomUUID(), method: "newt_simulatePolicy",
      params: { policy_client: CLIENT, chain_id: CHAIN_ID,
        intent: { from: "0x0000000000000000000000000000000000000000", to: wallet,
          value: "0x0", data: "0x", chain_id: "0x" + CHAIN_ID.toString(16), function_signature: "" },
        wasm_args: [Buffer.from(JSON.stringify({ address: wallet }), "utf8").toString("hex")] } }),
  });
  const body = await resp.json().catch(() => ({}));
  const got = body.result?.allowed;
  const want = expect(hop, usd);
  const ok = want === "?" ? "" : got === want ? "  correct" : "  WRONG";
  console.log(`  ${label.padEnd(22)} allowed=${got}   expected=${want}${ok}` +
    (body.error ? `   error: ${JSON.stringify(body.error).slice(0, 120)}` : ""));
}
