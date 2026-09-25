/* ── Shareable state ──────────────────────────────────────────────
   The radius and the chosen wallet live in the address bar, so a link
   carries the exact setup: ?wallet=D&hops=2. Entering the console and
   reaching a result are history entries, so Back steps back. */
function stateUrl() {
  const p = new URLSearchParams();
  p.set("hops", String(hops));
  const addr = (document.getElementById("addr")?.value || "").trim();
  const known = presets.find((w) => w.address.toLowerCase() === addr.toLowerCase());
  if (known) p.set("wallet", WALLET_LETTER[known.key] || known.key);
  else if (/^0x[0-9a-fA-F]{40}$/.test(addr)) p.set("wallet", addr);
  return location.pathname + "?" + p.toString();
}
let freezeUrl = false;
function syncUrl(push = false) {
  if (freezeUrl) return;
  try {
    const u = stateUrl();
    if (push) history.pushState({ view }, "", u);
    else history.replaceState({ view }, "", u);
  } catch (e) { /* file:// and private modes */ }
}
/** Read ?wallet= and ?hops= into a starting state. */
function stateFromUrl() {
  let params;
  try { params = new URLSearchParams(location.search); } catch (e) { return null; }
  const h = Number(params.get("hops"));
  const w = (params.get("wallet") || "").trim();
  if (!h && !w) return null;
  const letter = w.length === 1 ? w.toUpperCase() : "";
  const byLetter = Object.keys(WALLET_LETTER).find((k) => WALLET_LETTER[k] === letter);
  const preset = byLetter ? presets.find((p) => p.key === byLetter) : null;
  return {
    hops: HOP_CHOICES.includes(h) ? h : null,
    address: preset ? preset.address : (/^0x[0-9a-fA-F]{40}$/.test(w) ? w : ""),
  };
}

let mapMode = "console";
function renderCoverage(ready, mode = "console") {
  mapMode = mode;
  const c = COV_C, k = COV_R[hops] / COV_R[3];
  const pills = [1, 2, 3].map((n) => {
    const y = c - (COV_R[n - 1] + COV_R[n]) / 2;
    return `<g class="cov-pill" data-reach="${n <= hops ? "in" : "out"}" aria-pressed="${n === hops}" data-ring="${n}" transform="translate(${c} ${y})">
      <rect x="-32" y="-12" width="64" height="24" rx="12"/>
      <text y="4" text-anchor="middle">${hopWord(n)}</text></g>`;
  }).join("");
  return `
    <div class="cov">
      ${mode === "scan" ? "" : `
      <div class="cov-seg" role="group" aria-label="Coverage">
        ${[1, 2, 3].map((n) => `<button class="m-seg-btn text-ui" type="button"
          data-hops="${n}" aria-pressed="${n === hops}"
          ${HOP_CHOICES.includes(n) ? "" : "disabled"}>${hopWord(n)}</button>`).join("")}
      </div>`}
      <div class="cov-map">
      <svg class="cov-svg ${mode === "scan" ? "scanning" : ""}" id="cov-svg" viewBox="0 0 400 400" tabindex="${mode === "scan" ? "-1" : "0"}" role="${mode === "scan" ? "img" : "slider"}"
           aria-label="Coverage in hops" aria-valuemin="1" aria-valuemax="3" aria-valuenow="${hops}"
           aria-valuetext="${hopWord(hops)}">
        <circle class="cov-disc" id="cov-disc" cx="${c}" cy="${c}" r="${COV_R[hops]}"/>
        ${[3, 2, 1].map((n) => `<circle class="cband" data-band="${n}" cx="${c}" cy="${c}" r="${COV_R[n]}"/>`).join("")}
        ${[1, 2, 3].map((n) => `<circle class="cov-ring" data-reach="${n <= hops ? "in" : "out"}" aria-pressed="${n === hops}" data-ring="${n}" cx="${c}" cy="${c}" r="${COV_R[n]}"/>`).join("")}
        <circle class="map-focus map-focus-slider" cx="${c}" cy="${c}" r="${COV_R[hops]}" fill="none"/>
        ${mode === "scan" ? pulseRings("cov-spulse", COV_R[hops]) : ""}
        <circle class="sflash" id="cov-flash" cx="${c}" cy="${c}" r="${COV_R[1]}" fill="none" stroke-opacity="0">
          <animate attributeName="stroke-opacity" values="${mapToken("--map-alpha-live")};0" dur="${MOTION.flash}ms" begin="indefinite" fill="freeze"/>
          ${motionReduced() ? "" : `<animate attributeName="stroke-width" values="${mapStroke("--map-stroke-strong")};${mapStroke("--map-stroke-ring")}" dur="${MOTION.flash}ms" begin="indefinite" fill="freeze"/>`}
        </circle>
        <circle class="cov-ghost" id="cov-ghost" cx="${c}" cy="${c}" r="${COV_R[hops]}"/>
        <circle class="swave" id="cov-wave" cx="${c}" cy="${c}" r="${COV_R[0]}" fill="none"/>
        <circle class="cov-core-pick" id="cov-core-pick" cx="${c}" cy="${c}" r="${COV_R[0]}" fill="none" stroke-opacity="0">
          <animate attributeName="r" values="${motionReduced() ? `${COV_R[0]};${COV_R[0]}` : `${COV_R[0]};${COV_R[0] + 10}`}" dur="${MOTION.pulseCycle}ms" begin="indefinite" repeatCount="indefinite"/>
          <animate attributeName="stroke-opacity" values="${motionReduced() ? `${mapToken("--map-alpha-ghost")};${mapToken("--map-alpha-muted")};${mapToken("--map-alpha-ghost")}` : `${mapToken("--map-alpha-live")};0`}" dur="${MOTION.pulseCycle}ms" begin="indefinite" repeatCount="indefinite"/>
        </circle>
        <circle class="cov-core" cx="${c}" cy="${c}" r="${COV_R[0]}"/>
        <text class="cov-core-label" x="${c}" y="${c + 5}" text-anchor="middle">Lazarus</text>
        ${pills}
        <g class="cov-pick" id="cov-pick" style="opacity:0">
          <circle class="cov-pick-hit" r="24"/>
          <circle class="sburst" r="10" fill="none" stroke-opacity="0">
            <animate attributeName="r" values="${motionReduced() ? "10;10" : "10;40"}" dur="${MOTION.burst}ms" begin="indefinite" repeatCount="1"/>
            <animate attributeName="stroke-opacity" values="${motionReduced() ? `${mapToken("--map-alpha-live")};0` : "1;0"}" dur="${MOTION.burst}ms" begin="indefinite" repeatCount="1" fill="freeze"/>
          </circle>
          <circle class="spick-pulse" r="12" fill="none" stroke-opacity="0">
            <animate attributeName="r" values="${motionReduced() ? "14;14" : "9;24"}" dur="${MOTION.pickPulse}ms" begin="indefinite" repeatCount="indefinite"/>
            <animate attributeName="stroke-opacity" values="${mapToken("--map-alpha-live")};0" dur="${MOTION.pickPulse}ms" begin="indefinite" repeatCount="indefinite"/>
          </circle>
          <circle class="cov-pick-ring" r="17"/>
          <circle class="cov-pick-dot" r="6"/>
        </g>
        <g class="wdots">${ready.map((w) => {
          const [x, y] = walletXY(w.key), dd = DIST[w.key];
          const inside = dd === 0 || isCovered(dd);
          return `<g class="wdot${dd === 0 ? " on-core" : ""}" data-reach="${inside ? "in" : "out"}" data-addr="${esc(w.address)}" data-dist="${dd ?? ""}"
            transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"
            ${mode === "scan" ? "" : `role="button" tabindex="0" aria-label="Wallet ${esc(WALLET_LETTER[w.key] || "")}"`}>
            <circle class="wdot-ring" r="17"/><circle r="13"/><circle class="wdot-fill" r="0"/><text y="4.5" text-anchor="middle">${esc(WALLET_LETTER[w.key] || "")}</text><circle class="map-focus" r="18" fill="none"/></g>`;
        }).join("")}</g>
      </svg>
      </div>
      <p class="reach-line"></p>
      <div class="cov-foot">
        ${mode === "scan" ? `
        <p class="cov-status" id="cov-status">Scanning outward from the centre…</p>
        <p class="cov-sum">Radius <b>${hopWord(hops)}</b></p>` : `
        <p class="cov-sum" id="cov-sum">${coverageSummary(ready)}</p>`}
      </div>
    </div>`;
}

/** Place the picked wallet on the map, in the band for its distance. */
function placePick(addr) {
  pickAddr = String(addr || "").trim().toLowerCase();
  const g = document.getElementById("cov-pick");
  if (!g) return;
  const w = presets.find((x) => x.address.toLowerCase() === pickAddr);
  document.querySelectorAll("#cov-svg .wdot").forEach((el) => {
    const on = (el.dataset.addr || "").toLowerCase() === pickAddr;
    el.setAttribute("aria-pressed", String(on));
    const fill = el.querySelector(".wdot-fill");
    if (fill) fill.setAttribute("r", "0");
  });
  if (!w) {
    const core = document.getElementById("cov-core-pick");
    if (core) core.removeAttribute("data-state");
    g.style.opacity = "0";
    return;
  }
  const d = DIST[w.key];
  const ring = document.getElementById("cov-core-pick");
  if (ring) { if (d === 0) ring.dataset.state = "live"; else ring.removeAttribute("data-state"); }
  const [x, y] = walletXY(w.key);
  const cls = "cov-pick" + (d === 0 || isCovered(d) ? "" : " not") + (d === 0 ? " on-core" : "");
  g.setAttribute("class", cls);
  g.style.opacity = "1";
  tweenPos(g, x, y);
}

/** Update everything that depends on the reach without redrawing, so the
 *  disc, the knob and the rows can animate to their new state. */
/** Paint the map, the list and the switch as they would look at radius n.
 *  Used for the real radius, for the hover preview and for the opening
 *  demonstration. It never changes the policy itself. */
function paintReach(n, ready, opts = {}) {
  ready = ready || presets.filter((p) => p.address);
  const svg = document.getElementById("cov-svg");
  if (svg) {
    svg.querySelectorAll(".cov-ring").forEach((r) => {
      const ring = Number(r.dataset.ring);
      r.setAttribute("data-reach", ring <= n ? "in" : "out");
      r.setAttribute("aria-pressed", String(ring === n));
      r.removeAttribute("data-preview");
    });
    const focus = svg.querySelector(".map-focus-slider");
    if (focus) focus.setAttribute("r", COV_R[n]);
    svg.querySelectorAll(".cov-pill").forEach((g) => {
      const ring = Number(g.dataset.ring);
      g.setAttribute("data-reach", ring <= n ? "in" : "out");
      g.setAttribute("aria-pressed", String(ring === n));
      g.removeAttribute("data-preview");
      g.setAttribute("class", "cov-pill");
    });
    svg.querySelectorAll(".wdot").forEach((el) => {
      const raw = el.dataset.dist, dd = raw === "" ? null : Number(raw);
      const inside = dd === 0 || (dd !== null && dd <= n);
      el.setAttribute("data-reach", inside ? "in" : "out");
    });
  }
  const covered = ready.filter((w) => { const dd = DIST[w.key]; return dd !== null && dd !== undefined && dd <= n; }).length;
  const sum = document.getElementById("cov-sum");
  if (sum && !opts.mapOnly) sum.innerHTML = `Screening <b>${hopWord(n)}</b> out · ${covered} of ${ready.length} example wallets covered`;
  document.querySelectorAll(".cov .reach-line").forEach((line) => { line.textContent = hopWord(n); });
  if (opts.mapOnly) return;
  stage.querySelectorAll(".m-row").forEach((row) => {
    const raw = row.dataset.dist, dd = raw === "" ? null : Number(raw);
    const inside = dd !== null && dd !== undefined && dd <= n;
    row.setAttribute("data-reach", inside ? "in" : "out");
    const sub = row.querySelector(".m-sub");
    if (sub && row.dataset.key) {
      const st = dd === null || dd === undefined ? "" : inside ? "covered" : "not covered";
      sub.innerHTML = `<span class="sub-note">${esc(WALLET_NOTE[row.dataset.key] || "")}</span>`
        + `<span class="sub-sep">${st ? " · " : ""}</span><span class="sub-status">${esc(st)}</span>`;
      row.classList.toggle("nostatus", !st);
    }
  });
  stage.querySelectorAll(".m-seg-btn").forEach((b) => {
    const on = Number(b.dataset.hops) === n;
    b.setAttribute("aria-pressed", String(on));
  });
}

/** Move the coverage to radius n on the map. */
function drawRadius(n, dur = MOTION.emphasis, opts = {}) {
  const ease = opts.ease || easeNewton;
  tweenAttr(document.getElementById("cov-disc"), "r", COV_R[n], dur, ease);
  paintReach(n, null, opts);
}

/** Update everything that depends on the reach without redrawing, so the
 *  disc, the rows and the switch can animate to their new state. */
function applyReach() {
  const svg = document.getElementById("cov-svg");
  drawRadius(hops);
  if (svg) {
    svg.setAttribute("aria-valuenow", hops);
    svg.setAttribute("aria-valuetext", hopWord(hops));
    placePick(pickAddr);
  }
}
