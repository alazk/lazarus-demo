// Check example wallets hop by hop against the real chain, with the current
// screening rules: every wallet on a path must itself screen at the expected
// distance, so no link rests on the precomputed map alone.
//   ETHERSCAN_API_KEY=... node scripts/verify-examples.mjs
import fs from "node:fs";
import screen from "../api/screen.js";

const HALO = JSON.parse(fs.readFileSync("data/halo.json", "utf8")).halo;
const pause = () => new Promise((r) => setTimeout(r, 1100));
async function run(address) {
  let body;
  await screen({ query: { address } }, { status() { return this; }, json(b) { body = b; return this; } });
  await pause();
  return body;
}
const label = (b) => b.status === "SCREENING_FAILED" ? "FAILED"
  : b.direct_match ? "listed" : b.exposure ? `${b.hop_count} hops $${Number(b.exposure_usd).toLocaleString("en-US")}` : "none";

/** Screen the wallet, then each address on its reported path, and require
 *  the distances to count down 3 > 2 > 1 > listed. */
async function verifyChain(name, address, expect) {
  const first = await run(address);
  const lines = [`${name.padEnd(10)} ${address}  ${label(first)}`];
  let ok = first.exposure && first.hop_count === expect;
  const path = first.path || [];
  for (let i = 1; i < path.length && ok; i++) {
    const b = await run(path[i]);
    const want = expect - i;
    const good = want === 0 ? b.direct_match : (b.exposure && b.hop_count === want);
    lines.push(`${" ".repeat(12)}${path[i]}  ${label(b)}${good ? "" : `  <- expected ${want === 0 ? "listed" : want + " hops"}`}`);
    if (!good) ok = false;
  }
  console.log(lines.join("\n") + `\n${" ".repeat(12)}${ok ? "VERIFIED" : "NOT VERIFIED"}\n`);
  return ok;
}

// Current D, then candidates for a new C: map entries two hops from the list,
// with a moderate link value (very large values are where fake tokens hide).
await verifyChain("D (now)", "0x1fc2e37e99ae7ac11353f183d7bfbb8105148bdf", 3);
const candidates = Object.entries(HALO)
  .filter(([, v]) => v.d === 2 && v.min_usd >= 2000 && v.min_usd <= 500000)
  .sort((a, b) => a[0].localeCompare(b[0]));
let found = 0;
for (const [addr] of candidates.slice(0, 40)) {
  if (await verifyChain("C cand.", addr, 2)) { found += 1; if (found >= 2) break; }
}
if (!found) console.log("No verified 2-hop candidate in the first 40.");
