function renderChain() {
  const c = COV_C;
  const py = c + (COV_R[2] + COV_R[3]) / 2;
  const pills = [1, 2, 3].map((n) => {
    const y = c - (COV_R[n - 1] + COV_R[n]) / 2;
    return `<g class="cov-pill" data-reach="out" data-ring="${n}" transform="translate(${c} ${y})">
      <rect x="-32" y="-12" width="64" height="24" rx="12"/>
      <text y="4" text-anchor="middle">${hopWord(n)}</text></g>`;
  }).join("");
  return `<div class="ring-fig">
    <svg class="cov-svg intro-map" id="intro-map" viewBox="0 0 400 400" role="img"
         aria-label="Coverage from a known Lazarus address, in rings">
      <circle class="cov-disc" id="intro-disc" cx="${c}" cy="${c}" r="0"/>
      ${[1, 2, 3].map((n) => `<circle class="cov-ring" data-reach="out" data-ring="${n}" cx="${c}" cy="${c}" r="${COV_R[n]}"/>`).join("")}
      <circle class="cov-core" cx="${c}" cy="${c}" r="${COV_R[0]}"/>
      <text class="cov-core-label" x="${c}" y="${c + 5}" text-anchor="middle">Lazarus</text>
      ${pills}
      <g class="wdot intro-pick" data-reach="out" transform="translate(${c} ${py.toFixed(1)})">
        <circle r="13"/><text y="4.5" text-anchor="middle">W</text>
        <rect class="intro-pick-plate" x="0" y="18" width="124" height="24" rx="12"/>
        <text class="intro-pick-label" x="0" y="30" text-anchor="middle">Wallet you pay</text>
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
    p.setAttribute("aria-hidden", String(i !== n));
  });

  const svg = document.getElementById("intro-map");
  if (svg) {
    const hops = a.cover === "all" ? 3 : a.cover === "none" ? 0 : Number(a.cover) || 0;
    const r = hops === 0 ? 0 : COV_R[hops];
    const introDur = animate ? MOTION.emphasis + Math.round(MOTION.interaction / 3) : 0;
    tweenAttr(document.getElementById("intro-disc"), "r", r, introDur);
    svg.querySelectorAll(".cov-ring").forEach((ring) => {
      const n = Number(ring.dataset.ring);
      ring.setAttribute("class", "cov-ring");
      ring.setAttribute("data-reach", n <= hops ? "in" : "out");
      ring.setAttribute("aria-pressed", String(n === hops));
    });
    svg.querySelectorAll(".cov-pill").forEach((g) => {
      const n = Number(g.dataset.ring);
      g.setAttribute("class", "cov-pill");
      g.setAttribute("data-reach", n <= hops ? "in" : "out");
      g.setAttribute("aria-pressed", String(n === hops));
    });
    const pick = svg.querySelector(".intro-pick");
    if (pick) {
      pick.setAttribute("class", "wdot intro-pick");
      pick.setAttribute("data-reach", hops >= 3 ? "in" : "out");
    }
  }
  const note = document.getElementById("ring-note");
  if (note) note.textContent = a.note || "";

  stage.querySelectorAll(".act-dot").forEach((d, i) => {
    if (i === n) d.setAttribute("aria-current", "step");
    else d.removeAttribute("aria-current");
  });
}

function renderIntro() {
  stage.className = "stage";
  stage.innerHTML = `
    <div class="intro">
      <div class="intro-grid">
        <div class="act">
          <div class="acts">
            ${ACTS.map((_, i) => `<button class="act-dot" type="button"
              data-act="${i}" aria-label="Section ${i + 1}"></button>`).join("")}
          </div>
          <div class="act-copy" id="act-copy">
            ${ACTS.map((a, i) => `<div class="act-panel" aria-hidden="${i !== 0}">
              <div class="text-label text-label--phone-eyebrow">${esc(a.kicker)}</div>
              <div class="text-heading">${esc(a.title)}</div>
              <p class="text-lead">${esc(a.body)}</p>
            </div>`).join("")}
          </div>
          <div class="intro-foot">
            ${button.render({ label: "Screen a wallet", id: "go-console", variant: "primary", size: "lg" })}
            ${button.render({ label: "Next", id: "next-act", variant: "tertiary", size: "md" })}
          </div>
        </div>
        <div class="act-figure">
          <div class="card card-policy card-cov">
            <div class="card-body">${renderChain()}</div>
          </div>
        </div>
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
}

/* Next and Screen a wallet move the intro. Nothing advances on its own. */
function stopAuto() {}
