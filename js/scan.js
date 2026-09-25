/* ── Checking, then the verdict in the same frame ────────────────
   One panel for both. The scan runs in the left column and stays exactly
   where it is; when the outcome lands the panel takes its colour and the
   right column fills in. Nothing moves, so the result reads as the scan
   resolving rather than as a new screen. */
function scanMapController() {
  const svg = document.getElementById("cov-svg");
  const q = (sel) => svg && svg.querySelector(sel);
  const status = () => document.getElementById("cov-status");
  const wave = q("#cov-wave"), pulse = q("#cov-spulse"), flash = q("#cov-flash");
  const words = ["Checking the wallet itself…", "Scanning one hop out…",
                 "Scanning two hops out…", "Scanning three hops out…"];
  return {
    /** From the moment Run is pressed: pulse across the whole radius. */
    idle() {
      if (!pulse) return;
      setPulseReach(pulse, COV_R[hops]);
      pulse.setAttribute("display", "inline");
    },
    /** The front steps out to hop n; the pulses follow it. */
    reach(n) {
      const r = n === 0 ? COV_R[0] + 14 : COV_R[n];
      if (wave) {
        wave.setAttribute("class", "swave");
        wave.dataset.state = "live";
        if (motionReduced()) {
          wave.setAttribute("r", r);
          wave.style.opacity = "0";
          requestAnimationFrame(() => { wave.style.opacity = ""; });
        } else tweenAttr(wave, "r", r, MOTION.frontStep, easeNewton);
      }
      if (pulse) { setPulseReach(pulse, r); pulse.setAttribute("display", "inline"); }
      const st = status(); if (st) st.textContent = words[n] || "";
    },
    settle(n, state) {
      if (!svg) return;
      if (n === 0) {
        if (state === "listed") {
          const core = q(".cov-core");
          if (core) core.dataset.state = "listed";
          const corePick = document.getElementById("cov-core-pick");
          if (corePick) corePick.dataset.state = "live";
          beginAll(corePick);
        }
        syncCoverageRings(svg, { colourPick: false });
        return;
      }
      const band = q(`.cband[data-band="${n}"]`);
      if (band) band.dataset.state = state;
      syncCoverageRings(svg, { colourPick: false });
      if (state === "clear" && flash) { flash.setAttribute("r", COV_R[n]); beginAll(flash); }
    },
    found(n, warn) {
      const g = document.getElementById("cov-pick");
      if (!g || n === 0) return;
      const known = presets.find((p) => p.address.toLowerCase() === pickAddr);
      const [x, y] = known ? walletXY(known.key) : onRay((COV_R[n - 1] + COV_R[n]) / 2);
      g.style.opacity = "1";
      tweenPos(g, x, y);
      g.setAttribute("class", `cov-pick found${warn ? " outside" : ""}`);
      beginAll(g.querySelector(".sburst"));
      beginAll(g.querySelector(".spick-pulse"));
    },
    clean() {
      const g = document.getElementById("cov-pick");
      if (!g) return;
      const known = presets.find((p) => p.address.toLowerCase() === pickAddr);
      const [x, y] = known ? walletXY(known.key) : onRay(rayRadius(null));
      g.style.opacity = "1";
      tweenPos(g, x, y);
      g.setAttribute("class", "cov-pick not");
    },
    done(text) {
      if (wave) { wave.setAttribute("class", "swave"); wave.dataset.state = "done"; }
      if (pulse) pulse.setAttribute("display", "none");
      const st = status(); if (st && text) st.textContent = text;
    },
  };
}

function renderChecking(address) {
  document.title = "Checking… · Lazarus Scan";
  stage.className = "stage";
  const ready = presets.filter((p) => p.address);
  stage.innerHTML = `
    <div class="console still scan-shell">
      <div class="col">
        <div class="text-label text-label--phone-eyebrow muted step-kicker"><span class="kn">1</span>Radius</div>
        <div class="card card-policy card-cov">
          <div class="card-body">${renderCoverage(ready, "scan")}</div>
        </div>
      </div>
      <div class="col">
        <div class="text-label text-label--phone-eyebrow muted step-kicker"><span class="kn">2</span>Result</div>
        <div class="card card-result" id="panel">
          <div class="result-body">
            <div class="right" id="right-slot">
              <div class="text-title">Checking</div>
              <p class="reason text-lead">Scanning outward, then waiting on an operator quorum.</p>
              <div class="text-data result-addr">${esc(address)}</div>
            </div>
            <div class="trail">
              <span class="trail-label text-eyebrow">Scan</span>
              <div class="steps">
                ${STEP_LABELS.map((label, n) => `
                  <div class="step ${n > hops ? "beyond" : n === 0 ? "active" : "idle"}" data-step="${n}">
                    <span class="step-icon" aria-hidden="true"></span>
                    <span class="step-label text-ui">${esc(STEP_TILE[n])}</span>
                    <span class="step-note text-eyebrow">${n > hops ? '<span class="lbl-long">outside reach</span><span class="lbl-short">outside</span>' : ""}</span>
                  </div>`).join("")}
                <div class="step attest idle" data-state="pending">
                  <span class="step-icon" aria-hidden="true"></span>
                  <span class="step-label text-ui">Attest</span>
                  <span class="step-note text-eyebrow">idle</span>
                </div>
              </div>
            </div>
          </div>
            <div class="actions" id="actions-slot"></div>
        </div>
      </div>
    </div>`;
  placePick(address);
  paintAttestation("pending");
  // Pulse from the first moment: the wait for the operators is the longest
  // part of a check, and it should not look idle.
  scanMapController().idle();

  const rows = () => [...stage.querySelectorAll(".step")];
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const map = scanMapController();

  return {
    /** Walk the rows inside the reach. The step that finds a path inside
     *  the reach goes amber and stops the walk. A path found past the reach
     *  is marked on its own row with a warning: it exists, and the rule you
     *  set does not cover it. */
    async settle(hitAt, kind) {
      const list = rows();
      if (!list.length) return;
      const inside = list.filter((r) => Number(r.dataset.step) <= hops);
      const hit = hitAt === null || hitAt === undefined ? null : hitAt;

      for (let n = 0; n < inside.length; n++) {
        const row = inside[n];
        row.classList.remove("idle");
        row.classList.add("active");
        map.reach(n);
        await wait(MOTION.emphasis);
        row.classList.remove("active");

        if ((kind === "listed" || kind === "exposed") && n === hit) {
          map.settle(n, kind);
          map.found(n, false);
          map.done(n === 0 ? "This wallet is on the list itself"
                           : `Found ${hopWord(n)} out · inside your coverage`);
          row.dataset.state = kind;
          row.classList.add("resolved");
          row.querySelector(".step-note").textContent = kind;
          inside.slice(n + 1).forEach((r) => r.classList.add("idle"));
          await wait(MOTION.emphasis - Math.round(MOTION.interaction / 3));
          row.classList.add("waiting");
          paintAttestation("signing");
          return;
        }
        row.dataset.state = "clear";
        row.classList.add("resolved");
        row.querySelector(".step-note").textContent = "clear";
        map.settle(n, "clear");
        await wait(Math.round(MOTION.interaction * 0.4));
      }
      map.done();

      if (kind === "outside" && hit !== null && list[hit]) {
        await wait(MOTION.interaction);
        const row = list[hit];
        map.settle(hit, "outside");
        map.found(hit, true);
        map.done(`Found ${hopWord(hit)} out · outside your coverage`);
        row.dataset.state = "outside";
        row.classList.add("resolved");
        row.querySelector(".step-note").innerHTML = '<span class="lbl-long">outside reach</span><span class="lbl-short">outside</span>';
        await wait(MOTION.emphasis - Math.round(MOTION.interaction / 3));
        row.classList.add("waiting");
        paintAttestation("signing");
        return;
      }
      // Nothing inside the coverage. A wallet with no example distance is
      // placed outside every ring so the map still says where it stands.
      if (document.getElementById("cov-pick")?.style.opacity !== "1") map.clean();
      map.done("No link found inside your coverage");
      await wait(MOTION.interaction);
      const last = inside[inside.length - 1];
      if (last) {
        const note = last.querySelector(".step-note");
        if (note) note.textContent = "signing";
        last.classList.add("waiting");
        paintAttestation("signing");
      }
    },
  };
}

function paintAttestation(state) {
  const row = document.querySelector(".attest");
  if (!row) return;
  const view = state === "signing" ? "active" : state === "pending" ? "idle" : "resolved";
  const label = state === "attested" ? "attested"
    : state === "signing" ? "signing"
    : state === "failed" ? "failed"
    : "idle";
  row.dataset.state = state;
  row.className = "step attest " + view;
  const note = row.querySelector(".step-note");
  if (note) note.textContent = label;
}
