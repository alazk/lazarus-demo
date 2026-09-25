/* ── Coverage map ────────────────────────────────────────────────
   Lazarus at the centre, a ring per hop, and one coverage disc that grows
   and shrinks to the reach. Drag its edge or tap a ring to change it. The
   wallet you pick lands in its ring, so you see whether the coverage
   reaches it. Reach changes update in place so the motion can play. */
const COV_C = 200;
const COV_R = [44, 96, 142, 188];          // core, then the outer edge of hops 1–3
/* Every picked wallet sits on this one ray, so changing wallets slides the
   dot straight in or out, clear of the labels stacked above the centre. */
const RAY_DEG = 45;
let pickAddr = "";

const hopWord = (n) => `${n} ${n === 1 ? "hop" : "hops"}`;
const isCovered = (d) => d !== null && d !== undefined && d !== "" && Number(d) <= hops;
function coverageSummary(ready) {
  const covered = ready.filter((w) => isCovered(DIST[w.key])).length;
  return `Screening <b>${hopWord(hops)}</b> out · ${covered} of ${ready.length} example wallets covered`;
}
function onRay(r) {
  const a = RAY_DEG * Math.PI / 180;
  return [COV_C + r * Math.cos(a), COV_C + r * Math.sin(a)];
}
/** Radius on the ray for a wallet at distance d: the edge of the centre for
 *  the listed address, the middle of its band otherwise, and just past the
 *  last ring for a wallet with no known link. */
function rayRadius(d) {
  if (d === 0) return COV_R[0] - 16;
  if (d === null || d === undefined) return COV_R[3] + 20;
  return (COV_R[d - 1] + COV_R[d]) / 2;
}

/* ── Map motion ──────────────────────────────────────────────────
   Safari is unreliable with CSS animations and transitions on SVG shapes,
   so the map never uses them. Sizes and positions are tweened from script,
   the scan pulse uses SVG's own animation elements, and nothing loops until
   a check starts. */
function motionReduced() {
  return document.body.classList.contains("is-reduced")
    || !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
}
/* cubic-bezier(0.22, 1, 0.36, 1). Must match --ease-newton. */
function easeNewton(t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const x1 = 0.22, y1 = 1, x2 = 0.36, y2 = 1;
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sampleX = (u) => ((ax * u + bx) * u + cx) * u;
  const sampleDX = (u) => (3 * ax * u + 2 * bx) * u + cx;
  let u = t;
  for (let i = 0; i < 8; i++) {
    const dx = sampleX(u) - t;
    const d = sampleDX(u);
    if (Math.abs(dx) < 1e-6 || Math.abs(d) < 1e-6) break;
    u -= dx / d;
  }
  return ((ay * u + by) * u + cy) * u;
}
function tweenAttr(el, attr, to, dur = MOTION.emphasis, ease = easeNewton) {
  if (!el) return;
  cancelAnimationFrame(el["_tw_" + attr] || 0);
  const from = parseFloat(el.getAttribute(attr)) || 0;
  if (motionReduced() || !dur || Math.abs(from - to) < 0.01) { el.setAttribute(attr, to); return; }
  const t0 = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - t0) / dur);
    el.setAttribute(attr, (from + (to - from) * ease(t)).toFixed(2));
    if (t < 1) el["_tw_" + attr] = requestAnimationFrame(step);
  };
  el["_tw_" + attr] = requestAnimationFrame(step);
}
function setPos(g, x, y) {
  if (!g) return;
  cancelAnimationFrame(g._twPos || 0);
  g._pos = [x, y];
  g.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
}
function tweenPos(g, x, y, dur = Math.round(MOTION.emphasis * 0.75), ease = easeNewton) {
  if (!g) return;
  const from = g._pos;
  if (!from || motionReduced()) { setPos(g, x, y); return; }
  cancelAnimationFrame(g._twPos || 0);
  const t0 = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - t0) / dur), e = ease(t);
    const px = from[0] + (x - from[0]) * e, py = from[1] + (y - from[1]) * e;
    g.setAttribute("transform", `translate(${px.toFixed(1)} ${py.toFixed(1)})`);
    if (t < 1) g._twPos = requestAnimationFrame(step); else g._pos = [x, y];
  };
  g._twPos = requestAnimationFrame(step);
}
/** Map token, for SMIL values that must match tokens.css. */
function mapToken(token) {
  return getComputedStyle(document.documentElement).getPropertyValue(token).trim();
}
function mapStroke(token) { return mapToken(token); }
/** Three rings leaving the centre in turn, drawn with SVG animation. */
function pulseRings(id, rTo) {
  const c = COV_C, r0 = COV_R[0];
  const dur = MOTION.pulseCycle + "ms";
  const ghost = mapToken("--map-alpha-ghost"), muted = mapToken("--map-alpha-muted"), live = mapToken("--map-alpha-live");
  return `<g class="spulse" id="${id}" display="none">${[0, 1, 2].map((i) => {
    const r = motionReduced() ? (rTo * [1, .72, .46][i]).toFixed(1) : null;
    const begin = (i * MOTION.pulseGap / 1000).toFixed(1) + "s";
    return `<circle cx="${c}" cy="${c}" r="${motionReduced() ? r : r0}" fill="none" stroke-opacity="0">
      <animate attributeName="r" values="${motionReduced() ? `${r};${r}` : `${r0};${rTo.toFixed(1)}`}" dur="${dur}"
        begin="${begin}" repeatCount="indefinite" calcMode="spline" keyTimes="0;1" keySplines=".2 .6 .3 1"/>
      <animate attributeName="stroke-opacity" values="${motionReduced() ? `${ghost};${muted};${ghost}` : `0;${live};0`}" keyTimes="${motionReduced() ? "0;.5;1" : "0;.12;1"}"
        dur="${dur}" begin="${begin}" repeatCount="indefinite"/>
    </circle>`; }).join("")}</g>`;
}
function setPulseReach(g, rTo) {
  if (!g) return;
  const dur = MOTION.pulseCycle + "ms";
  const ghost = mapToken("--map-alpha-ghost"), muted = mapToken("--map-alpha-muted"), live = mapToken("--map-alpha-live");
  g.querySelectorAll("circle").forEach((c, i) => {
    const radius = c.querySelector('animate[attributeName="r"]');
    const fade = c.querySelector('animate[attributeName="stroke-opacity"]');
    if (radius) {
      radius.setAttribute("dur", dur);
      if (motionReduced()) { const r = (rTo * [1, .72, .46][i]).toFixed(1); radius.setAttribute("values", `${r};${r}`); }
      else radius.setAttribute("values", `${COV_R[0]};${rTo.toFixed(1)}`);
    }
    if (fade) {
      fade.setAttribute("dur", dur);
      fade.setAttribute("values", motionReduced() ? `${ghost};${muted};${ghost}` : `0;${live};0`);
      fade.setAttribute("keyTimes", motionReduced() ? "0;.5;1" : "0;.12;1");
    }
  });
}
function beginAll(el) { el?.querySelectorAll("animate").forEach((a) => { try { a.beginElement(); } catch (_) {} }); }

/* ── Radius preview and the opening demonstration ─────────────────
   Hovering a ring or a switch shows what that radius would cover before
   you commit to it. On first arrival the coverage sweeps out and back so
   the control explains itself, then settles on the real setting. */
let previewing = false;
let previewAt = 0;
function previewReach(n) {
  if (demoTimers.length) return;              // the demo is speaking
  if (n === hops) {                           // already the chosen radius
    if (previewing) endPreview();
    return;
  }
  if (previewing && previewAt === n) return;  // already showing this one
  previewing = true;
  previewAt = n;
  const svg = document.getElementById("cov-svg");
  svg?.querySelectorAll(".cov-ring, .cov-pill").forEach((r) => {
    if (Number(r.dataset.ring) === n) r.dataset.preview = "true";
    else r.removeAttribute("data-preview");
  });
  document.getElementById("cov-ghost")?.removeAttribute("data-state");
  const ready = presets.filter((p) => p.address);
  const covered = ready.filter((w) => { const dd = DIST[w.key]; return dd !== null && dd !== undefined && dd <= n; }).length;
  const sum = document.getElementById("cov-sum");
  if (sum) sum.innerHTML = `Would cover <b>${covered} of ${ready.length}</b> example wallets at ${hopWord(n)}`;
}
function endPreview() {
  if (!previewing) return;
  previewing = false;
  previewAt = 0;
  document.getElementById("cov-svg")?.querySelectorAll("[data-preview]")
    .forEach((r) => r.removeAttribute("data-preview"));
  document.getElementById("cov-ghost")?.removeAttribute("data-state");
  if (!demoTimers.length) paintReach(hops);
}

let radiusDemoShown = false;
let demoTimers = [];
function stopRadiusDemo(restore = true) {
  if (!demoTimers.length) return;
  demoTimers.forEach(clearTimeout);
  demoTimers = [];
  if (restore) applyReach();
}
/** One slow pass: the coverage draws in to a single hop, opens back out to
 *  three, and settles on the real setting. Smooth, no overshoot, and the
 *  list and the summary stay put so only the coverage moves. */
function playRadiusDemo() {
  if (radiusDemoShown || motionReduced() || !document.getElementById("cov-disc")) return;
  radiusDemoShown = true;
  const smooth = { ease: easeNewton, mapOnly: true };
  const hopIn = MOTION.beat - MOTION.interaction;
  const open = MOTION.emphasis + MOTION.interaction + Math.round(MOTION.interaction / 3);
  const settle = MOTION.emphasis + Math.round(MOTION.interaction / 3);
  const t1 = Math.round(MOTION.emphasis * 5 / 6);
  const t2 = MOTION.beat + MOTION.interaction;
  const t3 = t2 + open + Math.round(MOTION.interaction * 0.4);
  const end = t3 + settle + Math.round(MOTION.interaction * 4 / 15);
  [[1, t1, hopIn], [3, t2, open], [hops, t3, settle]]
    .forEach(([n, at, dur]) => demoTimers.push(setTimeout(() => drawRadius(n, dur, smooth), at)));
  demoTimers.push(setTimeout(() => { demoTimers = []; applyReach(); }, end));
}

/* Labels are drawn in viewBox units. --map-scale cancels that, so type
   stays at the caption size however wide the svg is rendered. */
function syncMapScale(svg) {
  const w = svg.clientWidth;
  const scale = w > 0 ? w / 400 : 1;
  svg.style.setProperty("--map-scale", String(scale));
  const compact = w > 0 && w < 200;
  svg.classList.toggle("is-compact", compact);
  const host = svg.closest(".cov, .ring-fig");
  if (host) host.classList.toggle("is-compact", compact);
  const line = host?.querySelector(".reach-line");
  if (!line) return;
  line.textContent = svg.classList.contains("intro-map")
    ? [1, 2, 3].map(hopWord).join(" · ")
    : hopWord(hops);
}
const mapScaleObserver = new ResizeObserver((entries) => {
  entries.forEach((entry) => syncMapScale(entry.target));
});
function watchMapScales(root) {
  (root || document).querySelectorAll(".cov-svg, .intro-map").forEach((svg) => {
    if (svg._mapScale) return;
    svg._mapScale = true;
    mapScaleObserver.observe(svg);
    syncMapScale(svg);
  });
}
function installMapScale() {
  watchMapScales(document);
  new MutationObserver(() => watchMapScales(document))
    .observe(document.documentElement, { childList: true, subtree: true });
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", installMapScale);
else installMapScale();
