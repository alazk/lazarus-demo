// scripts/deployclient-allow.mjs — deploy the one client for the allow-all
// policy (Policy D on the page) and seed its policy set with empty params.
// Built from deployclients07.mjs; same checks, one rule, then a gateway
// simulation that proves a known Lazarus address comes back ALLOW.
// Dry run unless you pass --execute.
//
// Env: NEWTON_POLICY (the allow-all policy), DEMO_PRIVATE_KEY (with --execute),
//      NEWTON_API_KEY (for the simulation), SEPOLIA_RPC_URL, NEWTON_POLICY_FACTORY,
//      NEWTON_TASK_MANAGER, CLIENT_EXPIRE_AFTER
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createPublicClient, createWalletClient, http, getAddress,
  stringToHex, keccak256, encodeAbiParameters, isAddress } from "viem";
import { sepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

const ARTIFACT = "policy/out/LazarusPolicyClient.json";
const RECORD = process.env.DEPLOYMENTS_FILE || "policy/out/clients.sepolia.json";
const POLICY_SET_DOMAIN = "0x671cdd5663cea1dd5f0b42278ce65570194bc54e20449731d2ae86713689de91";
const RULE = { key: "allow", env: "NEWTON_POLICY_CLIENT_ALLOW", label: "allow all (Policy D)" };
const ENTRYPOINT = "allow_all.allow";

const RPC = process.env.SEPOLIA_RPC_URL && process.env.SEPOLIA_RPC_URL !== "[SENSITIVE]"
  ? process.env.SEPOLIA_RPC_URL : "https://ethereum-sepolia-rpc.publicnode.com";
const FACTORY = getAddress(process.env.NEWTON_POLICY_FACTORY || "0x8dd5984f8f626a2fd1c61872217d1f8269a831da");
const TASK_MANAGER = getAddress(process.env.NEWTON_TASK_MANAGER || "0xecb741F4875770f9A5F060cb30F6c9eb5966eD13");
const EXPIRE_AFTER = Number(process.env.CLIENT_EXPIRE_AFTER || 300);
const GATEWAY = process.env.NEWTON_GATEWAY_URL || "https://gateway.testnet.newton.xyz/rpc";
const EXECUTE = process.argv.includes("--execute");

const policyAbi = [
  { type:"function", name:"version", inputs:[], outputs:[{type:"string"}], stateMutability:"view" },
  { type:"function", name:"factory", inputs:[], outputs:[{type:"address"}], stateMutability:"view" },
  { type:"function", name:"owner", inputs:[], outputs:[{type:"address"}], stateMutability:"view" },
  { type:"function", name:"getEntrypoint", inputs:[], outputs:[{type:"string"}], stateMutability:"view" },
  { type:"function", name:"getWasmCid", inputs:[], outputs:[{type:"string"}], stateMutability:"view" },
];
const factoryAbi = [
  { type:"function", name:"isPolicy", inputs:[{type:"address"}], outputs:[{type:"bool"}], stateMutability:"view" },
];

if (!existsSync(ARTIFACT)) { console.log(`Missing ${ARTIFACT}. Run: node scripts/compile-client.mjs`); process.exit(1); }
const artifact = JSON.parse(readFileSync(ARTIFACT, "utf8"));
const abi = artifact.abi;

const rawPolicy = process.env.NEWTON_POLICY;
if (rawPolicy === undefined || !isAddress(rawPolicy, { strict: false })) {
  console.log("NEWTON_POLICY must be set to the allow-all policy address."); process.exit(1);
}
const POLICY = getAddress(rawPolicy.toLowerCase());
const pc = createPublicClient({ chain: sepolia, transport: http(RPC) });
const read = (address, abi_, functionName, args = []) =>
  pc.readContract({ address, abi: abi_, functionName, args }).catch(() => undefined);

console.log(`RPC          ${RPC}`);
console.log(`mode         ${EXECUTE ? "EXECUTE, this sends transactions" : "dry run, no transactions"}`);
console.log(`policy       ${POLICY}\n`);

// The policy has to be the allow-all one, from the 0.7 factory, and pure Rego.
const code = await pc.getCode({ address: POLICY }).catch(() => null);
if (!code || code === "0x") { console.log("No contract at NEWTON_POLICY."); process.exit(1); }
const version = await read(POLICY, policyAbi, "version");
const policyFactory = await read(POLICY, policyAbi, "factory");
const entrypoint = await read(POLICY, policyAbi, "getEntrypoint");
const wasmCid = await read(POLICY, policyAbi, "getWasmCid");
const recognised = await read(FACTORY, factoryAbi, "isPolicy", [POLICY]);
const is07 = typeof version === "string" && /^0\.(7|8|9)|^[1-9]/.test(version);
console.log("=== policy checks ===");
console.log(`  version            ${version ?? "unreadable"}${is07 ? "" : "   NOT 0.7"}`);
console.log(`  factory            ${policyFactory ? getAddress(policyFactory) : "unreadable"}` +
  (policyFactory && getAddress(policyFactory) === FACTORY ? "   matches" : "   DOES NOT MATCH"));
console.log(`  entrypoint         ${entrypoint ?? "unreadable"}${entrypoint === ENTRYPOINT ? "" : `   expected ${ENTRYPOINT}`}`);
console.log(`  wasmCid            ${wasmCid ? wasmCid : '""  (pure Rego, as intended)'}`);
console.log(`  factory.isPolicy   ${recognised}`);
const policyOk = is07 && policyFactory && getAddress(policyFactory) === FACTORY && recognised === true
  && entrypoint === ENTRYPOINT;
if (!policyOk) {
  console.log("\nThat is not the allow-all policy, or 0.7 does not accept it. Stopping.");
  process.exit(1);
}

let record = {};
if (existsSync(RECORD)) { try { record = JSON.parse(readFileSync(RECORD, "utf8")); } catch {} }

const params = stringToHex("{}");
const expectedPolicyId = (client, revision, spec) => keccak256(encodeAbiParameters(
  [{ type:"bytes32" }, { type:"uint256" }, { type:"address" }, { type:"uint64" },
   { type:"tuple[]", components:[{ name:"policy", type:"address" },
     { name:"config", type:"tuple", components:[{ name:"policyParams", type:"bytes" },
       { name:"expireAfter", type:"uint32" }] }] }],
  [POLICY_SET_DOMAIN, BigInt(sepolia.id), getAddress(client), BigInt(revision), spec]));

const have = record[RULE.key]?.address;
let healthy = false;
if (have && isAddress(have, { strict: false })) {
  const set = await read(have, abi, "getPolicies");
  healthy = Array.isArray(set) && set.length === 1 && getAddress(set[0].policy) === POLICY
    && set[0].config.policyParams === params;
}
console.log("\n=== plan ===");
console.log(`  ${RULE.key}  ${RULE.label}  ${have || "(none)"}${have ? (healthy ? "   already correct" : "   present but wrong, will redeploy") : "   to deploy"}`);
console.log(`  params  {}`);

let client = healthy ? getAddress(have) : null;
if (!healthy) {
  if (!EXECUTE) { console.log("\nOne client would be deployed (a deploy plus a setPolicies call).\nRe-run with --execute to deploy."); process.exit(0); }
  const key = process.env.DEMO_PRIVATE_KEY;
  if (!key || key === "[SENSITIVE]") { console.log("\nDEMO_PRIVATE_KEY is needed to execute."); process.exit(1); }
  const account = privateKeyToAccount(key.startsWith("0x") ? key : "0x" + key);
  const balance = await pc.getBalance({ address: account.address });
  console.log(`\ndeployer ${account.address}`);
  console.log(`balance  ${Number(balance) / 1e18} ETH`);
  if (balance === 0n) { console.log("No Sepolia ETH."); process.exit(1); }
  const wc = createWalletClient({ account, chain: sepolia, transport: http(RPC) });

  const deployHash = await wc.deployContract({ abi, bytecode: artifact.bytecode, args: [TASK_MANAGER, account.address] });
  console.log(`  deploy tx      ${deployHash}`);
  const dr = await pc.waitForTransactionReceipt({ hash: deployHash });
  if (dr.status !== "success" || !dr.contractAddress) { console.log("  deploy failed"); process.exit(1); }
  client = getAddress(dr.contractAddress);
  console.log(`  client         ${client}`);

  const spec = [{ policy: POLICY, config: { policyParams: params, expireAfter: EXPIRE_AFTER } }];
  const setHash = await wc.writeContract({ address: client, abi, functionName: "setPolicies", args: [spec] });
  console.log(`  setPolicies tx ${setHash}`);
  const sr = await pc.waitForTransactionReceipt({ hash: setHash });
  if (sr.status !== "success") { console.log("  setPolicies failed"); process.exit(1); }

  const iface = await read(client, abi, "supportsInterface", ["0xf67e14d6"]);
  const onchainId = await read(client, abi, "getPolicyId");
  const revision = await read(client, abi, "policyRevision");
  const set = await read(client, abi, "getPolicies");
  const expected = expectedPolicyId(client, revision ?? 1n, spec);
  const ok = iface === true && onchainId === expected && Array.isArray(set) && set.length === 1 && getAddress(set[0].policy) === POLICY;
  console.log(`  interface      ${iface}`);
  console.log(`  policyId       ${onchainId}`);
  console.log(`  expected       ${expected}`);
  console.log(`  verified       ${ok ? "yes" : "NO"}`);
  if (!ok) { console.log("  Stopping: this client did not verify. Do not record it."); process.exit(1); }

  record[RULE.key] = { address: client, env: RULE.env, max_hops: 0, min_exposure_usd: 0, allow_all: true,
    policy: POLICY, expireAfter: EXPIRE_AFTER, policyId: onchainId, owner: getAddress(account.address),
    deployedAt: new Date().toISOString() };
  mkdirSync("policy/out", { recursive: true });
  writeFileSync(RECORD, JSON.stringify(record, null, 2));
  console.log(`\nRecorded in ${RECORD}`);
}

// The proof: a known Lazarus address must come back ALLOW under this client.
const KEY = process.env.NEWTON_API_KEY;
if (KEY && KEY !== "[SENSITIVE]" && client) {
  const WALLETS = [["Lazarus", "0x0004a76e39d33edfeac7fc3c8d3994f54428a0be"], ["3-hop", "0x1fc2e37e99ae7ac11353f183d7bfbb8105148bdf"], ["clean", "0x00000000219ab540356cbb839cbe05303d7705fa"]];
  console.log("\n=== simulated answers (all must be ALLOW) ===");
  let bad = 0;
  for (const [label, wallet] of WALLETS) {
    const resp = await fetch(GATEWAY, { method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${KEY}` },
      body: JSON.stringify({ jsonrpc: "2.0", id: crypto.randomUUID(), method: "newt_simulatePolicy",
        params: { policy_client: client, chain_id: sepolia.id,
          intent: { from: "0x0000000000000000000000000000000000000000", to: wallet, value: "0x0", data: "0x",
            chain_id: "0x" + sepolia.id.toString(16), function_signature: "" },
          wasm_args: ["0x"] } }) }); // pure Rego: the entry must be empty
    const body = await resp.json().catch(() => ({}));
    const got = body.result?.allowed;
    if (got !== true) bad++;
    console.log(`  ${label.padEnd(8)} ${got === true ? "ALLOW" : got === false ? "DENY  (WRONG)" : "?  " + JSON.stringify(body.error || body.result || body).slice(0, 160)}`);
  }
  console.log(bad === 0 ? "\nThe allow-all client allows everything, Lazarus included. That is the point."
                        : `\n${bad} answer(s) not ALLOW. Do not wire this client in until that is understood.`);
} else {
  console.log("\nNEWTON_API_KEY not set, so no gateway simulation. Run with it set to prove the client allows a Lazarus address.");
}

console.log(`\n=== wire it in ===`);
console.log(`  ${RULE.env}=${client}`);
console.log(`  ALLOW_ALL_CLIENT in js/data.js = "${client}"`);
console.log(`\n  npx vercel env rm ${RULE.env} production --yes 2>/dev/null; printf '%s' ${client} | npx vercel env add ${RULE.env} production`);
console.log(`  npx vercel --prod`);
