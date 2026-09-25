function renderChain() {
  const c = COV_C;
  const a = 60 * Math.PI / 180, rr = (COV_R[2] + COV_R[3]) / 2;
  const px = COV_C + rr * Math.cos(a), py = COV_C + rr * Math.sin(a);
  const pills = [1, 2, 3].map((n) => {
    const y = c - (COV_R[n - 1] + COV_R[n]) / 2;
    return `<g class="cov-pill" data-ring="${n}" transform="translate(${c} ${y})">
      <rect x="-32" y="-12" width="64" height="24" rx="12"/>
      <text y="4" text-anchor="middle">${hopWord(n)}</text></g>`;
  }).join("");
  return `<div class="ring-fig">
    <svg class="cov-svg intro-map" id="intro-map" viewBox="0 0 400 400" role="img"
         aria-label="Coverage from a known Lazarus address, in rings">
      <circle class="cov-disc" id="intro-disc" cx="${c}" cy="${c}" r="0"/>
      ${[1, 2, 3].map((n) => `<circle class="cov-ring out" data-ring="${n}" cx="${c}" cy="${c}" r="${COV_R[n]}"/>`).join("")}
      <circle class="cov-core" cx="${c}" cy="${c}" r="${COV_R[0]}"/>
      <text class="cov-core-label" x="${c}" y="${c + 5}" text-anchor="middle">Lazarus</text>
      ${pills}
      <g class="wdot intro-pick" transform="translate(${px.toFixed(1)} ${py.toFixed(1)})">
        <circle r="13"/><text y="4.5" text-anchor="middle">W</text>
        <rect class="intro-pick-plate" x="-62" y="18" width="124" height="24" rx="12"/>
        <text class="intro-pick-label" y="34" text-anchor="middle">Wallet you pay</text>
      </g>
    </svg>
    <p class="reach-line"></p>
    <p class="ring-note" id="ring-note"></p>
  </div>`;
}

/** Move the whole intro to an act: the copy crossfades, the chain restates. */
function paintAct(n, animate = true) {
  act = n;
  const a = ACTS[n];

  // All three acts share one grid cell, so the block is always as tall as the
  // longest act and the buttons below it never move.
  stage.querySelectorAll(".act-panel").forEach((p, i) => {
    p.classList.toggle("on", i === n);
    p.setAttribute("aria-hidden", String(i !== n));
  });

  const svg = document.getElementById("intro-map");
  if (svg) {
    const r = a.cover === "all" ? COV_R[3] : a.cover === "core" ? COV_R[0] + 10 : 0;
    const introDur = animate ? MOTION.emphasis + Math.round(MOTION.interaction / 3) : 0;
    tweenAttr(document.getElementById("intro-disc"), "r", r, introDur);
    svg.querySelectorAll(".cov-ring").forEach((r) =>
      r.setAttribute("class", `cov-ring ${a.cover === "all" ? "in" : "out"}`));
    svg.querySelectorAll(".cov-pill").forEach((g) =>
      g.setAttribute("class", `cov-pill ${a.cover === "all" ? "on" : ""}`));
    // The wallet you pay: outside the list's coverage, inside the policy's.
    svg.querySelector(".intro-pick")?.setAttribute("class",
      `wdot intro-pick ${a.cover === "all" ? "in" : "out"}`);
  }
  const note = document.getElementById("ring-note");
  if (note) note.textContent = a.note || "";

  stage.querySelectorAll(".act-dot").forEach((d, i) => {
    d.classList.toggle("on", i === n);
    d.setAttribute("aria-current", i === n ? "step" : "false");
  });
}

function renderIntro() {
  stage.className = "stage";
  stage.innerHTML = `
    <div class="intro">
      <div class="intro-grid">
        <div class="act">
          <div id="act-copy">
            ${ACTS.map((a, i) => `<div class="act-panel ${i === 0 ? "on" : ""}" aria-hidden="${i !== 0}">
              <div class="text-label text-label--phone-eyebrow">${esc(a.kicker)}</div>
              <div class="text-heading">${esc(a.title)}</div>
              <p class="text-lead">${esc(a.body)}</p>
            </div>`).join("")}
          </div>
          <div class="intro-foot">
            <button class="btn btn-primary btn-lg" id="go-console">Screen a wallet</button>
            <button class="btn btn-tertiary btn-md" id="next-act">Next</button>
            <div class="acts">
              ${ACTS.map((_, i) => `<button class="act-dot" type="button"
                data-act="${i}" aria-label="Section ${i + 1}"></button>`).join("")}
            </div>
          </div>
        </div>
        <div class="act-figure">${renderChain()}</div>
      </div>
    </div>`;

  document.getElementById("go-console").onclick = () => {
    stopAuto(); view = "console"; renderConsole(); syncUrl(true);
  };
  const next = document.getElementById("next-act");
  if (next) next.onclick = () => {
    stopAuto();
    if (act >= ACTS.length - 1) { view = "console"; renderConsole(); return; }
    paintAct(act + 1);
  };
  stage.querySelectorAll(".act-dot").forEach((b) => {
    b.onclick = () => { stopAuto(); paintAct(Number(b.dataset.act)); };
  });

  paintAct(act, false);
  startAuto();
}

/* The three acts are an argument, so they advance on their own until the
   reader takes over. Any interaction stops it for good. */
let autoTimer = null;
function startAuto() {
  stopAuto();
  if (motionReduced()) return;
  autoTimer = setInterval(() => {
    if (view !== "intro") return stopAuto();
    if (act >= ACTS.length - 1) {
      stopAuto();
      view = "console";
      renderConsole();
      return;
    }
    paintAct(act + 1);
  }, MOTION.cycle + MOTION.beat + Math.round(MOTION.interaction * 2 / 3));
}
function stopAuto() {
  if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
}
