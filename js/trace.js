/* ── Trace on the map, path under the result ─────────────────────
   While a check runs the map only says it is reading. When the result
   lands, the reported path is drawn from the wallet, through each wallet on
   the way, into the Lazarus address, and the same path is laid out under the
   result as a rail: one stop per wallet, one amount per transfer. Every stop
   and transfer links to Etherscan, the Lazarus stop also links to its label
   on Arkham, and hovering either one highlights the other. */
const SVG_NS = "http://www.w3.org/2000/svg";
let tracePath = null;   // { path, hops, roles, points } for the current result

function traceLayer() {
  const svg = document.getElementById("cov-svg");
  if (!svg) return null;
  let g = document.getElementById("cov-trace");
  if (!g) {
    g = document.createElementNS(SVG_NS, "g");
    g.setAttribute("id", "cov-trace");
    g.setAttribute("aria-hidden", "true");
    svg.insertBefore(g, document.getElementById("cov-pick") || null);
  }
  return g;
}

/** While the operators evaluate: no decoration, just the status line. */
function startReading() {
  tracePath = null;
  const g = traceLayer();
  if (g) { g.innerHTML = ""; g.setAttribute("class", "trace"); }
  document.getElementById("cov-trace-hits")?.remove();
  const st = document.getElementById("cov-status");
  if (st) st.textContent = "Reading this wallet's linked wallets…";
}

/** What each stop on the path is: the wallet, a distance, or Lazarus. Distances
 *  count to the Lazarus address, the same way the map's rings do. */
function pathRoles(path) {
  const n = path.length;
  if (n === 1) return ["Lazarus"];
  return path.map((_, i) => {
    if (i === 0) return "This wallet";
    if (i === n - 1) return "Lazarus";
    const d = n - 1 - i;
    return `${d} ${d === 1 ? "hop" : "hops"}`;
  });
}

/** The transfer for each step, from the reported hops or the first edge. */
function pathHops(r) {
  const hops = Array.isArray(r.hops) ? r.hops.slice() : [];
  if (!hops[0] && r.edges?.[0]) hops[0] = { tx: r.edges[0].tx, usd: r.first_edge_usd };
  return hops;
}

/** Draw the reported path on the map. */
function drawPath(r, key) {
  const g = traceLayer();
  const svg = document.getElementById("cov-svg");
  if (!g || !svg) return;
  g.setAttribute("class", "trace done");
  g.innerHTML = "";
  document.getElementById("cov-trace-hits")?.remove();
  tracePath = null;

  const read = typeof r.counterparties_examined === "number" ? r.counterparties_examined : null;
  const foot = document.querySelector(".cov .cov-foot");
  if (foot && read !== null && !foot.querySelector(".cov-read")) {
    foot.insertAdjacentHTML("beforeend",
      `<p class="cov-sum cov-read">${read.toLocaleString("en-US")} linked ${read === 1 ? "wallet" : "wallets"} read</p>`);
  }

  const listed = r.direct_match && r.wallet;
  const path = listed ? [r.wallet] : Array.isArray(r.path) ? r.path : [];
  if (!listed && (!r.exposure || path.length < 2 || typeof r.hop_count !== "number")) return;

  // Start where the wallet sits on the map, then step inward one ring per hop
  // along the same bearing, ending on the edge of the Lazarus core.
  const pick = document.getElementById("cov-pick");
  const shown = pick && pick.style.opacity === "1" && pick._pos;
  const start = shown ? pick._pos
    : listed ? onRay(COV_R[0] - 16) : onRay((COV_R[r.hop_count - 1] + COV_R[r.hop_count]) / 2);
  const ang = Math.atan2(start[1] - COV_C, start[0] - COV_C);
  const at = (rad) => [COV_C + rad * Math.cos(ang), COV_C + rad * Math.sin(ang)];
  const points = [start];
  if (!listed) {
    for (let j = r.hop_count - 1; j >= 1; j--) points.push(at((COV_R[j - 1] + COV_R[j]) / 2));
    points.push(at(COV_R[0]));
  }

  const tone = key === "outside" ? "caution" : "block";
  const el = (name, attrs, parent = g) => {
    const e = document.createElementNS(SVG_NS, name);
    Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
    parent.appendChild(e);
    return e;
  };
  const fx = (v) => v.toFixed(1);

  // One segment per transfer, so each can be highlighted on its own.
  for (let i = 0; i < points.length - 1; i++) {
    const s = el("line", { class: `trace-seg tone-${tone}`, "data-seg": i,
      x1: fx(points[i][0]), y1: fx(points[i][1]), x2: fx(points[i + 1][0]), y2: fx(points[i + 1][1]) });
    s.style.animationDelay = `${i * 160}ms`;
  }
  // A halo behind every stop, shown only while that stop is highlighted.
  points.forEach((p, i) => el("circle", { class: `trace-halo tone-${tone}`, "data-node": i,
    cx: fx(p[0]), cy: fx(p[1]), r: "12" }));
  // The wallets between this one and Lazarus.
  points.slice(1, -1).forEach((p, k) => {
    const c = el("circle", { class: `trace-node tone-${tone}`, "data-node": k + 1, cx: fx(p[0]), cy: fx(p[1]), r: "5" });
    c.style.animationDelay = `${(k + 1) * 160}ms`;
  });

  // Hover targets sit above everything else on the map, the wallet dots included.
  const hits = el("g", { id: "cov-trace-hits", class: "trace-hits" }, svg);
  for (let i = 0; i < points.length - 1; i++) {
    el("line", { class: "trace-hit-seg", "data-seg": i,
      x1: fx(points[i][0]), y1: fx(points[i][1]), x2: fx(points[i + 1][0]), y2: fx(points[i + 1][1]) }, hits);
  }
  points.forEach((p, i) => el("circle", { class: "trace-hit", "data-node": i, cx: fx(p[0]), cy: fx(p[1]), r: "13" }, hits));

  tracePath = { path, hops: pathHops(r), roles: pathRoles(path), points };
}

/** The rail under the result: every wallet and transfer, linked to Etherscan. */
function renderPath(r, key) {
  const listed = r.direct_match && r.wallet;
  const path = listed ? [r.wallet] : Array.isArray(r.path) ? r.path : [];
  if (!listed && (!r.exposure || path.length < 2)) return "";
  const hops = pathHops(r);
  const roles = pathRoles(path);
  const tone = key === "outside" || key === "allowed" ? "caution" : "block";
  const addr = (a) => `https://etherscan.io/address/${a}`;
  const tx = (h) => `https://etherscan.io/tx/${h}`;
  const last = path.length - 1;

  const stops = path.map((a, i) => {
    const h = i < last ? hops[i] : null;
    const amount = h && typeof h.usd === "number" ? money(h.usd) : i < last ? "transfer" : "";
    const edge = i >= last ? ""
      : h?.tx ? `<a class="rail-edge" data-seg="${i}" href="${tx(h.tx)}" target="_blank" rel="noopener"
          title="This transfer on Etherscan">${esc(amount)}</a>`
      : `<span class="rail-edge" data-seg="${i}">${esc(amount)}</span>`;
    const src = i === last
      ? `<a class="rail-src" href="https://intel.arkm.com/explorer/address/${esc(a)}" target="_blank" rel="noopener"
          title="This address labeled Lazarus Group on Arkham">Labeled by Arkham ↗</a>` : "";
    return `<li class="rail-stop${i === last ? " is-lazarus" : ""}" data-node="${i}">
      ${edge}
      <span class="rail-dot" aria-hidden="true"></span>
      <a class="rail-addr" href="${addr(a)}" target="_blank" rel="noopener" title="${esc(a)} on Etherscan">${esc(short(a))}</a>
      <span class="rail-role">${esc(roles[i])}</span>
      ${src}
    </li>`;
  }).join("");

  return `<div class="path">
    <div class="text-eyebrow muted">${listed ? "Check it on Etherscan" : "The path on Etherscan"}</div>
    <ol class="rail tone-${tone}${listed ? " is-single" : ""}" style="--n:${path.length}" aria-label="Path from this wallet to the Lazarus address">${stops}</ol>
  </div>`;
}

/* ── Linking the map and the rail ─────────────────────────────── */
function traceTip() {
  const host = document.querySelector(".cov .cov-map");
  if (!host) return null;
  let tip = host.querySelector(".trace-tip");
  if (!tip) {
    tip = document.createElement("div");
    tip.className = "trace-tip";
    tip.setAttribute("role", "status");
    host.appendChild(tip);
  }
  return tip;
}

function placeTip(x, y, html) {
  const svg = document.getElementById("cov-svg");
  const tip = traceTip();
  if (!svg || !tip) return;
  const m = svg.getScreenCTM();
  if (!m) return;
  const pt = svg.createSVGPoint();
  pt.x = x; pt.y = y;
  const s = pt.matrixTransform(m);
  const box = tip.parentElement.getBoundingClientRect();
  tip.innerHTML = html;
  tip.style.left = `${s.x - box.left}px`;
  tip.style.top = `${s.y - box.top}px`;
  tip.classList.add("is-on");
}

function clearHot() {
  document.querySelectorAll(".rail .is-hot, #cov-trace .is-hot").forEach((e) => e.classList.remove("is-hot"));
  document.querySelectorAll(".rail .is-hot-edge").forEach((e) => e.classList.remove("is-hot-edge"));
  document.querySelector(".cov .trace-tip")?.classList.remove("is-on");
}

/** Highlight one stop (node) or one transfer (seg) on both the map and the rail. */
function setHot(kind, i) {
  clearHot();
  if (!tracePath) return;
  const { path, hops, roles, points } = tracePath;
  if (kind === "node") {
    document.querySelectorAll(`#cov-trace [data-node="${i}"], .rail-stop[data-node="${i}"]`)
      .forEach((e) => e.classList.add("is-hot"));
    const p = points[i];
    if (p) placeTip(p[0], p[1], `<span class="tip-addr">${esc(short(path[i]))}</span><span class="tip-role">${esc(roles[i])}</span>`);
  } else {
    document.querySelectorAll(`#cov-trace .trace-seg[data-seg="${i}"], .rail-edge[data-seg="${i}"]`)
      .forEach((e) => e.classList.add("is-hot"));
    // The rail's connector for this transfer runs out of the stop before it.
    document.querySelector(`.rail-stop[data-node="${i}"]`)?.classList.add("is-hot-edge");
    const a = points[i], b = points[i + 1];
    const usd = hops[i] && typeof hops[i].usd === "number" ? money(hops[i].usd) : null;
    if (a && b) placeTip((a[0] + b[0]) / 2, (a[1] + b[1]) / 2,
      `<span class="tip-addr">${esc(usd || "Transfer")}</span><span class="tip-role">Transfer</span>`);
  }
}

/** Wire hover, focus and tap once the rail is on the page. */
function bindPath() {
  const rail = document.querySelector(".card-result .rail");
  const hits = document.getElementById("cov-trace-hits");
  if (!tracePath) return;
  let pinned = null;
  const target = (e) => {
    const t = e.target.closest("[data-seg], [data-node]");
    if (!t) return null;
    return t.dataset.seg !== undefined ? ["seg", Number(t.dataset.seg)] : ["node", Number(t.dataset.node)];
  };
  const enter = (e) => { const t = target(e); if (t) setHot(...t); };
  const leave = () => { if (pinned) setHot(...pinned); else clearHot(); };
  if (hits) {
    hits.addEventListener("pointerover", enter);
    hits.addEventListener("pointerout", leave);
    // A tap pins the highlight, since touch has no hover.
    hits.addEventListener("click", (e) => {
      const t = target(e);
      if (!t) return;
      pinned = pinned && pinned[0] === t[0] && pinned[1] === t[1] ? null : t;
      if (pinned) setHot(...pinned); else clearHot();
    });
  }
  if (rail) {
    rail.addEventListener("pointerover", enter);
    rail.addEventListener("pointerout", leave);
    rail.addEventListener("focusin", enter);
    rail.addEventListener("focusout", leave);
  }
}
