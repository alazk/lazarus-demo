// Run the screening locally against the real chain, before pushing.
//   ETHERSCAN_API_KEY=... node scripts/audit-screen.mjs [extra addresses...]
// Uses api/screen.js exactly as deployed. Makes Etherscan calls only; nothing
// is sent to Newton.
import screen from "../api/screen.js";

const WALLETS = [
  ["A  listed", "0x0004a76e39d33edfeac7fc3c8d3994f54428a0be", "was: listed"],
  ["B  1 hop", "0x0a3b4bde9116a950a036204bf0d7a16d285f8995", "was: 1 hop, $90,473"],
  ["C  2 hops", "0x9a3380ae530e3e92b8789859b2f036012c187932", "was: 2 hops, $233,293,000"],
  ["D  3 hops", "0x1fc2e37e99ae7ac11353f183d7bfbb8105148bdf", "was: 3 hops, $5,857,588"],
  ["E  clean", "0x00000000219ab540356cbb839cbe05303d7705fa", "was: clean (3 counterparties)"],
  ["vitalik.eth", "0xd8da6bf26964af9d7eed9e03e53415d37aa96045", "README said: exposed"],
  ...process.argv.slice(2).map((a) => ["extra", a.toLowerCase(), ""]),
];

for (const [name, address, before] of WALLETS) {
  let body;
  await screen({ query: { address } }, { status() { return this; }, json(b) { body = b; return this; } });
  const found = body.status === "SCREENING_FAILED" ? `FAILED (${body.detail})`
    : body.direct_match ? "listed"
    : body.exposure ? `${body.hop_count} hops, $${Number(body.exposure_usd).toLocaleString("en-US")}`
    : "no exposure";
  const notes = [
    body.counterparties_examined !== undefined && `${body.counterparties_examined} counterparties`,
    body.paths_through_contracts_skipped && `${body.paths_through_contracts_skipped} contract paths skipped`,
    body.history_truncated && "history truncated",
    body.contract_check_incomplete && "contract check incomplete",
  ].filter(Boolean).join(", ");
  console.log(`${name.padEnd(12)} ${found.padEnd(28)} ${notes.padEnd(55)} ${before}`);
  if (body.path?.length > 1) console.log(" ".repeat(13) + "path: " + body.path.join(" > "));
  await new Promise((r) => setTimeout(r, 1200));
}
