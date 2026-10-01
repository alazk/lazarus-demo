/* ── The two parts ───────────────────────────────────────────────
   The demo runs as two steps so the policy and the protocol read apart:
   1. Policy: what counts. Its scanner reads a wallet's transfers and finds
      the distance to a Lazarus address; its rule says which distances and
      amounts count. Deployed onchain and owned by whoever deployed it.
   2. Enforcement: Newton's operators run the policy on a wallet and return
      a signed evaluation. The page only shows it.
   The step bar sits in the header so it costs the map no height. */
const FLOW = [
  { id: "policy", label: "Choose the policy" },
  { id: "scan", label: "Policy enforcement" },
];

/** Show the step bar at a step, or hide it (null) on the intro and the kit. */
function paintFlow(step) {
  const nav = document.getElementById("flow");
  if (!nav) return;
  if (!step) { nav.hidden = true; nav.innerHTML = ""; return; }
  const at = FLOW.findIndex((f) => f.id === step);
  nav.hidden = false;
  nav.innerHTML = `<ol class="flow-list">${FLOW.map((f, i) => {
    const state = i < at ? "done" : i === at ? "current" : "next";
    // Earlier steps can be revisited.
    const canGo = state === "done";
    return `<li class="flow-item" data-state="${state}">
      ${i > 0 ? `<span class="flow-line" aria-hidden="true"></span>` : ""}
      <button class="flow-step" type="button" data-step="${f.id}" ${canGo ? "" : "disabled"}
        ${state === "current" ? `aria-current="step"` : ""}>
        <span class="flow-n" aria-hidden="true">${state === "done" ? iconSvg("Check") : i + 1}</span>
        <span class="flow-label">${f.label}</span>
      </button>
    </li>`;
  }).join("")}</ol>`;
  nav.querySelectorAll(".flow-step:not([disabled])").forEach((b) => {
    b.onclick = () => {
      if (inFlight) return;
      if (b.dataset.step === "policy") { renderPolicy(); syncUrl(true); }
      if (b.dataset.step === "scan") renderConsole(currentAddress || "", "", true);
    };
  });
}

/* ── Step 1: the policy ──────────────────────────────────────────
   Choose one of the deployed rules. The map shows what it covers, and the
   card names the contract the check will be sent to and who owns it. */
function renderPolicy() {
  document.title = "Choose a policy · Lazarus Scan";
  view = "policy";
  paintFlow("policy");
  const ready = presets.filter((p) => p.address);
  stage.className = "stage";
  stage.innerHTML = `
    <div class="console is-policy">
      <div class="col">
        <div class="step-head">
          <div class="text-eyebrow muted">What it covers</div>
          <div class="text-heading" id="policy-cover-title">${esc(ruleNow().name)}</div>
        </div>
        <div class="card card-policy card-cov">
          <div class="card-body">${renderCoverage(ready, "policy")}</div>
        </div>
      </div>

      <div class="col">
        <div class="step-head">
          <div class="text-eyebrow muted">The check</div>
          <div class="text-heading">Choose the policy</div>
        </div>
        <div class="card card-check card-rules">
          <div class="card-body">
            <p class="part-note">A policy is the check: a rule, and the data it reads. The data here is a scanner that finds how far a wallet sits from Arkham's Lazarus list.</p>
            <div class="m-ladder rule-list" role="radiogroup" aria-label="Policies">
              ${RULES.map((r, i) => `
                <button class="m-row wrow rule-row" type="button" role="radio" data-i="${i}"
                    aria-checked="false" tabindex="-1">
                  <span class="m-bar" aria-hidden="true"></span>
                  <span class="m-text">
                    <span class="m-name text-ui text-ui--phone-subheading">${esc(r.name)}</span>
                  </span>
                </button>`).join("")}
            </div>
            <div class="rule-box" aria-live="polite">
              <div class="text-eyebrow muted">The rule that will be evaluated</div>
              <p class="rule-text" id="rule-text"></p>
              <p class="rule-params text-data" id="rule-params"></p>
            </div>
            <dl class="policy-facts" id="policy-facts"></dl>
            <p class="part-note">The scanner has the limits all onchain tracing has, such as losing the trail at an exchange. Anyone can create a policy with other data. <a href="${POLICY_DOCS}" target="_blank" rel="noopener">How to write one</a></p>
          </div>
          <button class="btn btn-primary btn-lg btn-block" id="use-policy">Use this policy</button>
        </div>
      </div>
    </div>`;

  stage.querySelectorAll(".rule-row").forEach((b) => {
    b.onclick = () => {
      const r = RULES[Number(b.dataset.i)];
      stopRadiusDemo(false);
      setRule(r.hops, r.usd);
      paintPolicyCard();
    };
    b.addEventListener("pointerenter", () => {
      if (!matchMedia("(hover:hover)").matches || stage.clientWidth <= 639) return;
      const r = RULES[Number(b.dataset.i)];
      stopRadiusDemo();
      if (r.usd === usd) previewReach(r.hops);
    });
    b.addEventListener("pointerleave", endPreview);
  });
  // A radio group: the arrow keys move the choice, Tab leaves the group.
  stage.querySelector(".rule-list")?.addEventListener("keydown", (e) => {
    const step = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1
      : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const at = RULES.indexOf(ruleNow());
    const next = RULES[(at + step + RULES.length) % RULES.length];
    stopRadiusDemo(false);
    setRule(next.hops, next.usd);
    paintPolicyCard();
    stage.querySelector('.rule-row[aria-checked="true"]')?.focus();
  });
  document.getElementById("use-policy").onclick = () => {
    stopRadiusDemo(false);
    renderConsole(currentAddress || "", "");
    syncUrl(true);
  };

  bindRadiusControls();
  paintPolicyCard();
  // Any touch, click or key ends the opening demonstration.
  ["pointerdown", "keydown", "wheel"].forEach((ev) =>
    stage.addEventListener(ev, () => stopRadiusDemo(), { once: true, passive: true }));
  playRadiusDemo();
}

/** Mark the chosen rule and show its contracts. */
function paintPolicyCard() {
  const rule = ruleNow();
  stage.querySelectorAll(".rule-row").forEach((b) => {
    const on = RULES[Number(b.dataset.i)] === rule;
    b.setAttribute("aria-checked", String(on));
    b.tabIndex = on ? 0 : -1;
    b.setAttribute("data-reach", on ? "in" : "out");
  });
  const title = document.getElementById("policy-cover-title");
  if (title) title.textContent = rule.name;
  const text = document.getElementById("rule-text");
  if (text) text.textContent = ruleText(rule);
  // The parameters this client was deployed with, as the policy reads them.
  const params = document.getElementById("rule-params");
  if (params) params.textContent = `max_hops = ${rule.hops} · min_exposure_usd = ${rule.usd.toLocaleString("en-US")}`;
  const facts = document.getElementById("policy-facts");
  if (!facts) return;
  const link = (a) => `<a class="text-data" href="${SEPOLIA_ADDR(a)}" target="_blank" rel="noopener"
      title="${esc(a)}">${esc(short(a))}${iconSvg("ArrowUpRight", "icon")}</a>`;
  facts.innerHTML = `
    <div><dt>Policy client</dt><dd>${link(rule.client)}</dd></div>
    <div><dt>Policy</dt><dd>${link(POLICY_ADDRESS)}</dd></div>
    <div><dt>Owner</dt><dd>${link(POLICY_OWNER)}</dd></div>`;
}

/* The map on the policy step sets the radius: hover previews it, a tap on a
   ring sets it, and the arrow keys step it. */
function bindRadiusControls() {
  const svg = document.getElementById("cov-svg");
  if (!svg) return;
  const bandAt = (ev) => {
    const pt = svg.createSVGPoint();
    pt.x = ev.clientX; pt.y = ev.clientY;
    const m = svg.getScreenCTM();
    if (!m) return null;
    const q = pt.matrixTransform(m.inverse());
    const r = Math.hypot(q.x - COV_C, q.y - COV_C);
    return r <= COV_R[1] ? 1 : r <= COV_R[2] ? 2 : 3;
  };
  if (matchMedia("(hover:hover)").matches) {
    svg.addEventListener("pointermove", (ev) => {
      if (ev.pointerType === "touch" || stage.clientWidth <= 639) return;
      stopRadiusDemo();
      const n = bandAt(ev);
      if (n) previewReach(n);
    });
    svg.addEventListener("pointerleave", endPreview);
  }
  svg.addEventListener("click", (ev) => {
    const n = bandAt(ev);
    if (n) { setRule(n, usd); paintPolicyCard(); }
  });
  svg.addEventListener("keydown", (e) => {
    if (["ArrowRight", "ArrowUp"].includes(e.key)) { e.preventDefault(); setRule(Math.min(3, hops + 1), usd); paintPolicyCard(); }
    if (["ArrowLeft", "ArrowDown"].includes(e.key)) { e.preventDefault(); setRule(Math.max(1, hops - 1), usd); paintPolicyCard(); }
  });
}
