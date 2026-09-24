function tokenOf(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
function swatch(token) {
  const node = document.createElement("div");
  node.className = "kit-swatch";
  node.style.background = "var(" + token + ")";
  return node;
}
function motionDemo(token) {
  const wrap = document.createElement("div");
  wrap.className = "kit-motion-demo";
  const bar = document.createElement("span");
  bar.className = "kit-motion-bar";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn btn-tertiary";
  btn.textContent = "Replay";
  const play = () => {
    const specified = token === "--ease-newton"
      ? tokenOf("--duration-emphasis")
      : tokenOf(token);
    bar.style.transition = "none";
    bar.style.transform = "translateX(0)";
    requestAnimationFrame(() => {
      bar.style.transition = `transform ${specified || "0s"} var(--ease-newton)`;
      bar.style.transform = "translateX(calc(var(--space-section) * 2))";
    });
  };
  btn.addEventListener("click", play);
  wrap.append(bar, btn);
  return wrap;
}

async function renderStatesBoard({ wallet, catalog, add, take, takeGlyph, addScale }) {
  let grabN = 0;
  const reachMaps = {};
  const phaseNodes = [];
  let segTemplate = null;
  const grabMap = () => {
    const node = stage.querySelector(".cov-svg")?.cloneNode(true);
    if (!node) return null;
    node.querySelector("#cov-spulse")?.setAttribute("display", "none");
    retargetIds(node, "map" + (++grabN));
    return node;
  };
  const cellLabel = (text) => {
    const el = document.createElement("span");
    el.className = "kit-cell-label";
    el.textContent = text;
    return el;
  };
  const focusOf = (id, title, story, node, selector) => {
    if (!node) { add(id, title, story, null); return; }
    const copy = node.cloneNode(true);
    const target = !selector || copy.matches(selector) ? copy : copy.querySelector(selector);
    (target || copy).classList.add("is-focus");
    add(id, title, story, copy);
  };
  const pathOf = (addrs) => {
    const edges = addrs.slice(0, -1).map((from, i) => ({
      from,
      to: addrs[i + 1],
      tx: "0x" + String(i + 1).padStart(64, "a"),
    }));
    return { path: addrs, edges };
  };
  const typeSample = "The quick brown fox — 0x1a2b·9f0e";
  const typeProbe = document.createElement("div");
  typeProbe.hidden = true;
  document.body.append(typeProbe);
  addScale("typography", "Typography", [
    ["Display", "text-display", "Verdict headline."],
    ["Title", "text-title", "Page title."],
    ["Heading", "text-heading", "Section and card heading."],
    ["Subheading", "text-subheading", "Minor heading or stat."],
    ["Body", "text-body", "Default reading and table cells."],
    ["UI", "text-ui", "Buttons, nav, table head, row title."],
    ["Caption", "text-caption", "Secondary and metadata text."],
    ["Label", "text-label", "Status chips and eyebrows."],
    ["Data", "text-data", "Addresses, hashes, and numbers."],
  ].map(([name, cls, words]) => {
    const node = document.createElement("p");
    node.className = cls;
    node.textContent = typeSample;
    typeProbe.append(node);
    const cs = getComputedStyle(node);
    return { name, note: `.${cls} · ${cs.fontSize} / ${cs.fontWeight}. ${words}`, node };
  }));
  typeProbe.remove();
  addScale("spacing", "Spacing", [
    ["Tight", "--space-tight", "Icon to label, chip internals."],
    ["Inline", "--space-inline", "Inline element groups."],
    ["Snug", "--space-snug", "Dense rows, table cells, form fields."],
    ["Group", "--space-group", "Related control groups."],
    ["Page", "--space-page", "App content padding."],
    ["Card", "--space-card", "Card padding and the base vertical gutter."],
    ["Block", "--space-block", "Separated blocks within a section."],
    ["Region", "--space-region", "Sub-sections."],
    ["Section", "--space-section", "Gap between major page sections."],
  ].map(([name, token, words]) => {
    const node = document.createElement("div");
    node.className = "kit-space";
    node.style.width = "var(" + token + ")";
    return { name, note: `${token} · ${tokenOf(token)}. ${words}`, node };
  }));
  const chip = (label, token, words) => {
    const node = document.createElement("div");
    node.className = "kit-chip";
    node.title = words ? token + " · " + words : token;
    const cap = document.createElement("span");
    cap.className = "kit-chip-label";
    cap.textContent = label;
    const val = document.createElement("span");
    val.className = "kit-chip-value";
    val.textContent = tokenOf(token);
    node.append(swatch(token), cap, val);
    return node;
  };
  const ramp = (steps) => {
    const row = document.createElement("div");
    row.className = "kit-ramp";
    steps.forEach(([label, token, words]) => row.append(chip(label, token, words)));
    return row;
  };
  const colorRows = [{ heading: "Semantic" }, {
    name: "Roles",
    note: "Surface, text, accent, focus, and danger.",
    node: ramp([
      ["Surface", "--color-surface", "Page background."],
      ["On surface", "--color-on-surface", "Primary text."],
      ["Muted", "--color-on-surface-muted", "Secondary text."],
      ["Accent", "--color-accent", "Buttons, links, coverage reach."],
      ["Accent hover", "--color-accent-hover", "Pressed or hovered accent."],
      ["Focus ring", "--focus-ring-color", "Keyboard focus."],
      ["Danger", "--color-danger", "Invalid input only."],
    ]),
  }, { heading: "Tone" }];
  [
    ["Pass", "pass", "Clear."],
    ["Block", "block", "Listed or exposed."],
    ["Caution", "caution", "Outside reach."],
    ["Neutral", "neutral", "Failed or unattested."],
  ].forEach(([name, tone, words]) => {
    colorRows.push({
      name,
      note: words,
      node: ramp(["a", "b", "edge"].map((step) => [step, `--tone-${tone}-${step}`, `${tone} ${step}.`])),
    });
  });
  colorRows.push({ heading: "Primitives" });
  [
    ["Ink", ["10", "20", "30", "50", "70", "80", "100"].map((step) => [step, `--color-ink-${step}`])],
    ["Leaf", ["10", "30", "50", "70"].map((step) => [step, `--color-leaf-${step}`])],
    ["Ruby", ["10", "30", "50", "70"].map((step) => [step, `--color-ruby-${step}`])],
    ["Gold", ["10", "30", "50", "70"].map((step) => [step, `--color-gold-${step}`])],
    ["Blue", ["50", "100", "200", "500", "600", "800"].map((step) => [step, `--blue-${step}`])],
    ["Bone", ["50", "100"].map((step) => [step, `--bone-${step}`])],
  ].forEach(([name, steps]) => {
    colorRows.push({ name, note: name + " ramp.", node: ramp(steps) });
  });
  addScale("color", "Color", colorRows);
  addScale("radii", "Radii", [
    ["Control", "--radius-control", "Inputs, nav, segments."],
    ["Surface", "--radius-surface", "Cards, mast, stage."],
    ["Full", "--radius-full", "Pills and dots."],
  ].map(([name, token, words]) => {
    const node = document.createElement("div");
    node.className = "kit-radii";
    node.style.borderRadius = "var(" + token + ")";
    return { name, note: `${token} · ${tokenOf(token)}. ${words}`, node };
  }));
  addScale("motion", "Motion", [
    ["Interaction", "--duration-interaction", "Hover, press, colour."],
    ["Emphasis", "--duration-emphasis", "Reach and verdict settle."],
    ["Beat", "--duration-beat", "Scan breath."],
    ["Cycle", "--duration-cycle", "Slow core pulse."],
    ["Ease", "--ease-newton", "The only easing."],
  ].map(([name, token, words]) => ({
    name,
    note: `${token} · ${tokenOf(token)}. ${words}`,
    node: motionDemo(token),
  })));

  act = 0;
  renderIntro();
  stopAuto();
  const radiusIntro = { none: "None", core: "Core", all: "All" };
  ACTS.forEach((item, i) => {
    paintAct(i, false);
    take("intro-map", "Intro map", radiusIntro[item.cover], ".intro-map");
    if (item.cover === "none") takeGlyph("label", "Label", "Outside", stage.querySelector(".intro-map .cov-pill"));
    if (item.cover === "all") takeGlyph("label", "Label", "Covered", stage.querySelector(".intro-map .cov-pill.on"));
    if (i === 0) {
      take("button", "Button", "Primary", "#go-console");
      const primary = stage.querySelector("#go-console")?.cloneNode(true);
      if (primary) { primary.classList.add("is-hover"); add("button", "Button", "PrimaryHover", primary); }
      take("button", "Button", "Tertiary", "#next-act");
      const tert = stage.querySelector("#next-act")?.cloneNode(true);
      if (tert) { tert.classList.add("is-hover"); add("button", "Button", "Hover", tert); }
      const dot = stage.querySelector(".act-dot")?.cloneNode(true);
      if (dot) {
        dot.classList.add("is-hover");
        const wrap = document.createElement("div");
        wrap.className = "acts";
        wrap.append(dot);
        add("button", "Button", "ActDot", wrap);
      }
      take("act", "Act", "Dots", ".acts");
      focusOf("act", "Act", "Focus", stage.querySelector(".act-dot"));
      take("intro", "Intro", "Panel", ".act-panel.on");
      focusOf("nav", "Nav", "Focus", document.querySelector(".states-link"));
    }
  });

  const hopName = { 1: "OneHop", 2: "TwoHops", 3: "ThreeHops" };
  [[1, ""], [2, wallet("two")], [3, ""]].forEach(([n, addr]) => {
    hops = n; usd = 0;
    renderConsole(addr, "", true);
    reachMaps[n] = grabMap();
    if (!segTemplate) segTemplate = stage.querySelector(".cov-seg")?.cloneNode(true);
    take("segment", "Segment", hopName[n], ".cov-seg");
    if (n === 1) {
      take("button", "Button", "Disabled", "#run");
      take("field", "Field", "Empty", ".addr-wrap");
      const fieldHover = stage.querySelector(".addr-wrap")?.cloneNode(true);
      if (fieldHover) {
        fieldHover.querySelector("#addr")?.classList.add("is-hover");
        add("field", "Field", "Hover", fieldHover);
      }
      const segHover = stage.querySelector(".cov-seg")?.cloneNode(true);
      if (segHover) {
        segHover.querySelector(".m-seg-btn:not(.sel)")?.classList.add("is-hover");
        add("segment", "Segment", "Hover", segHover);
      }
      takeGlyph("circle", "Circle", "Outside", stage.querySelector("#cov-svg .wdot.out"));
      takeGlyph("circle", "Circle", "Covered", stage.querySelector("#cov-svg .wdot.in"));
      const cHover = stage.querySelector("#cov-svg .wdot.out")?.cloneNode(true);
      if (cHover) { cHover.classList.add("is-hover"); takeGlyph("circle", "Circle", "Hover", cHover); }
      const lHover = stage.querySelector("#cov-svg .cov-pill:not(.on)")?.cloneNode(true);
      if (lHover) { lHover.classList.add("is-hover"); takeGlyph("label", "Label", "Hover", lHover); }
    }
    if (n === 2) {
      takeGlyph("circle", "Circle", "Selected", stage.querySelector("#cov-svg .wdot.chosen"));
      take("wallet-row", "WalletRow", "Covered", '.d-only .m-row[data-key="one"]');
      take("wallet-row", "WalletRow", "Selected", ".d-only .m-row.chosen");
      take("wallet-row", "WalletRow", "Outside", '.d-only .m-row[data-key="three"]');
      take("wallet-row", "WalletRow", "Unlinked", '.d-only .m-row[data-key="clean"]');
      const hoverRow = stage.querySelector('.d-only .m-row[data-key="clean"]')?.cloneNode(true);
      if (hoverRow) { hoverRow.classList.add("is-hover"); add("wallet-row", "WalletRow", "Hover", hoverRow); }
      focusOf("wallet-row", "WalletRow", "Focus", stage.querySelector('.d-only .m-row[data-key="one"]'));
      take("ladder", "Ladder", "Header", ".m-only.m-list-head");
      take("ladder", "Ladder", "List", ".m-ladder.m-only");
      take("card", "Card", "Policy", ".card-policy");
      take("card", "Card", "Check", ".card-check");
    }
  });

  hops = 2; usd = 0;
  renderConsole("", "", true);
  previewReach(3);
  phaseNodes.push({ name: "Hover", node: grabMap() });

  hops = 2;
  renderConsole("0x1111111111111111111111111111111111111111", "", true);
  take("field", "Field", "Filled", ".addr-wrap");
  focusOf("field", "Field", "Focus", stage.querySelector(".addr-wrap"), ".field");
  const disabledField = stage.querySelector(".addr-wrap")?.cloneNode(true);
  if (disabledField) {
    const input = disabledField.querySelector(".field");
    if (input) input.disabled = true;
    add("field", "Field", "Disabled", disabledField);
  }
  const run = stage.querySelector("#run");
  if (run) {
    const loading = run.cloneNode(true);
    loading.classList.add("is-loading");
    loading.setAttribute("aria-busy", "true");
    add("button", "Button", "Loading", loading);
    const pressed = run.cloneNode(true);
    pressed.classList.add("is-pressed");
    add("button", "Button", "Pressed", pressed);
  }
  focusOf("button", "Button", "Focus", run);
  focusOf("segment", "Segment", "Focus", stage.querySelector(".m-seg-btn.sel"));
  const disabledSeg = stage.querySelector(".cov-seg")?.cloneNode(true);
  if (disabledSeg) {
    const idle = [...disabledSeg.querySelectorAll(".m-seg-btn")].find((btn) => !btn.classList.contains("sel"));
    if (idle) idle.disabled = true;
    add("segment", "Segment", "Disabled", disabledSeg);
  }
  const selectedHover = stage.querySelector(".cov-seg")?.cloneNode(true);
  if (selectedHover) {
    selectedHover.querySelector(".m-seg-btn.sel")?.classList.add("is-hover");
    add("segment", "Segment", "SelectedHover", selectedHover);
  }
  const focusMap = grabMap();
  if (focusMap) focusMap.classList.add("is-focus");
  phaseNodes.push({ name: "Focus", node: focusMap });
  const circleFocus = stage.querySelector("#cov-svg .wdot")?.cloneNode(true);
  if (circleFocus) circleFocus.classList.add("is-focus");
  takeGlyph("circle", "Circle", "Focus", circleFocus);

  renderConsole("0xnot-an-address", "That is not a 42-character Ethereum address.", true);
  document.getElementById("addr")?.classList.add("invalid");
  take("field", "Field", "Invalid", ".addr-wrap");
  take("error", "Error", "Invalid", "#err");
  take("result", "Result", "Invalid address", ".card-check");

  hops = 2;
  renderChecking(wallet("two"));
  phaseNodes.push({ name: "Scanning", node: grabMap() });
  take("step", "Step", "Checking", ".trail");
  stage.querySelectorAll(".step").forEach((row) => {
    const n = Number(row.dataset.step);
    row.classList.remove("active", "idle");
    if (n > hops) return;
    row.classList.add("clear", "resolved");
    if (n === hops) {
      row.classList.add("waiting");
      const note = row.querySelector(".step-note");
      if (note) note.textContent = "signing";
    }
  });
  paintAttestation("signing");
  take("step", "Step", "Signing", ".trail");
  take("attestation", "Attestation", "Signing", ".attest");
  ["pending", "attested", "failed"].forEach((state) => {
    paintAttestation(state);
    take("attestation", "Attestation", state[0].toUpperCase() + state.slice(1), ".attest");
  });

  const base = (extra) => ({
    dataset: { max_hops: hops },
    explorer_url: "https://www.newton.xyz",
    ...extra,
  });
  const results = [
    {
      story: "Clear", radius: "Clear", step: "Clear",
      status: "No link found inside your coverage", hops: 2, wallet: wallet("clean"),
      steps: "clear", hit: null, band: { clear: 2 },
      result: base({ wallet: wallet("clean"), decision: "ALLOW", exposure: false }),
    },
    {
      story: "Listed", radius: "Listed", step: "Listed",
      status: "Known Lazarus Group address", hops: 1, wallet: wallet("direct"),
      steps: "listed", hit: 0, band: { core: true },
      result: base({
        wallet: wallet("direct"), decision: "DENY", exposure: true,
        direct_match: true, hop_count: 0,
      }),
    },
    {
      story: "Exposed", radius: "Exposed", step: "Exposed",
      status: "Found 2 hops out", hops: 3, wallet: wallet("two"),
      steps: "exposed", hit: 2, band: { clear: 1, exposed: 2 },
      result: base({
        wallet: wallet("two"), decision: "DENY", exposure: true,
        direct_match: false, hop_count: 2, exposure_usd: 1250,
        first_edge_usd: 1250,
        ...pathOf([
          wallet("two"),
          "0x2222222222222222222222222222222222222222",
          "0x3333333333333333333333333333333333333333",
        ]),
      }),
    },
    {
      story: "Outside reach", radius: "Outside reach", step: "Outside reach",
      status: "Found 3 hops out · outside your coverage", hops: 1, wallet: wallet("three"),
      steps: "outside", hit: 3, band: { clear: 1, outside: 3 }, outside: true,
      result: base({
        wallet: wallet("three"), decision: "ALLOW", exposure: true,
        direct_match: false, hop_count: 3, exposure_usd: 840,
        ...pathOf([
          wallet("three"),
          "0x4444444444444444444444444444444444444444",
          "0x5555555555555555555555555555555555555555",
          "0x3333333333333333333333333333333333333333",
        ]),
      }),
    },
    {
      story: "Failed", step: "Failed",
      status: "The scan could not be read", hops: 2, wallet: wallet("one"),
      steps: "failed", hit: null, band: null,
      result: {
        wallet: wallet("one"), status: "SCREENING_FAILED", decision: "DENY",
        detail: "The transaction graph could not be read.",
        dataset: { max_hops: 2 },
      },
    },
    {
      story: "Not attested",
      status: "Screened · attestation did not complete", hops: 2, wallet: wallet("one"),
      steps: "unattested", hit: null, band: { clear: 2 },
      result: {
        wallet: wallet("one"), status: "ATTESTATION_FAILED", decision: "DENY",
        exposure: false, detail: "The operator quorum did not sign.",
        dataset: { max_hops: 2 },
      },
    },
    {
      story: "Local only",
      status: "Screened locally", hops: 2, wallet: wallet("one"),
      steps: "unattested", hit: null, band: { clear: 2 },
      result: {
        wallet: wallet("one"), decision: "ALLOW", exposure: false,
        attestation: { status: "NOT_CONFIGURED" },
        dataset: { max_hops: 2 },
      },
    },
    {
      story: "Disagreement", warning: true,
      status: "No link found inside your coverage", hops: 2, wallet: wallet("clean"),
      steps: "clear", hit: null, band: { clear: 2 },
      result: base({
        wallet: wallet("clean"), decision: "ALLOW", exposure: false,
        warning: "The attested decision differs from the local screening result",
        local_decision: "DENY",
      }),
    },
  ];
  for (const spec of results) {
    hops = spec.hops;
    usd = 0;
    pickAddr = String(spec.wallet).toLowerCase();
    currentAddress = pickAddr;
    renderChecking(spec.wallet);
    paintSteps(spec.steps, spec.hit);
    paintBands(spec.band);
    document.getElementById("cov-spulse")?.setAttribute("display", "none");
    document.getElementById("cov-wave")?.setAttribute("class", "swave done");
    const status = document.getElementById("cov-status");
    if (status) status.textContent = spec.status;
    await fillVerdict(spec.result, !!spec.outside);
    const glyphClass = { Clear: "clear", Exposed: "exposed", "Outside reach": "outside" };
    if (glyphClass[spec.radius]) {
      const name = glyphClass[spec.radius];
      takeGlyph("label", "Label", spec.radius, stage.querySelector("#cov-svg .cov-pill." + name));
      takeGlyph("circle", "Circle", spec.radius, stage.querySelector("#cov-svg .wdot." + name));
    }
    if (spec.step) take("step", "Step", spec.step, ".trail");
    if (stage.querySelector(".path-strip")) take("path", "Path", spec.story, ".path-strip");
    if (stage.querySelector(".warnline")) take("warnline", "Warnline", spec.story, ".warnline");
    if (spec.story === "Clear") take("stats", "Stats", "Clear", ".stats");
    if (spec.story === "Failed") take("detail", "Detail", "Failed", ".detail");
    take("result", "Result", spec.story, "#panel");
    if (spec.story === "Clear") {
      take("button", "Button", "WithIcon", ".card-result a.btn");
      const explorer = stage.querySelector(".card-result a.btn")?.cloneNode(true);
      if (explorer) { explorer.classList.add("is-hover"); add("button", "Button", "WithIconHover", explorer); }
    }
  }

  const phases = document.createElement("div");
  phases.className = "kit-phase";
  phaseNodes.forEach(({ name, node }) => {
    const item = document.createElement("div");
    item.className = "kit-phase-item";
    item.append(cellLabel(name));
    if (node) item.append(node);
    phases.append(item);
  });
  add("console-map", "Console map", "Phases", phases);

  const grid = document.createElement("div");
  grid.className = "kit-matrix";
  grid.setAttribute("role", "table");
  grid.append(cellLabel(""), ...[1, 2, 3].map((n) => cellLabel(n === 1 ? "1 hop" : n + " hops")));
  const reachRow = [cellLabel("Reach")];
  [1, 2, 3].forEach((n) => reachRow.push(reachMaps[n] || cellLabel("")));
  grid.append(...reachRow);
  const bands = [
    ["Clear", (n) => ({ clear: n })],
    ["Listed", () => ({ core: true })],
    ["Exposed", (n) => ({ clear: Math.max(0, n - 1), exposed: n })],
    ["Outside reach", (n) => (n >= 3 ? null : { clear: n, outside: 3 })],
  ];
  for (const [name, bandFor] of bands) {
    grid.append(cellLabel(name));
    for (const n of [1, 2, 3]) {
      const band = bandFor(n);
      if (!band) {
        grid.append(cellLabel("Every hop is inside reach."));
        continue;
      }
      hops = n;
      usd = 0;
      renderConsole("", "", true);
      paintBands(band);
      document.getElementById("cov-wave")?.setAttribute("class", "swave done");
      grid.append(grabMap() || cellLabel(""));
    }
  }
  add("console-map", "Console map", "Grid", grid);

  const subject = wallet("two");
  const compareRow = document.createElement("div");
  compareRow.className = "kit-compare";
  const compareSpecs = [
    {
      story: "Clear", wallet: subject,
      result: base({ wallet: subject, decision: "ALLOW", exposure: false, dataset: { max_hops: 2 } }),
    },
    {
      story: "Listed", wallet: wallet("direct"),
      result: base({
        wallet: wallet("direct"), decision: "DENY", exposure: true,
        direct_match: true, hop_count: 0, dataset: { max_hops: 2 },
      }),
    },
    {
      story: "Exposed", wallet: subject,
      result: base({
        wallet: subject, decision: "DENY", exposure: true,
        direct_match: false, hop_count: 2, exposure_usd: 1250, first_edge_usd: 1250,
        dataset: { max_hops: 2 },
        ...pathOf([subject, "0x2222222222222222222222222222222222222222", "0x3333333333333333333333333333333333333333"]),
      }),
    },
    {
      story: "Outside reach", wallet: subject, outside: true,
      result: base({
        wallet: subject, decision: "ALLOW", exposure: true,
        direct_match: false, hop_count: 3, exposure_usd: 840, dataset: { max_hops: 2 },
      }),
    },
    {
      story: "Failed", wallet: subject,
      result: {
        wallet: subject, status: "SCREENING_FAILED", decision: "DENY",
        detail: "The transaction graph could not be read.",
        dataset: { max_hops: 2 },
      },
    },
    {
      story: "Not attested", wallet: subject,
      result: {
        wallet: subject, status: "ATTESTATION_FAILED", decision: "DENY",
        exposure: false, detail: "The operator quorum did not sign.",
        dataset: { max_hops: 2 },
      },
    },
  ];
  for (const spec of compareSpecs) {
    hops = 2;
    pickAddr = String(spec.wallet || "").toLowerCase();
    currentAddress = pickAddr;
    renderChecking(spec.wallet);
    paintSteps(spec.story === "Listed" ? "listed" : spec.story === "Exposed" ? "exposed" : spec.story === "Outside reach" ? "outside" : spec.story === "Failed" ? "failed" : spec.story === "Not attested" ? "unattested" : "clear",
      spec.story === "Listed" ? 0 : spec.story === "Exposed" ? 2 : spec.story === "Outside reach" ? 3 : null);
    await fillVerdict(spec.result, !!spec.outside);
    const panel = stage.querySelector("#panel")?.cloneNode(true);
    const item = document.createElement("div");
    item.className = "kit-compare-item";
    item.append(cellLabel(spec.story));
    if (panel) {
      retargetIds(panel, "cmp" + (++grabN));
      item.append(panel);
    }
    compareRow.append(item);
  }
  add("compare", "Outcomes", "All six", compareRow);

  hops = 2;
  [
    ["clean", "clear", "Pass"],
    ["two", "exposed", "Block"],
    ["three", "outside", "Caution"],
  ].forEach(([key, state, story]) => {
    const addr = wallet(key);
    if (!addr) return;
    outcomes[addr.toLowerCase()] = { state, hops: 2 };
    if (view === "states") kitOutcomeKeys.add(addr.toLowerCase());
  });
  renderConsole("", "", true);
  take("wallet-row", "WalletRow", "Pass", '.d-only .m-row[data-key="clean"]');
  take("wallet-row", "WalletRow", "Block", '.d-only .m-row[data-key="two"]');
  take("wallet-row", "WalletRow", "Caution", '.d-only .m-row[data-key="three"]');

  add("mast", "Mast", "Default", document.querySelector(".mast"));
  add("badge", "Badge", "Product", document.querySelector(".badge"));
  add("badge", "Badge", "Network", document.querySelector(".pill"));
  const labelSec = catalog.find((item) => item.id === "label");
  const circleSec = catalog.find((item) => item.id === "circle");
  ["label", "circle"].forEach((id) => {
    const index = catalog.findIndex((item) => item.id === id);
    if (index >= 0) catalog.splice(index, 1);
  });
  catalog.push({
    id: "anatomy",
    title: "Anatomy",
    stories: [...(labelSec?.stories || []), ...(circleSec?.stories || [])],
    parts: [
      { title: "Label", stories: labelSec?.stories || [] },
      { title: "Circle", stories: circleSec?.stories || [] },
    ],
  });
  const GROUPS = [
    { id: "foundations", title: "Foundations", sections: ["typography", "spacing", "color", "radii", "motion"] },
    { id: "primitives", title: "Primitives", sections: ["button", "badge", "field", "segment", "wallet-row", "ladder"] },
    { id: "coverage", title: "Coverage map", sections: ["anatomy", "intro-map", "console-map"] },
    { id: "composites", title: "Composites", sections: ["compare", "result", "path", "warnline", "stats", "detail", "error", "card"] },
    { id: "flows", title: "Flows", sections: ["intro", "step", "attestation", "act", "mast", "nav"] },
  ];
  document.title = "UI kit · Lazarus Scan";

  const kit = document.createElement("div");
  kit.className = "kit";
  kit.innerHTML = `
    <header class="kit-head">
      <p class="kit-kicker">Dev</p>
      <h1 class="text-title">UI kit</h1>
      <p>Each component in this demo, and every state it can be in.</p>
    </header>`;
  const layout = document.createElement("div");
  layout.className = "kit-layout";
  const nav = document.createElement("nav");
  nav.className = "kit-nav";
  const main = document.createElement("div");
  main.className = "kit-main";

  const scrollToKit = (id) => {
    const behavior = motionReduced() ? "auto" : "smooth";
    document.getElementById(id)?.scrollIntoView({ behavior, block: "start" });
  };
  const kitSegment = (aria, options, current, onPick) => {
    const bar = document.createElement("div");
    bar.className = "cov-seg";
    bar.setAttribute("role", "group");
    bar.setAttribute("aria-label", aria);
    const sample = segTemplate?.querySelector(".m-seg-btn");
    options.forEach(([value, text]) => {
      const btn = sample ? sample.cloneNode(false) : document.createElement("button");
      btn.type = "button";
      btn.disabled = false;
      btn.className = "m-seg-btn" + (value === current ? " sel" : "");
      btn.textContent = text;
      btn.setAttribute("aria-pressed", String(value === current));
      btn.addEventListener("click", () => {
        bar.querySelectorAll(".m-seg-btn").forEach((other) => {
          const on = other === btn;
          other.classList.toggle("sel", on);
          other.setAttribute("aria-pressed", String(on));
        });
        onPick(value);
      });
      bar.append(btn);
    });
    return bar;
  };
  const applyWidth = (value) => {
    document.querySelectorAll(".kit-frame").forEach((frame) => {
      frame.classList.remove("is-w375", "is-w768", "is-w1024");
      if (value !== "full") frame.classList.add("is-w" + value);
    });
  };
  const toolbar = document.createElement("div");
  toolbar.className = "kit-toolbar";
  const widthTool = document.createElement("div");
  widthTool.className = "kit-tool";
  widthTool.append(cellLabel("Width"));
  widthTool.append(kitSegment("Frame width", [["375", "375"], ["768", "768"], ["1024", "1024"], ["full", "Full"]], "full", applyWidth));
  const motionTool = document.createElement("div");
  motionTool.className = "kit-tool";
  motionTool.append(cellLabel("Motion"));
  const reducedNow = motionReduced();
  if (reducedNow) document.body.classList.add("is-reduced");
  motionTool.append(kitSegment("Motion", [["motion", "Motion"], ["reduced", "Reduced"]], reducedNow ? "reduced" : "motion", (value) => {
    document.body.classList.toggle("is-reduced", value === "reduced");
  }));
  toolbar.append(widthTool, motionTool);
  kit.prepend(toolbar);

  const paintStories = (parent, stories, sectionId) => {
    stories.forEach((story) => {
      const wrap = document.createElement("div");
      wrap.className = "kit-story";
      wrap.id = story.id;
      const frame = document.createElement("div");
      const glyph = story.node?.classList?.contains("kit-glyph");
      frame.className = "kit-frame" + ((glyph || ["badge", "segment"].includes(sectionId)) ? " kit-wrap" : "");
      frame.append(story.node);
      if (!story.scale) {
        const label = document.createElement("h3");
        label.className = "kit-label";
        const name = document.createElement("span");
        name.textContent = story.story;
        label.append(name);
        if (story.note) {
          const note = document.createElement("span");
          note.className = "kit-note";
          note.textContent = story.note;
          label.append(note);
        }
        wrap.append(label);
      }
      frame.querySelectorAll("button, a, input, svg").forEach((el) => { el.tabIndex = -1; });
      frame.querySelectorAll("a").forEach((el) => {
        el.addEventListener("click", (e) => e.preventDefault());
      });
      wrap.append(frame);
      parent.append(wrap);
    });
  };
  GROUPS.forEach((group) => {
    const groupNav = document.createElement("div");
    groupNav.className = "kit-nav-group";
    const groupLabel = document.createElement("p");
    groupLabel.className = "kit-nav-group-label";
    groupLabel.textContent = group.title;
    groupNav.append(groupLabel);
    const groupBlock = document.createElement("div");
    groupBlock.className = "kit-group";
    groupBlock.id = group.id;
    const groupHead = document.createElement("p");
    groupHead.className = "kit-group-label";
    groupHead.textContent = group.title;
    groupBlock.append(groupHead);
    group.sections.forEach((id) => {
      const section = catalog.find((item) => item.id === id);
      if (!section) return;
      const item = document.createElement("details");
      const summary = document.createElement("summary");
      const jump = document.createElement("a");
      jump.href = "#" + section.id;
      jump.className = "kit-nav-jump";
      jump.dataset.kitTarget = section.id;
      jump.textContent = section.title;
      jump.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        scrollToKit(section.id);
        history.replaceState(null, "", "#" + section.id);
      });
      summary.append(jump);
      item.append(summary);
      const storyLinks = section.parts || [{ title: "", stories: section.stories }];
      if (section.stories.length > 1) {
        const sub = document.createElement("div");
        sub.className = "kit-sub";
        storyLinks.forEach((part) => {
          if (part.title) {
            const kicker = document.createElement("span");
            kicker.className = "kit-sub-kicker";
            kicker.textContent = part.title;
            sub.append(kicker);
          }
          part.stories.forEach((story) => {
            const link = document.createElement("a");
            link.href = "#" + story.id;
            link.dataset.kitTarget = story.id;
            link.textContent = story.story;
            link.addEventListener("click", (e) => {
              e.preventDefault();
              scrollToKit(story.id);
              history.replaceState(null, "", "#" + story.id);
            });
            sub.append(link);
          });
        });
        item.append(sub);
      }
      groupNav.append(item);

      const block = document.createElement("section");
      block.className = "kit-section";
      block.id = section.id;
      const heading = document.createElement("h2");
      heading.className = "text-heading";
      heading.textContent = section.title;
      block.append(heading);
      if (section.parts) {
        section.parts.forEach((part) => {
          const partHead = document.createElement("h3");
          partHead.className = "text-subheading kit-part";
          partHead.textContent = part.title;
          block.append(partHead);
          paintStories(block, part.stories, section.id);
        });
      } else paintStories(block, section.stories, section.id);
      groupBlock.append(block);
    });
    nav.append(groupNav);
    main.append(groupBlock);
  });

  layout.append(nav, main);
  kit.append(layout);
  stage.innerHTML = "";
  stage.append(kit);
  const currentFor = (id) => [...nav.querySelectorAll("[data-kit-target]")].find((el) => el.dataset.kitTarget === id);
  const mark = new IntersectionObserver((entries) => {
    entries.forEach((entry) => { entry.target.dataset.kitSeen = entry.isIntersecting ? "1" : ""; });
    nav.querySelectorAll("[aria-current]").forEach((el) => el.removeAttribute("aria-current"));
    const seen = [...main.querySelectorAll(".kit-section, .kit-story")].filter((el) => el.dataset.kitSeen);
    const first = seen[0];
    if (!first) return;
    const sectionEl = first.classList.contains("kit-section") ? first : first.closest(".kit-section");
    const storyEl = seen.find((el) => el.classList.contains("kit-story"));
    if (sectionEl) currentFor(sectionEl.id)?.setAttribute("aria-current", "true");
    if (storyEl) currentFor(storyEl.id)?.setAttribute("aria-current", "true");
  }, { rootMargin: "-10% 0px -70% 0px", threshold: 0 });
  main.querySelectorAll(".kit-section, .kit-story").forEach((el) => mark.observe(el));
  document.body.classList.remove("is-building");
  document.body.classList.add("is-states");
  stopAuto();
}
