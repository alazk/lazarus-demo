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

function mountMapAnatomy(catalog) {
  const SVG = "http://www.w3.org/2000/svg";
  const stories = [];
  const story = (name, note, node) => stories.push({
    story: name, note, id: "map-anatomy-" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), node,
  });
  const svgBox = (w) => {
    const svg = document.createElementNS(SVG, "svg");
    svg.setAttribute("viewBox", "0 0 " + w + " " + w);
    svg.setAttribute("width", String(w));
    svg.setAttribute("height", String(w));
    svg.setAttribute("class", "cov-svg");
    svg.setAttribute("aria-hidden", "true");
    return svg;
  };
  const circle = (svg, attrs) => {
    const node = document.createElementNS(SVG, "circle");
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
    svg.append(node);
    return node;
  };
  const caption = (token, node) => {
    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.alignItems = "center";
    wrap.style.gap = "var(--space-tight)";
    const cap = document.createElement("span");
    cap.className = "text-caption";
    cap.textContent = token + " " + tokenOf(token);
    wrap.append(node, cap);
    return wrap;
  };
  const row = (children) => {
    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.flexWrap = "wrap";
    wrap.style.gap = "var(--space-group)";
    wrap.style.alignItems = "flex-end";
    children.forEach((child) => wrap.append(child));
    return wrap;
  };
  story("Stroke scale", "Four weights, in screen pixels.", row(
    ["--map-stroke-hair", "--map-stroke-ring", "--map-stroke-emphasis", "--map-stroke-strong"].map((token) => {
      const svg = svgBox(72);
      const ring = circle(svg, { cx: "36", cy: "36", r: "24", fill: "none", class: "cov-ring" });
      ring.style.stroke = "var(--map-reach)";
      ring.style.strokeWidth = "var(" + token + ")";
      return caption(token, svg);
    })
  ));
  story("Colour roles", "Reach, the disc, inactive, the core, and the three tones.", row(
    [
      ["--map-reach", "--map-reach"],
      ["--map-disc", "--map-disc"],
      ["--color-text-disabled", "--color-text-disabled"],
      ["--color-border", "--color-surface-sunken"],
      ["--tone-pass-edge", "--tone-pass-edge"],
      ["--tone-block-edge", "--tone-block-edge"],
      ["--tone-caution-edge", "--tone-caution-edge"],
    ].map(([stroke, fill]) => {
      const svg = svgBox(72);
      const ring = circle(svg, { cx: "36", cy: "36", r: "24", fill: "none", class: "cov-ring" });
      ring.style.stroke = "var(" + stroke + ")";
      const dot = circle(svg, { cx: "36", cy: "36", r: "7", class: "cov-pick-dot" });
      dot.style.fill = "var(" + fill + ")";
      dot.style.stroke = "var(--color-on-accent)";
      return caption(stroke, svg);
    })
  ));
  story("Opacity scale", "Ghost, muted, and live.", row(
    ["--map-alpha-ghost", "--map-alpha-muted", "--map-alpha-live"].map((token) => {
      const svg = svgBox(72);
      const dot = circle(svg, { cx: "36", cy: "36", r: "16" });
      dot.style.fill = "var(--map-reach)";
      dot.style.opacity = "var(" + token + ")";
      return caption(token, svg);
    })
  ));
  story("Dash scale", "Inactive, caution, and the wallet guide.", row(
    ["--map-dash-inactive", "--map-dash-caution"].map((token) => {
      const svg = svgBox(72);
      const ring = circle(svg, { cx: "36", cy: "36", r: "24", fill: "none", class: "cov-ring" });
      ring.style.stroke = token === "--map-dash-caution" ? "var(--tone-caution-edge)" : "var(--map-reach)";
      ring.style.strokeDasharray = "var(" + token + ")";
      return caption(token, svg);
    })
  ));
  story("Wallet marker", "Default, found, outside, not covered, idle, and dragging.", row(
    [["Default", ""], ["Found", "found"], ["Outside", "outside"], ["Not covered", "not"], ["Idle", "idle"], ["Dragging", "dragging"]].map(([name, state]) => {
      const svg = svgBox(64);
      const g = document.createElementNS(SVG, "g");
      g.setAttribute("class", "cov-pick " + state);
      g.setAttribute("transform", "translate(32 32)");
      const dot = document.createElementNS(SVG, "circle");
      dot.setAttribute("class", "cov-pick-dot");
      dot.setAttribute("r", "8");
      g.append(dot);
      svg.append(g);
      const wrap = document.createElement("div");
      wrap.style.display = "flex";
      wrap.style.flexDirection = "column";
      wrap.style.alignItems = "center";
      wrap.style.gap = "var(--space-tight)";
      const cap = document.createElement("span");
      cap.className = "text-caption";
      cap.textContent = name;
      wrap.append(svg, cap);
      return wrap;
    })
  ));
  const replay = (play) => {
    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.alignItems = "center";
    wrap.style.gap = "var(--space-group)";
    const host = document.createElement("div");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-tertiary";
    btn.textContent = "Replay";
    const run = () => {
      host.replaceChildren(play());
      host.querySelectorAll("animate").forEach((node) => { try { node.beginElement(); } catch (_) {} });
    };
    btn.addEventListener("click", run);
    run();
    wrap.append(host, btn);
    return wrap;
  };
  const anim = (parent, name, values, dur, once) => {
    const node = document.createElementNS(SVG, "animate");
    node.setAttribute("attributeName", name);
    node.setAttribute("values", values);
    node.setAttribute("dur", dur);
    node.setAttribute("begin", "indefinite");
    node.setAttribute("repeatCount", once ? "1" : "indefinite");
    parent.append(node);
  };
  story("Pulse", "Three pulses, a third of a cycle apart. Reduced motion fades in place.", replay(() => {
    const svg = svgBox(120);
    const g = document.createElementNS(SVG, "g");
    g.setAttribute("class", "spulse");
    const reduced = motionReduced();
    const ghost = mapToken("--map-alpha-ghost"), muted = mapToken("--map-alpha-muted"), live = mapToken("--map-alpha-live");
    [0, 1, 2].forEach((i) => {
      const radius = reduced ? (48 * [1, .72, .46][i]).toFixed(1) : "18";
      const ring = circle(g, { cx: "60", cy: "60", r: radius, fill: "none" });
      const begin = (i * MOTION.pulseGap / 1000).toFixed(1) + "s";
      anim(ring, "r", reduced ? radius + ";" + radius : "18;48", MOTION.pulseCycle + "ms");
      anim(ring, "stroke-opacity", reduced ? ghost + ";" + muted + ";" + ghost : "0;" + live + ";0", MOTION.pulseCycle + "ms");
      ring.querySelectorAll("animate").forEach((node) => node.setAttribute("begin", begin));
    });
    svg.append(g);
    return svg;
  }));
  story("Front step", "The front moves one hop. Reduced motion jumps and changes opacity.", replay(() => {
    const svg = svgBox(120);
    const ring = circle(svg, { cx: "60", cy: "60", r: "16", fill: "none", class: "swave on" });
    if (motionReduced()) {
      ring.setAttribute("r", "48");
      ring.style.opacity = "0";
      requestAnimationFrame(() => { ring.style.opacity = ""; });
    } else tweenAttr(ring, "r", 48, MOTION.frontStep, easeNewton);
    return svg;
  }));
  story("Flash", "A cleared hop. Green, from strong to ring, once.", replay(() => {
    const svg = svgBox(120);
    const ring = circle(svg, { cx: "60", cy: "60", r: "36", fill: "none", class: "sflash" });
    anim(ring, "stroke-opacity", mapToken("--map-alpha-live") + ";0", MOTION.flash + "ms", true);
    if (!motionReduced()) anim(ring, "stroke-width", mapToken("--map-stroke-strong") + ";" + mapToken("--map-stroke-ring"), MOTION.flash + "ms", true);
    return svg;
  }));
  story("Burst", "Found. Ruby, played once.", replay(() => {
    const svg = svgBox(120);
    const ring = circle(svg, { cx: "60", cy: "60", r: "10", fill: "none", class: "sburst" });
    anim(ring, "r", motionReduced() ? "10;10" : "10;40", MOTION.burst + "ms", true);
    anim(ring, "stroke-opacity", (motionReduced() ? mapToken("--map-alpha-live") : "1") + ";0", MOTION.burst + "ms", true);
    return svg;
  }));
  story("Listed core", "A block wash, a block outline, and a block label.", replay(() => {
    const svg = svgBox(120);
    circle(svg, { cx: "60", cy: "60", r: "22", class: "cov-core", "data-state": "listed" });
    const label = document.createElementNS(SVG, "text");
    label.setAttribute("class", "cov-core-label");
    label.setAttribute("x", "60");
    label.setAttribute("y", "64");
    label.setAttribute("text-anchor", "middle");
    label.textContent = "Lazarus";
    svg.append(label);
    const ring = circle(svg, { cx: "60", cy: "60", r: "22", fill: "none", class: "cov-core-pick" });
    const reduced = motionReduced();
    anim(ring, "r", reduced ? "22;22" : "22;32", MOTION.pulseCycle + "ms");
    anim(ring, "stroke-opacity", reduced
      ? mapToken("--map-alpha-ghost") + ";" + mapToken("--map-alpha-muted") + ";" + mapToken("--map-alpha-ghost")
      : mapToken("--map-alpha-live") + ";0", MOTION.pulseCycle + "ms");
    return svg;
  }));
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "btn btn-tertiary";
  const paintToggle = () => { toggle.textContent = motionReduced() ? "Reduced motion on" : "Reduced motion off"; };
  toggle.addEventListener("click", () => { document.body.classList.toggle("is-reduced"); paintToggle(); });
  paintToggle();
  story("Reduced motion", "Nothing grows or travels. Replay a motion story after switching.", toggle);
  catalog.push({
    id: "map-anatomy",
    title: "Map anatomy",
    stories,
    parts: [
      { title: "Stroke", stories: stories.filter((item) => item.story === "Stroke scale") },
      { title: "Colour", stories: stories.filter((item) => item.story === "Colour roles") },
      { title: "Opacity and dash", stories: stories.filter((item) => item.story === "Opacity scale" || item.story === "Dash scale") },
      { title: "Marker", stories: stories.filter((item) => item.story === "Wallet marker") },
      { title: "Motion", stories: stories.filter((item) => ["Pulse", "Front step", "Flash", "Burst", "Listed core", "Reduced motion"].includes(item.story)) },
    ],
  });
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
  const iconSpecimen = (name) => {
    const row = document.createElement("div");
    row.className = "kit-icon-row";
    const bare = document.createElement("span");
    bare.className = "kit-icon";
    bare.innerHTML = iconSvg(name);
    const small = document.createElement("span");
    small.className = "kit-icon kit-icon-sm";
    small.innerHTML = iconSvg(name);
    row.append(bare, small);
    const tones = { Check: ["pass"], Warning: ["block", "caution"], Minus: ["neutral"] }[name];
    if (tones) {
      tones.forEach((tone) => {
        const disc = document.createElement("span");
        disc.className = "kit-icon-mark tone-" + tone;
        disc.innerHTML = iconSvg(name);
        row.append(disc);
      });
    } else {
      const inline = document.createElement("span");
      inline.className = "kit-icon-inline text-ui";
      inline.append(document.createTextNode("Open "));
      inline.insertAdjacentHTML("beforeend", iconSvg(name, "icon"));
      row.append(inline);
    }
    return row;
  };
  addScale("icons", "Icons", [
    { heading: "Marks" },
    ...ICON_CATALOG.filter((icon) => icon.name !== "ArrowUpRight").map((icon) => ({
      name: icon.name, note: icon.use, node: iconSpecimen(icon.name),
    })),
    { heading: "Arrows" },
    ...ICON_CATALOG.filter((icon) => icon.name === "ArrowUpRight").map((icon) => ({
      name: icon.name, note: icon.use, node: iconSpecimen(icon.name),
    })),
  ]);
  const typeSample = "The quick brown fox — 0x1a2b·9f0e";
  const typeProbe = document.createElement("div");
  typeProbe.hidden = true;
  document.body.append(typeProbe);
  addScale("typography", "Typography", [
    ["Display", "text-display", "Verdict headline. Min 1.5rem (24px), max 1.75rem (28px)."],
    ["Title", "text-title", "Page title and stat figure. Min 1.125rem (18px), max 1.25rem (20px)."],
    ["Heading", "text-heading", "Section and card heading. Fixed 1.125rem (18px)."],
    ["Subheading", "text-subheading", "Minor heading. Phone wallet name."],
    ["Lead", "text-lead", "Verdict reason and intro body."],
    ["Body", "text-body", "Default reading and table cells."],
    ["UI", "text-ui", "Buttons, nav, table head, row title."],
    ["Caption", "text-caption", "Secondary and metadata text."],
    ["Eyebrow", "text-eyebrow", "Section labels."],
    ["Label", "text-label", "Map pills and chips."],
    ["Data", "text-data", "Addresses, hashes, and numbers. Tabular figures, slashed zero."],
  ].map(([name, cls, words]) => {
    const node = document.createElement("p");
    node.className = cls;
    node.textContent = typeSample;
    typeProbe.append(node);
    const cs = getComputedStyle(node);
    return { name, note: `.${cls} · ${cs.fontSize} / ${cs.fontWeight}. ${words}`, node };
  }).concat([{
    name: "cv11",
    note: "Single-storey a. On for the page (font-feature-settings: cv11). Off on the second line, so the two can be judged.",
    node: (() => {
      const wrap = document.createElement("div");
      const on = document.createElement("p");
      on.className = "text-body";
      on.style.margin = "0";
      on.textContent = "a atlas — cv11 on";
      const off = document.createElement("p");
      off.className = "text-body";
      off.style.margin = "0";
      off.style.fontFeatureSettings = "normal";
      off.textContent = "a atlas — cv11 off";
      wrap.append(on, off);
      return wrap;
    })(),
  }]));
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
      ["Raised", "--color-surface-raised", "Page, mast, and cards."],
      ["Surface", "--color-surface", "Tertiary buttons."],
      ["On surface", "--color-text", "Primary text."],
      ["Muted", "--color-text-secondary", "Secondary text."],
      ["Accent", "--color-accent", "Buttons, links, coverage reach."],
      ["Accent hover", "--color-accent-hover", "Pressed or hovered accent."],
      ["Focus ring", "--color-focus-ring", "Keyboard focus."],
      ["Danger", "--tone-block-edge", "Invalid input only."],
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
      node: ramp(["wash", "edge", "text"].map((step) => [step, `--tone-${tone}-${step}`, `${tone} ${step}.`])),
    });
  });
  colorRows.push({ heading: "Primitives" });
  // Names come from the stylesheet so product code does not repeat the ramp.
  const primitiveNames = [];
  for (const sheet of document.styleSheets) {
    let rules;
    try { rules = sheet.cssRules; } catch (e) { continue; }
    for (const rule of rules) {
      if (rule.selectorText !== ":root" || !rule.style) continue;
      for (let i = 0; i < rule.style.length; i++) primitiveNames.push(rule.style[i]);
    }
  }
  const primitiveGroups = [
    ["Bone", (name) => name === "--bone-50" || name === "--white"],
    ["Ink", (name) => name.startsWith("--ink-")],
    ["Leaf", (name) => name.startsWith("--leaf-")],
    ["Ruby", (name) => name.startsWith("--ruby-")],
    ["Gold", (name) => name.startsWith("--gold-")],
  ];
  primitiveGroups.forEach(([name, match]) => {
    const steps = primitiveNames.filter(match).map((token) => [token.replace(/^--/, ""), token]);
    if (steps.length) colorRows.push({ name, note: name + " ramp.", node: ramp(steps) });
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
  const radiusIntro = { none: "None", core: "Core", all: "All", 1: "1 hop" };
  ACTS.forEach((item, i) => {
    paintAct(i, false);
    take("intro-map", "Intro map", radiusIntro[item.cover], ".intro-map");
    if (item.cover === "none") takeGlyph("label", "Label", "Outside", stage.querySelector(".intro-map .cov-pill"));
    if (item.cover === "all") takeGlyph("label", "Label", "Covered", stage.querySelector('.intro-map .cov-pill[data-reach="in"]'));
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
      take("intro", "Intro", "Panel", '.act-panel[aria-hidden="false"]');
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
        segHover.querySelector('.m-seg-btn:not([aria-pressed="true"])')?.classList.add("is-hover");
        add("segment", "Segment", "Hover", segHover);
      }
      takeGlyph("circle", "Circle", "Outside", stage.querySelector('#cov-svg .wdot[data-reach="out"]'));
      takeGlyph("circle", "Circle", "Covered", stage.querySelector('#cov-svg .wdot[data-reach="in"]'));
      const cHover = stage.querySelector('#cov-svg .wdot[data-reach="out"]')?.cloneNode(true);
      if (cHover) { cHover.classList.add("is-hover"); takeGlyph("circle", "Circle", "Hover", cHover); }
      const lHover = stage.querySelector('#cov-svg .cov-pill:not([data-reach="in"])')?.cloneNode(true);
      if (lHover) { lHover.classList.add("is-hover"); takeGlyph("label", "Label", "Hover", lHover); }
    }
    if (n === 2) {
      takeGlyph("circle", "Circle", "Selected", stage.querySelector('#cov-svg .wdot[aria-pressed="true"]'));
      take("wallet-row", "WalletRow", "Covered", '.d-only .m-row[data-key="one"]');
      take("wallet-row", "WalletRow", "Selected", '.d-only .m-row[aria-pressed="true"]');
      take("wallet-row", "WalletRow", "Outside", '.d-only .m-row[data-key="three"]');
      take("wallet-row", "WalletRow", "Unlinked", '.d-only .m-row[data-key="clean"]');
      const hoverRow = stage.querySelector('.d-only .m-row[data-key="clean"]')?.cloneNode(true);
      if (hoverRow) { hoverRow.classList.add("is-hover"); add("wallet-row", "WalletRow", "Hover", hoverRow); }
      const pressRow = stage.querySelector('.d-only .m-row[data-key="clean"]')?.cloneNode(true);
      if (pressRow) { pressRow.classList.add("is-press"); add("wallet-row", "WalletRow", "Pressed", pressRow); }
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
  focusOf("segment", "Segment", "Focus", stage.querySelector('.m-seg-btn[aria-pressed="true"]'));
  const disabledSeg = stage.querySelector(".cov-seg")?.cloneNode(true);
  if (disabledSeg) {
    const idle = [...disabledSeg.querySelectorAll(".m-seg-btn")].find((btn) => !btn.classList.contains("sel"));
    if (idle) idle.disabled = true;
    add("segment", "Segment", "Disabled", disabledSeg);
  }
  const selectedHover = stage.querySelector(".cov-seg")?.cloneNode(true);
  if (selectedHover) {
    selectedHover.querySelector('.m-seg-btn[aria-pressed="true"]')?.classList.add("is-hover");
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
    if (row.classList.contains("attest")) return;
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

  const base = (extra) => ({
    dataset: { max_hops: hops },
    explorer_url: "https://www.newton.xyz",
    attestation: { status: "ATTESTED" },
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
    (() => { const w = document.getElementById("cov-wave"); if (w) { w.className = "swave"; w.dataset.state = "done"; } })();
    const status = document.getElementById("cov-status");
    if (status) status.textContent = spec.status;
    await fillVerdict(spec.result, !!spec.outside);
    const glyphClass = { Clear: "clear", Exposed: "exposed", "Outside reach": "outside" };
    if (glyphClass[spec.radius]) {
      const name = glyphClass[spec.radius];
      const ring = stage.querySelector('#cov-svg .cov-ring[data-state="' + name + '"]');
      if (ring) takeGlyph("label", "Label", spec.radius, ring);
      const dot = stage.querySelector('#cov-svg .wdot[data-state="' + name + '"]');
      if (dot) takeGlyph("circle", "Circle", spec.radius, dot);
    }
    if (spec.step) take("step", "Step", spec.step, ".trail");
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

  hops = 2;
  const showPick = (key) => {
    const addr = wallet(key);
    pickAddr = String(addr).toLowerCase();
    currentAddress = pickAddr;
    placePick(pickAddr);
  };
  hops = 2;
  showPick("two");
  renderConsole(pickAddr, "", true);
  const layers = document.createElement("div");
  layers.className = "kit-layers";
  let layerN = 0;
  const shootLayer = (label, mutate) => {
    if (mutate) mutate();
    const svg = stage.querySelector(".cov-svg");
    if (!svg) return;
    const cell = document.createElement("figure");
    cell.className = "kit-layer";
    const copy = svg.cloneNode(true);
    retargetIds(copy, "layer" + (++layerN));
    const cap = document.createElement("figcaption");
    cap.className = "text-caption";
    cap.textContent = label;
    cell.append(copy, cap);
    layers.append(cell);
  };
  const quietMap = () => {
    const svg = stage.querySelector(".cov-svg");
    svg.classList.remove("scanning");
    const wave = svg.querySelector(".swave");
    if (wave) wave.dataset.state = "done";
    svg.querySelector(".spulse")?.setAttribute("display", "none");
  };
  shootLayer("Choosing");
  shootLayer("Scanning", () => {
    const svg = stage.querySelector(".cov-svg");
    svg.classList.add("scanning");
    const disc = svg.querySelector(".cov-disc");
    if (disc) disc.setAttribute("r", String(COV_R[1]));
  });
  shootLayer("Clear", () => {
    quietMap();
    showPick("two");
    paintBands({ clear: 2 });
  });
  shootLayer("Listed", () => {
    quietMap();
    showPick("direct");
    paintBands({ core: true });
  });
  shootLayer("Exposed", () => {
    quietMap();
    showPick("two");
    paintBands({ clear: 1, exposed: 2 });
  });
  shootLayer("Outside", () => {
    quietMap();
    showPick("three");
    paintBands({ clear: 1, outside: 3 });
  });
  for (const label of ["Failed", "Unattested"]) {
    shootLayer(label, () => {
      quietMap();
      showPick("two");
      paintMapVerdict(label.toLowerCase());
    });
  }
  add("coverage-map", "Coverage map", "Layers", layers);

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
      (() => { const w = document.getElementById("cov-wave"); if (w) { w.className = "swave"; w.dataset.state = "done"; } })();
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
  mountMapAnatomy(catalog);
  catalog.push({
    id: "anatomy",
    title: "Anatomy",
    stories: [...(labelSec?.stories || []), ...(circleSec?.stories || [])],
    parts: [
      { title: "Label", stories: labelSec?.stories || [] },
      { title: "Circle", stories: circleSec?.stories || [] },
    ],
  });
  add("responsive", "Responsive", "Breakpoints", Object.assign(document.createElement("div"), {
    className: "text-body",
    innerHTML: [
      "<p>Breakpoints: 640 and 1024. Card padding is space-group below 640 and space-card from 640. Phone gutters are max(space-group, the safe-area insets). The mast top padding includes safe-area-inset-top.</p>",
      "<p>Display type: 1.5rem at 320, 1.75rem at 768 and at 1440 (the clamp reaches its max near 587px). Title: 1.125rem at 320, 1.25rem at 768 and at 1440 (max near 667px).</p>",
      "<p>Map labels: --map-scale = width / 400, so a 12px caption stays 12px. At a 200px map the scale is 0.5; at 280px it is 0.7; at 420px it is 1.05. On a phone-width frame the hop pills hide, because the segment above the map already names the reach. Below 200px the caption carries the hop count.</p>",
      "<p>Viewport queries that are not container queries: document scroll, safe areas, the 1024px shell, phone landscape, and this kit's own nav.</p>",
    ].join(""),
  }));
  const GROUPS = [
    { id: "foundations", title: "Foundations", sections: ["icons", "typography", "spacing", "color", "radii", "motion", "responsive"] },
    { id: "primitives", title: "Primitives", sections: ["button", "badge", "field", "segment", "wallet-row", "ladder"] },
    { id: "coverage", title: "Coverage map", sections: ["coverage-map", "map-anatomy", "anatomy", "intro-map", "console-map"] },
    { id: "composites", title: "Composites", sections: ["compare", "result", "warnline", "stats", "detail", "error", "card"] },
    { id: "flows", title: "Flows", sections: ["intro", "step", "act", "mast", "nav"] },
  ];
  const componentList = [button, field, segment, walletRow, coverageMap, stepTrail, resultCard, stats, warnline, mast, actPanel];
  const storyNames = new Set();
  catalog.forEach((sec) => (sec.stories || []).forEach((item) => storyNames.add(item.story)));
  window.__missingStories = [];
  componentList.forEach((comp) => {
    comp.STATES.forEach((state) => {
      if (!storyNames.has(state)) {
        window.__missingStories.push(state);
        console.error("Missing story: " + state);
      }
    });
  });
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
      btn.className = "m-seg-btn";
      btn.textContent = text;
      btn.setAttribute("aria-pressed", String(value === current));
      btn.addEventListener("click", () => {
        bar.querySelectorAll(".m-seg-btn").forEach((other) => {
          const on = other === btn;
          
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
  const grouped = new Set(["button", "badge", "field", "segment", "wallet-row", "step"]);
  const paintGroup = (parent, stories, sectionId) => {
    const wrap = document.createElement("div");
    wrap.className = "kit-story";
    wrap.id = sectionId + "-scale";
    const frame = document.createElement("div");
    frame.className = "kit-frame";
    const list = document.createElement("div");
    list.className = "kit-scale";
    stories.forEach((story) => {
      const item = document.createElement("div");
      item.className = "kit-scale-row";
      item.id = story.id;
      const meta = document.createElement("div");
      meta.className = "kit-scale-meta";
      const name = document.createElement("span");
      name.className = "kit-scale-name";
      name.textContent = story.story;
      meta.append(name);
      if (story.note) {
        const note = document.createElement("span");
        note.className = "kit-scale-note";
        note.textContent = story.note;
        meta.append(note);
      }
      const sample = document.createElement("div");
      sample.className = "kit-scale-sample";
      if (story.node) sample.append(story.node);
      item.append(meta, sample);
      list.append(item);
    });
    frame.append(list);
    frame.querySelectorAll("button, a, input, svg").forEach((el) => { el.tabIndex = -1; });
    frame.querySelectorAll("a").forEach((el) => {
      el.addEventListener("click", (e) => e.preventDefault());
    });
    wrap.append(frame);
    parent.append(wrap);
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
      } else if (grouped.has(section.id)) paintGroup(block, section.stories, section.id);
      else paintStories(block, section.stories, section.id);
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
    const seen = [...main.querySelectorAll(".kit-section, .kit-story, .kit-scale-row[id]")].filter((el) => el.dataset.kitSeen);
    const first = seen[0];
    if (!first) return;
    const sectionEl = first.classList.contains("kit-section") ? first : first.closest(".kit-section");
    const storyEl = seen.find((el) => el.classList.contains("kit-scale-row"))
      || seen.find((el) => el.classList.contains("kit-story"));
    if (sectionEl) currentFor(sectionEl.id)?.setAttribute("aria-current", "true");
    if (storyEl) currentFor(storyEl.id)?.setAttribute("aria-current", "true");
  }, { rootMargin: "-10% 0px -70% 0px", threshold: 0 });
  main.querySelectorAll(".kit-section, .kit-story, .kit-scale-row[id]").forEach((el) => mark.observe(el));
  document.body.classList.remove("is-building");
  document.body.classList.add("is-states");
  stopAuto();
}
