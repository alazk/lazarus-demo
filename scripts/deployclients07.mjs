// scripts/deployclients07.mjs — deploy one LazarusPolicyClient per rule and seed
// each one's policy set, verifying each client's policyId against the SDK's own
// derivation before anything is written to Vercel.
// Dry run unless you pass --execute.
//
// Env: NEWTON_POLICY (required), DEMO_PRIVATE_KEY (required with --execute),
//      SEPOLIA_RPC_URL, NEWTON_POLICY_FACTORY, NEWTON_TASK_MANAGER,
//      CLIENT_EXPIRE_AFTER
// Flags: --execute, --only=h1v0,h3v0
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createPublicClient, createWalletClient, http, getAddress,
  stringToHex, keccak256, encodeAbiParameters, isAddress } from "viem";
import { sepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

const ARTIFACT = "policy/out/LazarusPolicyClient.json";
const RECORD = process.env.DEPLOYMENTS_FILE || "policy/out/clients.sepolia.json";
const POLICY_SET_DOMAIN = "0x671cdd5663cea1dd5f0b42278ce65570194bc54e20449731d2ae86713689de91";

const RPC = process.env.SEPOLIA_RPC_URL && process.env.SEPOLIA_RPC_URL !== "[SENSITIVE]"
  ? process.env.SEPOLIA_RPC_URL : "https://ethereum-sepolia-rpc.publicnode.com";
const FACTORY = getAddress(process.env.NEWTON_POLICY_FACTORY || "0x8dd5984f8f626a2fd1c61872217d1f8269a831da");
const TASK_MANAGER = getAddress(process.env.NEWTON_TASK_MANAGER || "0xecb741F4875770f9A5F060cb30F6c9eb5966eD13");
const EXPIRE_AFTER = Number(process.env.CLIENT_EXPIRE_AFTER || 300);
const EXECUTE = process.argv.includes("--execute");
const onlyArg = process.argv.find((a) => a.startsWith("--only="));
const ONLY = onlyArg ? onlyArg.slice(7).split(",").map((s) => s.trim()) : null;

// One client per rule. These are exactly the rules api/evaluate.js offers, so the
// app and the chain agree once this has run.
const RULES = [
  { key: "h1v0", hops: 1, usd: 0, env: "NEWTON_POLICY_CLIENT_H1V0", label: "1 hop, any value" },
  { key: "h2v0", hops: 2, usd: 0, env: "NEWTON_POLICY_CLIENT_H2V0", label: "2 hops, any value" },
  { key: "h3v0", hops: 3, usd: 0, env: "NEWTON_POLICY_CLIENT", label: "3 hops, any value (default)" },
  { key: "h3v1m", hops: 3, usd: 1000000, env: "NEWTON_POLICY_CLIENT_H3V1M", label: "3 hops, $1m floor" },
];

const policyAbi = [
  { type:"function", name:"version", inputs:[], outputs:[{type:"string"}], stateMutability:"view" },
  { type:"function", name:"factory", inputs:[], outputs:[{type:"address"}], stateMutability:"view" },
  { type:"function", name:"owner", inputs:[], outputs:[{type:"address"}], stateMutability:"view" },
  { type:"function", name:"getEntrypoint", inputs:[], outputs:[{type:"string"}], stateMutability:"view" },
];
const factoryAbi = [
  { type:"function", name:"isPolicy", inputs:[{type:"address"}], outputs:[{type:"bool"}], stateMutability:"view" },
];

if (existsSync(ARTIFACT) === false) {
  console.log(`Missing ${ARTIFACT}. Run: node scripts/compile-client.mjs`);
  process.exit(1);
}
const artifact = JSON.parse(readFileSync(ARTIFACT, "utf8"));
const abi = artifact.abi;

const rawPolicy = process.env.NEWTON_POLICY;
if (rawPolicy === undefined || isAddress(rawPolicy) === false) {
  console.log("NEWTON_POLICY must be set to the 0.7 Lazarus policy address.");
  console.log("Deploy it first with: node scripts/deploy07.mjs --execute");
  process.exit(1);
}
const POLICY = getAddress(rawPolicy);

const pc = createPublicClient({ chain: sepolia, transport: http(RPC) });
const read = (address, abi_, functionName, args = []) =>
  pc.readContract({ address, abi: abi_, functionName, args }).catch(() => undefined);

console.log(`RPC          ${RPC}`);
console.log(`mode         ${EXECUTE ? "EXECUTE, this sends transactions" : "dry run, no transactions"}`);
console.log(`policy       ${POLICY}`);
console.log(`factory      ${FACTORY}`);
console.log(`taskManager  ${TASK_MANAGER}`);
console.log(`expireAfter  ${EXPIRE_AFTER}\n`);

const code = await pc.getCode({ address: POLICY }).catch(() => null);
if (code === null || code === undefined || code === "0x") {
  console.log("No contract at NEWTON_POLICY."); process.exit(1);
}
const version = await read(POLICY, policyAbi, "version");
const policyFactory = await read(POLICY, policyAbi, "factory");
const entrypoint = await read(POLICY, policyAbi, "getEntrypoint");
const recognised = await read(FACTORY, factoryAbi, "isPolicy", [POLICY]);
const is07 = typeof version === "string" && /^0\.(7|8|9)|^[1-9]/.test(version);

console.log("=== policy checks ===");
console.log(`  version            ${version ?? "unreadable"}${is07 ? "" : "   NOT 0.7"}`);
console.log(`  factory            ${policyFactory ? getAddress(policyFactory) : "unreadable"}` +
  (policyFactory && getAddress(policyFactory) === FACTORY ? "   matches" : "   DOES NOT MATCH"));
console.log(`  entrypoint         ${entrypoint ?? "unreadable"}`);
console.log(`  factory.isPolicy   ${recognised}`);

const policyOk = is07 && policyFactory && getAddress(policyFactory) === FACTORY && recognised === true;
if (policyOk === false) {
  console.log("\nThat policy is not one 0.7 will accept. Fix it before deploying clients.");
  if (EXECUTE) process.exit(1);
}

let record = {};
if (existsSync(RECORD)) { try { record = JSON.parse(readFileSync(RECORD, "utf8")); } catch {} }

const wanted = ONLY ? RULES.filter((r) => ONLY.includes(r.key)) : RULES;
if (ONLY && wanted.length !== ONLY.length) {
  console.log(`\nUnknown rule key in --only. Valid keys: ${RULES.map((r) => r.key).join(", ")}`);
  process.exit(1);
}

const paramsFor = (r) => stringToHex(JSON.stringify({ max_hops: r.hops, min_exposure_usd: r.usd }));
const expectedPolicyId = (client, revision, spec) => keccak256(encodeAbiParameters(
  [{ type:"bytes32" }, { type:"uint256" }, { type:"address" }, { type:"uint64" },
   { type:"tuple[]", components:[{ name:"policy", type:"address" },
     { name:"config", type:"tuple", components:[{ name:"policyParams", type:"bytes" },
       { name:"expireAfter", type:"uint32" }] }] }],
  [POLICY_SET_DOMAIN, BigInt(sepolia.id), getAddress(client), BigInt(revision), spec]));

console.log("\n=== plan ===");
const todo = [];
for (const r of wanted) {
  const have = record[r.key]?.address;
  let healthy = false;
  if (have && isAddress(have)) {
    const set = await read(have, abi, "getPolicies");
    const owner = await read(have, abi, "getOwner");
    healthy = Array.isArray(set) && set.length === 1
      && getAddress(set[0].policy) === POLICY
      && set[0].config.policyParams === paramsFor(r)
      && Boolean(owner);
  }
  console.log(`  ${r.key.padEnd(6)} ${r.label.padEnd(28)} ${have ? have : "(none)"}` +
    `${have ? (healthy ? "   already correct, skipping" : "   present but wrong, will redeploy") : "   to deploy"}`);
  console.log(`         params  ${JSON.stringify({ max_hops: r.hops, min_exposure_usd: r.usd })}`);
  if (healthy === false) todo.push(r);
}

if (todo.length === 0) {
  console.log("\nEverything is already deployed and correct.");
  printEnv(); process.exit(0);
}
if (EXECUTE === false) {
  console.log(`\n${todo.length} client(s) would be deployed.`);
  console.log("Each one costs a deploy plus a setPolicies call.");
  console.log("\nRe-run with --execute to deploy.");
  process.exit(0);
}

const key = process.env.DEMO_PRIVATE_KEY;
if (key === undefined || key === "[SENSITIVE]") {
  console.log("\nDEMO_PRIVATE_KEY is needed to execute."); process.exit(1);
}
const account = privateKeyToAccount(key.startsWith("0x") ? key : "0x" + key);
const policyOwner = await read(POLICY, policyAbi, "owner");
if (policyOwner && getAddress(policyOwner) !== getAddress(account.address)) {
  console.log(`\nWarning: the policy is owned by ${getAddress(policyOwner)} but you are deploying as ${account.address}.`);
  console.log("The clients will be owned by the deploying key, which must be the wallet behind NEWTON_API_KEY.");
}
const balance = await pc.getBalance({ address: account.address });
console.log(`\ndeployer ${account.address}`);
console.log(`balance  ${Number(balance) / 1e18} ETH`);
if (balance === 0n) { console.log("No Sepolia ETH."); process.exit(1); }

const wc = createWalletClient({ account, chain: sepolia, transport: http(RPC) });

for (const r of todo) {
  console.log(`\n=== ${r.key}  ${r.label} ===`);
  const deployHash = await wc.deployContract({ abi, bytecode: artifact.bytecode,
    args: [TASK_MANAGER, account.address] });
  console.log(`  deploy tx      ${deployHash}`);
  const dr = await pc.waitForTransactionReceipt({ hash: deployHash });
  if (dr.status !== "success" || !dr.contractAddress) { console.log("  deploy failed"); process.exit(1); }
  const client = getAddress(dr.contractAddress);
  console.log(`  client         ${client}`);

  const spec = [{ policy: POLICY, config: { policyParams: paramsFor(r), expireAfter: EXPIRE_AFTER } }];
  const setHash = await wc.writeContract({ address: client, abi, functionName: "setPolicies", args: [spec] });
  console.log(`  setPolicies tx ${setHash}`);
  const sr = await pc.waitForTransactionReceipt({ hash: setHash });
  if (sr.status !== "success") { console.log("  setPolicies failed"); process.exit(1); }

  const iface = await read(client, abi, "supportsInterface", ["0xf67e14d6"]);
  const onchainId = await read(client, abi, "getPolicyId");
  const revision = await read(client, abi, "policyRevision");
  const set = await read(client, abi, "getPolicies");
  const expected = expectedPolicyId(client, revision ?? 1n, spec);
  console.log(`  interface      ${iface}`);
  console.log(`  revision       ${revision}`);
  console.log(`  policySet      ${Array.isArray(set) ? set.length : "?"} entry`);
  console.log(`  policyId       ${onchainId}`);
  console.log(`  expected       ${expected}`);
  const ok = iface === true && onchainId === expected && Array.isArray(set)
    && set.length === 1 && getAddress(set[0].policy) === POLICY;
  console.log(`  verified       ${ok ? "yes" : "NO"}`);
  if (ok === false) { console.log("  Stopping: this client did not verify."); process.exit(1); }

  record[r.key] = { address: client, env: r.env, max_hops: r.hops, min_exposure_usd: r.usd,
    policy: POLICY, expireAfter: EXPIRE_AFTER, policyId: onchainId,
    owner: getAddress(account.address), deployedAt: new Date().toISOString() };
  mkdirSync("policy/out", { recursive: true });
  writeFileSync(RECORD, JSON.stringify(record, null, 2));
}

console.log(`\nRecorded in ${RECORD}`);
printEnv();

function printEnv() {
  const lines = RULES.map((r) => record[r.key] ? `${r.env}=${record[r.key].address}` : null).filter(Boolean);
  if (lines.length === 0) return;
  console.log("\n=== env vars ===");
  for (const l of lines) console.log("  " + l);
  console.log("\nSet them on Vercel, replacing the old values:\n");
  for (const r of RULES) {
    if (record[r.key] === undefined) continue;
    console.log(`  npx vercel env rm ${r.env} production --yes 2>/dev/null; ` +
      `printf '%s' ${record[r.key].address} | npx vercel env add ${r.env} production`);
  }
  console.log(`  printf '%s' ${POLICY} | npx vercel env add NEWTON_POLICY production`);
  console.log("  npx vercel --prod");
}
