// scripts/repoint07.mjs — point every recorded client at a new policy, keeping
// each client's own params and expireAfter. Client addresses do not change, so
// nothing in Vercel does; the app uses the new policy as soon as this lands.
// Reversible: run it again with the old policy address.
//
// Dry run unless --execute. With NEWTON_API_KEY set, it finishes by simulating
// every client against a clean wallet, a 3-hop wallet and a Lazarus address,
// and checks each answer against that client's radius.
//
// Env: TARGET_POLICY (required), DEMO_PRIVATE_KEY (with --execute),
//      NEWTON_API_KEY (for the final check), SEPOLIA_RPC_URL, DEPLOYMENTS_FILE
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createPublicClient, createWalletClient, http, getAddress, isAddress,
  keccak256, encodeAbiParameters, hexToString } from "viem";
import { sepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

const RECORD = process.env.DEPLOYMENTS_FILE || "policy/out/clients.sepolia.json";
const ARTIFACT = "policy/out/LazarusPolicyClient.json";
const RPC = process.env.SEPOLIA_RPC_URL && process.env.SEPOLIA_RPC_URL !== "[SENSITIVE]"
  ? process.env.SEPOLIA_RPC_URL : "https://ethereum-sepolia-rpc.publicnode.com";
const GATEWAY = process.env.NEWTON_GATEWAY_URL || "https://gateway.testnet.newton.xyz/rpc";
const CHAIN_ID = BigInt(process.env.CHAIN_ID_OVERRIDE || sepolia.id);
const POLICY_SET_DOMAIN = "0x671cdd5663cea1dd5f0b42278ce65570194bc54e20449731d2ae86713689de91";
const EXECUTE = process.argv.includes("--execute");
const VERIFY_ONLY = process.argv.includes("--verify-only");

const rawTarget = process.env.TARGET_POLICY;
if (rawTarget === undefined || isAddress(rawTarget) === false) {
  console.log("TARGET_POLICY must be the policy to point the clients at."); process.exit(1);
}
const TARGET = getAddress(rawTarget);
if (existsSync(RECORD) === false) { console.log(`Missing ${RECORD}`); process.exit(1); }
const record = JSON.parse(readFileSync(RECORD, "utf8"));
const abi = JSON.parse(readFileSync(ARTIFACT, "utf8")).abi;

const pc = createPublicClient({ chain: { ...sepolia, id: Number(CHAIN_ID) }, transport: http(RPC) });
const str = (address, name) => pc.readContract({ address, functionName: name,
  abi: [{ type: "function", name, inputs: [], outputs: [{ type: "string" }], stateMutability: "view" }] })
  .catch(() => undefined);
const read = (address, functionName, args = []) =>
  pc.readContract({ address, abi, functionName, args }).catch(() => undefined);

const policyIdFor = (client, revision, spec) => keccak256(encodeAbiParameters(
  [{ type: "bytes32" }, { type: "uint256" }, { type: "address" }, { type: "uint64" },
   { type: "tuple[]", components: [{ name: "policy", type: "address" },
     { name: "config", type: "tuple", components: [{ name: "policyParams", type: "bytes" },
       { name: "expireAfter", type: "uint32" }] }] }],
  [POLICY_SET_DOMAIN, CHAIN_ID, getAddress(client), BigInt(revision), spec]));

console.log(`RPC     ${RPC}`);
console.log(`mode    ${VERIFY_ONLY ? "verify only" : EXECUTE ? "EXECUTE, this sends transactions" : "dry run, no transactions"}`);
console.log(`target  ${TARGET}\n`);

// --- is the target a policy that can actually screen? ----------------------

const code = await pc.getCode({ address: TARGET }).catch(() => null);
if (code === null || code === undefined || code === "0x") { console.log("No contract at TARGET_POLICY."); process.exit(1); }
const version = await str(TARGET, "version");
const entry = await str(TARGET, "getEntrypoint");
const wasm = await str(TARGET, "getWasmCid");
console.log("=== target policy ===");
console.log(`  version     ${version}`);
console.log(`  entrypoint  ${entry}`);
console.log(`  wasmCid     ${wasm === "" ? '""  EMPTY' : wasm}`);
if (typeof version !== "string" || /^0\.(7|8|9)|^[1-9]/.test(version) === false) {
  console.log("\nRefusing: the target is not a 0.7 policy."); process.exit(1);
}
if ((wasm === "" || wasm === undefined) && process.env.ALLOW_PURE_REGO !== "1") {
  console.log("\nRefusing: the target has no oracle, so it cannot see exposure and would");
  console.log("deny every wallet. Set ALLOW_PURE_REGO=1 only if that is intended.");
  process.exit(1);
}
if (entry !== "lazarus_exposure.allow") {
  console.log(`\nWarning: entrypoint is ${entry}, not lazarus_exposure.allow.`);
}

// --- plan ------------------------------------------------------------------

const plan = [];
console.log("\n=== plan ===");
for (const [key, r] of Object.entries(record)) {
  const client = getAddress(r.address);
  const set = await read(client, "getPolicies");
  const owner = await read(client, "getOwner");
  const rev = await read(client, "policyRevision");
  if (Array.isArray(set) === false || set.length === 0) {
    console.log(`  ${key.padEnd(6)} ${client}  unreadable policy set, skipping`); continue;
  }
  const cur = set[0];
  const already = getAddress(cur.policy) === TARGET;
  let params = "(not utf-8)";
  try { params = hexToString(cur.config.policyParams); } catch {}
  console.log(`  ${key.padEnd(6)} ${client}`);
  console.log(`         now      ${getAddress(cur.policy)}  rev ${rev}`);
  console.log(`         params   ${params}  expireAfter ${cur.config.expireAfter}`);
  console.log(`         ${already ? "already on the target, skipping" : "will point at the target"}`);
  if (already === false) {
    plan.push({ key, client, owner: owner && getAddress(owner), rev,
      spec: [{ policy: TARGET, config: { policyParams: cur.config.policyParams, expireAfter: cur.config.expireAfter } }],
      params });
  }
}

// --- execute ---------------------------------------------------------------

if (VERIFY_ONLY === false && plan.length && EXECUTE === false) {
  console.log(`\n${plan.length} client(s) would be re-pointed. Re-run with --execute.`);
}
if (VERIFY_ONLY === false && plan.length && EXECUTE) {
  const k = process.env.DEMO_PRIVATE_KEY;
  if (k === undefined || k === "" || k === "[SENSITIVE]") { console.log("\nDEMO_PRIVATE_KEY is needed."); process.exit(1); }
  const account = privateKeyToAccount(k.startsWith("0x") ? k : "0x" + k);
  const wc = createWalletClient({ account, chain: { ...sepolia, id: Number(CHAIN_ID) }, transport: http(RPC) });
  for (const p of plan) {
    console.log(`\n=== ${p.key}  ${p.client} ===`);
    if (p.owner && p.owner !== getAddress(account.address)) {
      console.log(`  Refusing: owned by ${p.owner}, you are ${account.address}.`); process.exit(1);
    }
    const hash = await wc.writeContract({ address: p.client, abi, functionName: "setPolicies", args: [p.spec] });
    console.log(`  tx          ${hash}`);
    const rc = await pc.waitForTransactionReceipt({ hash });
    if (rc.status !== "success") { console.log("  setPolicies failed"); process.exit(1); }
    const set = await read(p.client, "getPolicies");
    const rev = await read(p.client, "policyRevision");
    const id = await read(p.client, "getPolicyId");
    const expected = policyIdFor(p.client, rev, p.spec);
    const ok = Array.isArray(set) && getAddress(set[0].policy) === TARGET
      && set[0].config.policyParams === p.spec[0].config.policyParams && id === expected;
    console.log(`  policy      ${Array.isArray(set) ? getAddress(set[0].policy) : "?"}`);
    console.log(`  params      unchanged: ${Array.isArray(set) && set[0].config.policyParams === p.spec[0].config.policyParams}`);
    console.log(`  revision    ${p.rev} -> ${rev}`);
    console.log(`  policyId    ${id === expected ? "matches the SDK derivation" : "MISMATCH"}`);
    if (ok === false) { console.log("  Stopping: this client did not verify."); process.exit(1); }
    record[p.key] = { ...record[p.key], policy: TARGET, policyId: id,
      revision: Number(rev), repointedAt: new Date().toISOString() };
    writeFileSync(RECORD, JSON.stringify(record, null, 2));
  }
  console.log(`\nRecorded in ${RECORD}`);
}

// --- the check that matters: does each client give the right answer? -------

const KEY = process.env.NEWTON_API_KEY;
if ((EXECUTE || VERIFY_ONLY) && KEY && KEY !== "[SENSITIVE]") {
  const WALLETS = [
    ["clean", "0x00000000219ab540356cbb839cbe05303d7705fa", null, 0],
    ["3-hop", "0x1fc2e37e99ae7ac11353f183d7bfbb8105148bdf", 3, 5857588],
    ["Lazarus", "0x0004a76e39d33edfeac7fc3c8d3994f54428a0be", 0, null],
  ];
  console.log("\n=== simulated answers, checked against each client's radius ===");
  let bad = 0;
  for (const [key, r] of Object.entries(record)) {
    const want = (hop, usd) => hop === 0 ? false : hop === null ? true
      : (hop <= r.max_hops && usd >= r.min_exposure_usd) ? false : true;
    const cells = [];
    for (const [label, wallet, hop, usd] of WALLETS) {
      const resp = await fetch(GATEWAY, { method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${KEY}` },
        body: JSON.stringify({ jsonrpc: "2.0", id: crypto.randomUUID(), method: "newt_simulatePolicy",
          params: { policy_client: getAddress(r.address), chain_id: Number(CHAIN_ID),
            intent: { from: "0x0000000000000000000000000000000000000000", to: wallet, value: "0x0",
              data: "0x", chain_id: "0x" + CHAIN_ID.toString(16), function_signature: "" },
            wasm_args: [Buffer.from(JSON.stringify({ address: wallet }), "utf8").toString("hex")] } }) });
      const body = await resp.json().catch(() => ({}));
      const got = body.result?.allowed;
      const expected = want(hop, usd);
      if (got !== expected) bad++;
      cells.push(`${label} ${got === true ? "ALLOW" : got === false ? "DENY " : "?    "}${got === expected ? "" : "(WRONG)"}`);
    }
    console.log(`  ${key.padEnd(6)} radius ${r.max_hops}${r.min_exposure_usd ? ", $" + r.min_exposure_usd + " floor" : ""}`.padEnd(30) + cells.join("   "));
  }
  console.log(bad === 0 ? "\nEvery client gives the right answer, including the ones that should pass."
                        : `\n${bad} answer(s) wrong. Do not treat the demo as fixed.`);
}
