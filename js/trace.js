/* ── Trace on the map ────────────────────────────────────────────
   While a check runs, faint dots appear across the rings: the wallet's
   linked wallets being read. When the result lands, the real path is drawn
   from the wallet, through each wallet on the way, into the Lazarus address.
   Every node carries its full address, and the result panel links each one,
   and each transfer, to Etherscan. */
const TRACE_DOTS = 22;

function traceLayer() {
  const svg = document.getElementById("cov-svg");
  if (!svg) return null;
  let g = document.getElementById("cov-trace");
  if (!g) {
    g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("id", "cov-trace");
    g.setAttribute("aria-hidden", "true");
    const before = document.getElementById("cov-pick");
    svg.insertBefore(g, before || null);
  }
  return g;
}

/** Linked wallets being read: dots scattered over the three rings. The
 *  positions are fixed by index so a rerun looks the same. */
function startReading() {
  const g = traceLayer();
  if (!g) return;
  g.innerHTML = "";
  g.setAttribute("class", "trace reading");
  let seed = 7;
  const rand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  for (let i = 0; i < TRACE_DOTS; i++) {
    const a = rand() * Math.PI * 2;
    const r = COV_R[0] + 10 + rand() * (COV_R[3] - COV_R[0] - 18);
    const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    c.setAttribute("class", "trace-dot");
    c.setAttribute("cx", (COV_C + r * Math.cos(a)).toFixed(1));
    c.setAttribute("cy", (COV_C + r * Math.sin(a)).toFixed(1));
    c.setAttribute("r", "3");
    c.style.animationDelay = `${Math.round(rand() * 1800)}ms`;
    g.appendChild(c);
  }
  const st = document.getElementById("cov-status");
  if (st) st.textContent = "Reading this wallet's linked wallets…";
}

/** Draw the reported path, or settle the dots if there is none. */
function drawPath(r, key) {
  const g = traceLayer();
  if (!g) return;
  g.setAttribute("class", "trace done");
  const read = typeof r.counterparties_examined === "number" ? r.counterparties_examined : null;
  const foot = document.querySelector(".cov .cov-foot");
  if (foot && read !== null && !foot.querySelector(".cov-read")) {
    foot.insertAdjacentHTML("beforeend",
      `<p class="cov-sum cov-read">${read.toLocaleString("en-US")} linked ${read === 1 ? "wallet" : "wallets"} read</p>`);
  }
  const path = Array.isArray(r.path) ? r.path : [];
  if (!r.exposure || r.direct_match || path.length < 2 || typeof r.hop_count !== "number") return;

  // Start where the wallet sits on the map, then step inward one ring per hop
  // along the same bearing, ending on the edge of the Lazarus core.
  const pick = document.getElementById("cov-pick");
  const start = pick?._pos || onRay((COV_R[r.hop_count - 1] + COV_R[r.hop_count]) / 2);
  const ang = Math.atan2(start[1] - COV_C, start[0] - COV_C);
  const at = (rad) => [COV_C + rad * Math.cos(ang), COV_C + rad * Math.sin(ang)];
  const points = [start];
  for (let j = r.hop_count - 1; j >= 1; j--) points.push(at((COV_R[j - 1] + COV_R[j]) / 2));
  points.push(at(COV_R[0]));

  const tone = key === "outside" ? "caution" : "block";
  const ns = "http://www.w3.org/2000/svg";
  const line = document.createElementNS(ns, "polyline");
  line.setAttribute("class", `trace-line tone-${tone}`);
  line.setAttribute("points", points.map((p) => p.map((v) => v.toFixed(1)).join(",")).join(" "));
  g.appendChild(line);
  // Intermediate wallets: one node per hop between the wallet and Lazarus.
  points.slice(1, -1).forEach((p, i) => {
    const c = document.createElementNS(ns, "circle");
    c.setAttribute("class", `trace-node tone-${tone}`);
    c.setAttribute("cx", p[0].toFixed(1));
    c.setAttribute("cy", p[1].toFixed(1));
    c.setAttribute("r", "5");
    c.style.animationDelay = `${(i + 1) * 180}ms`;
    const t = document.createElementNS(ns, "title");
    t.textContent = path[i + 1] || "";
    c.appendChild(t);
    g.appendChild(c);
  });
}

/** The path under the answer: every wallet and transfer, linked to Etherscan. */
function renderPath(r) {
  const addr = (a) => `https://etherscan.io/address/${a}`;
  const tx = (h) => `https://etherscan.io/tx/${h}`;
  if (r.direct_match && r.wallet) {
    return `<div class="path">
      <div class="text-eyebrow muted">Check it on Etherscan</div>
      <div class="path-row"><a class="path-node is-lazarus" href="${addr(r.wallet)}" target="_blank" rel="noopener"
        title="${esc(r.wallet)}">${esc(short(r.wallet))}<span class="path-tag">Lazarus</span></a></div>
    </div>`;
  }
  const path = Array.isArray(r.path) ? r.path : [];
  if (!r.exposure || path.length < 2) return "";
  const hops = Array.isArray(r.hops) ? r.hops : [];
  const parts = path.map((a, i) => {
    const last = i === path.length - 1;
    const cls = last ? " is-lazarus" : i === 0 ? " is-wallet" : "";
    const node = `<a class="path-node${cls}" href="${addr(a)}" target="_blank" rel="noopener" title="${esc(a)}">${esc(short(a))}${last ? '<span class="path-tag">Lazarus</span>' : ""}</a>`;
    if (last) return node;
    const h = hops[i] || (i === 0 && r.edges?.[0] ? { tx: r.edges[0].tx, usd: r.first_edge_usd } : null);
    const amount = h && typeof h.usd === "number" ? money(h.usd) : "transfer";
    const edge = h?.tx
      ? `<a class="path-edge" href="${tx(h.tx)}" target="_blank" rel="noopener" title="View this transfer on Etherscan">${esc(amount)}</a>`
      : `<span class="path-edge">${esc(amount)}</span>`;
    return node + edge;
  });
  return `<div class="path">
    <div class="text-eyebrow muted">The path, every step on Etherscan</div>
    <div class="path-row">${parts.join("")}</div>
  </div>`;
}
