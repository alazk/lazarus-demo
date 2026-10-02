import { open, HOST } from "./harness.mjs";
import fs from "node:fs";
const OUT = new URL("./assets", import.meta.url).pathname;
const notes = {};
const W = Number(process.env.W || 1440), H = Number(process.env.H || 900);
const sfx = W < 700 ? "-m" : "";
const only = process.env.ONLY ? process.env.ONLY.split(",") : null;

async function session(mode = "ok", env = {}) {
  Object.assign(process.env, env);
  const s = await open({ width: W, height: H, delay: 900, mode });
  return s;
}
async function snap(page, name) {
  await page.screenshot({ path: `${OUT}/${name}${sfx}.png`, fullPage: W < 700 });
  notes[name + sfx] = await page.evaluate(() => ({
    title: document.title,
    headings: [...document.querySelectorAll(".text-display, .text-heading, .text-title, h1, h2")].map((e) => e.textContent.trim()).filter(Boolean).slice(0, 8),
    buttons: [...document.querySelectorAll("button, a.btn")].filter((b) => b.offsetParent).map((b) => b.textContent.trim().replace(/\s+/g, " ")).filter(Boolean).slice(0, 12),
    copy: (document.querySelector("#stage") || document.body).innerText.replace(/\n{2,}/g, "\n").slice(0, 900),
    overflow: document.scrollingElement.scrollHeight - innerHeight,
  }));
}
async function toPolicy(page) { await page.goto(HOST + "/"); await page.click("#go-console"); await page.waitForTimeout(500); }
async function toWallet(page, pol = "3") { await toPolicy(page); await page.click(`.policy-opt[data-hops="${pol}"]`); await page.click("#use-policy"); await page.waitForTimeout(400); }
async function run(page, key) { await page.click(`.m-row[data-key="${key}"] >> visible=true`); await page.click("#run"); }

const plan = [
  ["01-intro-why", async (p) => { await p.goto(HOST + "/"); await p.waitForTimeout(900); }],
  ["02-intro-demo", async (p) => { await p.goto(HOST + "/"); await p.waitForTimeout(500); await p.click("#next-act"); await p.waitForTimeout(800); }],
  ["03-intro-policy", async (p) => { await p.goto(HOST + "/"); await p.waitForTimeout(500); await p.click("#next-act"); await p.waitForTimeout(500); await p.click("#next-act"); await p.waitForTimeout(800); }],
  ["04-intro-enforcement", async (p) => { await p.goto(HOST + "/"); await p.waitForTimeout(500); for (let i = 0; i < 3; i++) { await p.click("#next-act"); await p.waitForTimeout(500); } await p.waitForTimeout(400); }],
  ["05-policy-default", async (p) => { await toPolicy(p); await p.waitForTimeout(3500); }],
  ["06-policy-d", async (p) => { await toPolicy(p); await p.click('.policy-opt[data-hops="0"]'); await p.waitForTimeout(900); }],
  ["07-wallet", async (p) => { await toWallet(p); }],
  ["08-invalid-address", async (p) => { await toWallet(p); const pl = p.locator("#d-paste, .m-paste").filter({ visible: true }).first(); if (await pl.count()) await pl.click(); await p.fill("#addr", "0x123"); await p.locator("#addr").blur(); await p.waitForTimeout(400); }],
  ["09-checking", async (p) => { await toWallet(p); await run(p, "three"); await p.waitForTimeout(700); }],
  ["10-result-3hop", async (p) => { await toWallet(p); await run(p, "three"); await p.waitForTimeout(5500); }],
  ["11-result-hover", async (p) => { await toWallet(p); await run(p, "three"); await p.waitForTimeout(5500);
      const b = await p.locator('#cov-trace-hits .trace-hit[data-node="2"]').boundingBox(); if (b) await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await p.waitForTimeout(300); }],
  ["12-result-listed", async (p) => { await toWallet(p); await run(p, "direct"); await p.waitForTimeout(5000); }],
  ["13-result-clean", async (p) => { await toWallet(p); await run(p, "clean"); await p.waitForTimeout(5500); }],
  ["14-result-outside", async (p) => { await toWallet(p, "1"); await run(p, "three"); await p.waitForTimeout(5500); }],
  ["15-result-allowed", async (p) => { await toWallet(p, "0"); await run(p, "direct"); await p.waitForTimeout(5000); }],
];
const errPlan = [
  ["16-result-failed", "fail"], ["17-result-unattested", "unattested"], ["18-result-504", "504"],
];
for (const [name, fn] of plan) {
  if (only && !only.includes(name)) continue;
  const { browser, page, errors } = await session();
  await fn(page); await snap(page, name);
  if (errors.length) notes[name + sfx].errors = errors;
  await browser.close();
}
for (const [name, mode] of errPlan) {
  if (only && !only.includes(name)) continue;
  const { browser, page, errors } = await session(mode);
  await toWallet(page); await run(page, "one"); await page.waitForTimeout(4000);
  await snap(page, name); if (errors.length) notes[name + sfx].errors = errors;
  await browser.close();
}
if (!only || only.includes("19-not-deployed")) {
  const { browser, page, errors } = await session("ok", { NO_D: "1" });
  await toWallet(page, "0"); await run(page, "direct"); await page.waitForTimeout(3000);
  await snap(page, "19-not-deployed"); notes["19-not-deployed" + sfx].errors = errors; delete process.env.NO_D;
  await browser.close();
}
if (!only || only.includes("20-deep-link")) {
  const { browser, page } = await session();
  await page.goto(HOST + "/?wallet=D&hops=2"); await page.waitForTimeout(1200);
  await snap(page, "20-deep-link"); await browser.close();
}
const file = `${OUT}/notes.json`;
const prev = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
fs.writeFileSync(file, JSON.stringify({ ...prev, ...notes }, null, 1));
console.log(Object.entries(notes).map(([k, v]) => `${k} overflow ${v.overflow}${v.errors?.length ? " ERR " + v.errors.join("|") : ""}`).join("\n"));
