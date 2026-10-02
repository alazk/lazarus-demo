// Serve the repo with a synthetic /api/evaluate that follows the real rules.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
export const HOST = "http://lazarus.test";
const ROOT = process.env.ROOT || new URL("../..", import.meta.url).pathname;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".woff2": "font/woff2", ".png": "image/png", ".svg": "image/svg+xml" };
// wallet -> {hop, usd}  (hop 0 = listed, null = clean)
export const W = {
  "0x0004a76e39d33edfeac7fc3c8d3994f54428a0be": { hop: 0 },
  "0x0a3b4bde9116a950a036204bf0d7a16d285f8995": { hop: 1, usd: 90473 },
  "0x001139ead8b38f353c2151af48df7d3bf2363c9d": { hop: 2, usd: 55270 },
  "0x1fc2e37e99ae7ac11353f183d7bfbb8105148bdf": { hop: 3, usd: 5857588 },
  "0x00000000219ab540356cbb839cbe05303d7705fa": { hop: null },
};
const RULES = process.env.NO_D ? [[1,0],[2,0],[3,0],[3,1000000]] : [[1,0],[2,0],[3,0],[3,1000000],[0,0]];
export function respond(addr, maxHops, minUsd, mode = "ok") {
  const a = addr.toLowerCase();
  const w = W[a] || { hop: null };
  if (mode === "fail") return { wallet: a, status: "SCREENING_FAILED", decision: "DENY", reason: "Unable to complete exposure check", detail: "The transaction history could not be read.", attestation: { status: "SKIPPED" } };
  const base = {
    wallet: a, direct_match: w.hop === 0, exposure: w.hop !== null,
    hop_count: w.hop, matched_wallet: w.hop === null ? null : "0x0004a76e39d33edfeac7fc3c8d3994f54428a0be",
    path: w.hop === null ? [] : w.hop === 0 ? [a] : [a, ...["0x7a2f00000000000000000000000000000000091c","0x5be1000000000000000000000000000000004d07"].slice(0, w.hop - 1), "0x0004a76e39d33edfeac7fc3c8d3994f54428a0be"],
    hops: w.hop ? Array.from({ length: w.hop }, (_, i) => ({ tx: "0x" + String(i + 1).repeat(64), usd: i === 0 ? w.usd : 1200000 })) : undefined,
    exposure_usd: w.usd ?? null, first_edge_usd: w.usd ?? null,
    counterparties_examined: 87, history_truncated: false, paths_through_contracts_skipped: 0,
    dataset: { seeds: 3597, max_depth: 3, min_edge_usd: 300, max_hops: maxHops, min_exposure_usd: minUsd, halo_built_at: "2026-09-10T17:23:04Z" },
    nodes: [], evaluated_at: new Date().toISOString(),
  };
  const allowAll = maxHops === 0;
  if (allowAll) base.dataset.allow_all = true;
  const deny = !allowAll && (w.hop === 0 || (w.hop !== null && w.hop <= maxHops && (w.usd ?? Infinity) >= minUsd));
  if (mode === "unattested") return { ...base, status: "ATTESTATION_FAILED", decision: "DENY", attestation: { status: "FAILED", detail: "The operators' decision could not be obtained." } };
  return { ...base, decision: deny ? "DENY" : "ALLOW", status: deny ? "NON_COMPLIANT" : "COMPLIANT",
    explorer_url: "https://explorer.newton.xyz/testnet/task/0xabfd928a31264e63a7f2fee6f84491b03e0c8448a5e2e408fbd0d970b0851b4c",
    attestation: { status: "ATTESTED", task_id: "0xabfd928a", network: "Ethereum Sepolia" } };
}
export async function open({ width = 1440, height = 900, dpr = 1, mode = "ok", delay = 1500, scheme = "light" } = {}) {
  const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr, colorScheme: scheme,
    hasTouch: width < 700, isMobile: width < 700 });
  const calls = [];
  await ctx.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== HOST) return route.abort();
    if (url.pathname === "/api/evaluate") {
      const q = url.searchParams;
      calls.push(Object.fromEntries(q));
      const h = q.get("max_hops"), u = q.get("min_usd");
      await new Promise((r) => setTimeout(r, delay));
      if (!RULES.some(([x, y]) => String(x) === h && String(y) === u))
        return route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ status: "UNSUPPORTED_RULE" }) });
      if (mode === "504") return route.fulfill({ status: 504, contentType: "text/html", body: "<html>timeout</html>" });
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(respond(q.get("address"), Number(h), Number(u), mode)) });
    }
    const p = url.pathname === "/" ? "/index.html" : url.pathname;
    const file = path.join(ROOT, p);
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return route.fulfill({ status: 404, body: "" });
    return route.fulfill({ status: 200, contentType: TYPES[path.extname(file)] || "application/octet-stream", body: fs.readFileSync(file) });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
  return { browser, page, calls, errors };
}
