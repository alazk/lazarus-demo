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
      if (b.dataset.step === "policy") { renderPolicy({ swap: true }); syncUrl(true); }
      if (b.dataset.step === "scan") renderConsole(currentAddress || "", "", true, { swap: true });
    };
  });
}

/* ── Step 1: the policy ──────────────────────────────────────────
   A policy is data plus a rule. The card offers three deployed policies,
   each with its rule, then the data source they share (the wallet scanner). The map shows what the rule covers, and the card names the
   contract the check will be sent to and who owns it. */
/* Moving between the two steps keeps the map where it is: the page is
   redrawn without an entrance, and only the right column (the policy picker
   or the wallet picker) slides in. */
function renderPolicy(opts = {}) {
  document.title = "Choose a policy · Lazarus Scan";
  view = "policy";
  paintFlow("policy");
  const ready = presets.filter((p) => p.address);
  stage.className = "stage";
  stage.innerHTML = `
    <div class="console is-policy ${opts.swap ? "still swap-right" : ""}">
      <div class="col">
        <div class="step-head">
          <div class="text-eyebrow muted">What it covers</div>
          <div class="text-heading" id="policy-cover-title">${esc(ruleTitle(ruleNow()))}</div>
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
            <div class="policy-options" role="radiogroup" aria-label="Policies">
              ${RULES.map((r) => `
                <button class="policy-opt" type="button" role="radio" data-hops="${r.hops}" ${r.tone ? `data-tone="${r.tone}"` : ""}
                    aria-checked="${r.hops === hops}" tabindex="${r.hops === hops ? 0 : -1}">
                  <span class="opt-radio" aria-hidden="true"></span>
                  <span class="opt-text">
                    <span class="opt-name text-ui">${esc(r.label)} <span class="opt-tag">${esc(r.name)}</span></span>
                    <span class="opt-rule">${esc(r.rule)}</span>
                  </span>
                </button>`).join("")}
            </div>
            <div class="policy-meta">
              <p class="part-note">A wallet scanner that checks Ethereum transfers against a list of known Lazarus addresses. Anyone can create a policy with their own data and rule. <a href="${POLICY_DOCS}" target="_blank" rel="noopener">How to write one</a></p>
              <p class="part-note verify-line" id="verify-line"></p>
            </div>
          </div>
          <button class="btn btn-primary btn-lg btn-block" id="use-policy">Use this policy</button>
        </div>
      </div>
    </div>`;

  const choose = (n) => { stopRadiusDemo(false); setRule(n, 0); paintPolicyCard(); };
  stage.querySelectorAll(".policy-opt").forEach((b) => {
    b.onclick = () => choose(Number(b.dataset.hops));
    b.addEventListener("pointerenter", () => {
      if (!matchMedia("(hover:hover)").matches || stage.clientWidth <= 639) return;
      stopRadiusDemo();
      previewReach(Number(b.dataset.hops));
    });
    b.addEventListener("pointerleave", endPreview);
  });
  // A radio group: the arrow keys move the choice, Tab leaves the group.
  stage.querySelector(".policy-options")?.addEventListener("keydown", (e) => {
    const step = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1
      : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const at = RULES.indexOf(ruleNow());
    choose(RULES[(at + step + RULES.length) % RULES.length].hops);
    stage.querySelector('.policy-opt[aria-checked="true"]')?.focus();
  });
  document.getElementById("use-policy").onclick = () => {
    stopRadiusDemo(false);
    renderConsole(currentAddress || "", "", true, { swap: true });
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
  stage.querySelectorAll(".policy-opt").forEach((b) => {
    const on = Number(b.dataset.hops) === rule.hops;
    b.setAttribute("aria-checked", String(on));
    b.tabIndex = on ? 0 : -1;
  });
  const title = document.getElementById("policy-cover-title");
  if (title) title.textContent = ruleTitle(rule);
  // One verifiable fact instead of a table of addresses: each policy is a
  // contract on Sepolia with its rule set onchain, and anyone can open it.
  const verify = document.getElementById("verify-line");
  if (verify) verify.innerHTML = `Every policy is a contract on Sepolia, so anyone can see which rule it runs.`
    + (rule.client ? ` <a href="${SEPOLIA_ADDR(rule.client)}" target="_blank" rel="noopener">View ${esc(rule.label)} on Etherscan</a>` : "");
  const facts = document.getElementById("policy-facts");
  if (!facts) return;
  const link = (a) => `<a class="text-data" href="${SEPOLIA_ADDR(a)}" target="_blank" rel="noopener"
      title="${esc(a)}">${esc(short(a))}${iconSvg("ArrowUpRight", "icon")}</a>`;
  facts.innerHTML = `<span>Client ${link(rule.client)}</span>
    <span>Policy ${link(POLICY_ADDRESS)}</span>
    <span>Owner ${link(POLICY_OWNER)}</span>`;
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
