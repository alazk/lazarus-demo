// Compile policy/LazarusPolicyClient.sol and check its interface ID.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import solc from "solc";
import { toFunctionSelector } from "viem";

const SRC = "policy/LazarusPolicyClient.sol";
const out = JSON.parse(solc.compile(JSON.stringify({
  language: "Solidity",
  sources: { "LazarusPolicyClient.sol": { content: readFileSync(SRC, "utf8") } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"] } },
  },
})));

const diags = out.errors || [];
const errors = diags.filter((e) => e.severity === "error");
if (errors.length) {
  for (const e of errors) console.log(e.formattedMessage);
  process.exit(1);
}
const warnings = diags.filter((e) => e.severity !== "error");
console.log(`compiled clean, ${warnings.length} warning(s)`);
for (const w of warnings) console.log("  warn: " + String(w.formattedMessage || "").split("\n")[0]);

const c = out.contracts["LazarusPolicyClient.sol"]["LazarusPolicyClient"];
mkdirSync("policy/out", { recursive: true });
writeFileSync("policy/out/LazarusPolicyClient.json",
  JSON.stringify({ abi: c.abi, bytecode: "0x" + c.evm.bytecode.object }, null, 1));

console.log(`creation bytecode ${c.evm.bytecode.object.length / 2} bytes`);
console.log(`runtime bytecode  ${c.evm.deployedBytecode.object.length / 2} bytes (reference client: 3417)`);

// The interface ID is the XOR of the seven INewtonPolicyClient selectors.
const INTERFACE_FNS = [
  "getNewtonPolicyTaskManager", "getOwner", "getPolicies",
  "getPolicyId", "getPolicySetSnapshot", "policyRevision", "setPolicies",
];
const typeOf = (i) => i.type.startsWith("tuple")
  ? "(" + i.components.map(typeOf).join(",") + ")" + i.type.slice(5)
  : i.type;
const sigOf = (e) => e.name + "(" + e.inputs.map(typeOf).join(",") + ")";

let acc = 0;
const fns = c.abi.filter((e) => e.type === "function");
for (const e of fns) {
  if (INTERFACE_FNS.includes(e.name)) {
    acc ^= parseInt(toFunctionSelector("function " + sigOf(e)).slice(2), 16);
  }
}
const id = "0x" + (acc >>> 0).toString(16).padStart(8, "0");
console.log(`\ninterface id      ${id}  ${id === "0xf67e14d6" ? "correct" : "WRONG, expected 0xf67e14d6"}`);
for (const e of fns) console.log("  " + toFunctionSelector("function " + sigOf(e)) + "  " + sigOf(e));
console.log("\nartifact written to policy/out/LazarusPolicyClient.json");
process.exit(id === "0xf67e14d6" ? 0 : 1);
