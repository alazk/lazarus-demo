/* ── States board ────────────────────────────────────────────────
   ?states=1 paints every screen from the real renderers, so a design
   change can be checked without walking the demo or calling the API. */
function paintSteps(kind, hitHop) {
  stage.querySelectorAll(".step").forEach((row) => {
    const n = Number(row.dataset.step);
    const note = row.querySelector(".step-note");
    row.className = "step";
    const past = n > hops && !(kind === "outside" && n === hitHop);
    if (past) {
      row.classList.add("beyond");
      if (note) note.innerHTML = '<span class="lbl-long">outside reach</span><span class="lbl-short">outside</span>';
      return;
    }
    if (kind === "failed" || kind === "unattested") {
      row.classList.add(kind);
      if (note) note.textContent = kind;
      return;
    }
    if (hitHop == null || n < hitHop) {
      row.classList.add("clear", "resolved");
      if (note) note.textContent = "clear";
      return;
    }
    if (n === hitHop) {
      row.classList.add(kind, "resolved");
      if (note) note.textContent = kind === "outside" ? "outside" : kind;
      return;
    }
    row.classList.add("idle");
    if (note) note.textContent = "";
  });
}
function hopOutcome(band, n, hasResult, inside) {
  let state = (n && band[n]) || "";
  if (!state) {
    for (let i = n + 1; i <= 3; i++) if (band[i]) { state = band[i]; break; }
  }
  if (!state && hasResult && inside) state = "clear";
  return state;
}
function syncCoverageRings(svg) {
  if (!svg) return;
  const band = {};
  svg.querySelectorAll(".cband").forEach((el) => {
    const n = Number(el.dataset.band);
    band[n] = ["clear", "listed", "exposed", "outside"].find((name) => el.classList.contains(name)) || "";
  });
  const hasResult = Object.values(band).some(Boolean) || !!svg.querySelector(".cov-core.listed");
  svg.querySelectorAll(".cov-ring").forEach((r) => {
    const n = Number(r.dataset.ring);
    const inside = n <= hops;
    const state = hopOutcome(band, n, hasResult, inside);
    r.setAttribute("class", `cov-ring ${inside ? "in" : "out"}${state ? " " + state : ""}`);
  });
  svg.querySelectorAll(".cov-pill").forEach((g) => {
    const n = Number(g.dataset.ring);
    const inside = n <= hops;
    const state = hopOutcome(band, n, hasResult, inside);
    g.setAttribute("class", state ? `cov-pill ${state}` : `cov-pill${inside && !hasResult ? " on" : ""}`);
  });
  svg.querySelectorAll(".wdot").forEach((el) => {
    const raw = el.dataset.dist;
    const d = raw === "" || raw == null ? null : Number(raw);
    const n = d === 0 ? 1 : d;
    const inside = d === 0 || (d !== null && d <= hops);
    const state = n ? hopOutcome(band, n, hasResult, inside) : "";
    const chosen = el.classList.contains("chosen") ? " chosen" : "";
    el.setAttribute("class", `wdot ${inside ? "in" : "out"}${state ? " " + state : ""}${chosen}`);
  });
}
function paintBands(spec) {
  const svg = document.getElementById("cov-svg");
  if (!svg || !spec) return;
  svg.querySelectorAll(".cband").forEach((el) => {
    const n = Number(el.dataset.band);
    let cls = "cband";
    if (spec.clear && n <= spec.clear && n !== spec.exposed && n !== spec.outside && n !== spec.listed) cls = "cband clear";
    if (spec.listed === n) cls = "cband listed";
    if (spec.exposed === n) cls = "cband exposed";
    if (spec.outside === n) cls = "cband outside";
    el.setAttribute("class", cls);
  });
  if (spec.core) svg.querySelector(".cov-core")?.setAttribute("class", "cov-core listed");
  syncCoverageRings(svg);
}
let kitActive = false;
let kitCopy = 0;
function retargetIds(root, suffix) {
  if (!root?.querySelectorAll) return;
  const map = new Map();
  [root, ...root.querySelectorAll("[id]")].forEach((el) => {
    if (el.id) map.set(el.id, el.id + "--" + suffix);
  });
  if (!map.size) return;
  const rewrite = (value) => value
    .replace(/url\(#([^)]+)\)/g, (full, id) => (map.has(id) ? "url(#" + map.get(id) + ")" : full))
    .replace(/#([A-Za-z][\w:-]*)/g, (full, id) => (map.has(id) ? "#" + map.get(id) : full));
  const walk = (el) => {
    [...(el.attributes || [])].forEach((attr) => {
      if (attr.name === "id") return;
      if (attr.name === "for" && map.has(attr.value)) {
        el.setAttribute("for", map.get(attr.value));
        return;
      }
      if (!attr.value.includes("#")) return;
      const next = rewrite(attr.value);
      if (next !== attr.value) el.setAttribute(attr.name, next);
    });
    [...el.children].forEach(walk);
  };
  walk(root);
  map.forEach((next, prev) => {
    const el = root.id === prev ? root : root.querySelector("#" + CSS.escape(prev));
    if (el) el.id = next;
  });
}
async function renderStates() {
  const snap = {
    hops, usd, act, view, pickAddr, currentAddress,
    outcomes: Object.fromEntries(Object.entries(outcomes).map(([k, v]) => [k, { ...v }])),
    presets: presets.slice(),
    radiusDemoShown, freezeUrl,
  };
  const wallet = (key) => {
    const addr = presets.find((p) => p.key === key)?.address;
    if (!addr) console.warn("Missing fixture: " + key);
    return addr || null;
  };
  const catalog = [];
  const slug = (name) => name.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
  const NOTES = {
    button: {
      Primary: "One per view. The main action.",
      PrimaryHover: "One per view. The main action.",
      Tertiary: "Secondary action beside a primary.",
      Hover: "Secondary action beside a primary.",
      Disabled: "Unavailable until the view can proceed.",
      Loading: "The check is in flight. The button is busy.",
      Pressed: "Held down. The control scales slightly.",
      Focus: "Keyboard focus. The ring is the same as :focus-visible.",
      WithIcon: "Opens the attestation in the Newton explorer.",
      WithIconHover: "Opens the attestation in the Newton explorer.",
      ActDot: "Moves between the acts of a view.",
    },
    badge: {
      Product: "The product name.",
      Network: "Traced on Ethereum mainnet · attested on Sepolia",
    },
    field: {
      Empty: "No address entered yet.",
      Hover: "Outlined field: fill wash and a darker edge.",
      Filled: "A valid address, ready to screen.",
      Invalid: "The text is not a 42-character address.",
      Focus: "Keyboard focus on the address field.",
      Disabled: "The field cannot be edited.",
    },
    segment: {
      OneHop: "Coverage set to 1 hop.",
      TwoHops: "Coverage set to 2 hops.",
      ThreeHops: "Coverage set to 3 hops.",
      Hover: "Unselected hop: fill wash and an inset edge.",
      Disabled: "This hop has no deployed rule.",
      SelectedHover: "The current reach, with the pointer over it.",
      Focus: "Keyboard focus on the current reach.",
    },
    label: {
      Outside: "This ring sits beyond the chosen reach.",
      Covered: "This ring is inside the chosen reach.",
      Hover: "Outline and fill take the hover edge and wash.",
      Clear: "No exposure in this band.",
      Exposed: "Exposure found in this band.",
      "Outside reach": "Exposure sits outside the chosen reach.",
    },
    circle: {
      Outside: "This wallet sits beyond the chosen reach.",
      Covered: "This wallet sits inside the chosen reach.",
      Selected: "The wallet being screened.",
      Hover: "White fill, hover edge on the outline and letter.",
      Clear: "No exposure at this wallet.",
      Exposed: "Exposure found at this wallet.",
      "Outside reach": "Exposure at this wallet is outside the reach.",
      Focus: "Keyboard focus on a wallet on the map.",
    },
    "wallet-row": {
      Covered: "Inside the current reach.",
      Selected: "The address being screened.",
      Outside: "Beyond the current reach.",
      Unlinked: "No known link.",
      Hover: "Pointer over a wallet that is not the one being screened.",
      Focus: "Keyboard focus on a wallet row.",
      Pass: "Last check was clear, under the current reach.",
      Block: "Last check was listed or exposed, under the current reach.",
      Caution: "Last check was outside the reach.",
    },
    ladder: {
      Header: "The phone list heading and paste control.",
      List: "The phone list of wallets, in order of distance.",
    },
    "intro-map": {
      None: "No reach is drawn, so every ring sits outside coverage.",
      Core: "Reach covers only the Lazarus address.",
      All: "Reach covers every hop.",
    },
    "console-map": {
      Phases: "Hover, keyboard focus, and the scan moving outward.",
      Grid: "Each reach against clear, listed, exposed, and outside.",
    },
    compare: {
      "All six": "All six outcomes at 2 hops, on one wallet when the outcome allows it.",
    },
    radius: {
      None: "No reach is drawn, so every ring sits outside coverage.",
      Core: "Reach covers only the Lazarus address.",
      All: "Reach covers every hop.",
      OneHop: "Screening 1 hop out.",
      TwoHops: "Screening 2 hops out.",
      ThreeHops: "Screening 3 hops out.",
      Hover: "Blue dashed preview of a hop that is not the current reach. No fill, so inner rings stay visible.",
      Scanning: "The check is moving outward from the centre.",
      Clear: "Pale blue disc is the reach. Rings, labels, and wallets are leaf: no link inside.",
      Listed: "Pale blue disc is the reach. The core is ruby (listed); the hop ring is leaf.",
      Exposed: "Pale blue disc is the reach. Hop 1 is leaf, hop 2 ruby (exposed here); hop 3 leaf.",
      "Outside reach": "Pale blue disc is the reach. Hop 1 is leaf; hops 2–3 inherit gold dash (outside reach).",
      Focus: "Keyboard focus on the reach slider.",
    },
    step: {
      Checking: "This hop is still being read.",
      Clear: "No exposure at this hop.",
      Listed: "Direct match on the Lazarus list.",
      Exposed: "Exposure found at this hop.",
      "Outside reach": "Exposure found outside the reach.",
      Failed: "This step could not be read.",
      Signing: "The hops are read. Waiting for the attestation to be signed.",
    },
    attestation: {
      Pending: "The check has not asked for a signature yet.",
      Signing: "The signature is in flight.",
      Attested: "The quorum signed this decision.",
      Failed: "The decision was not signed.",
    },
    path: {
      Exposed: "You, the wallets in between, and Lazarus. One explorer link per transfer.",
      "Outside reach": "The same path, when the link sits beyond the reach.",
    },
    warnline: {
      "Outside reach": "Exposure exists, beyond the reach you set.",
      Disagreement: "The signed decision and the local screen do not match.",
    },
    stats: {
      Clear: "Distance, the smallest transfer, and the decision.",
    },
    detail: {
      Failed: "Why the screen stopped.",
    },
    error: {
      Invalid: "The address could not be screened.",
    },
    result: {
      Clear: "No link inside the coverage. Payment can proceed.",
      Listed: "The address is a known Lazarus wallet.",
      Exposed: "A link was found inside the coverage.",
      "Outside reach": "A link exists, beyond the chosen reach.",
      Failed: "The transaction graph could not be read.",
      "Not attested": "The screen finished, but the quorum did not sign.",
      "Local only": "Newton is not configured, so the decision is local screening only.",
      Disagreement: "The attested decision differs from the local screening result.",
      "Invalid address": "The text is not an Ethereum address, so no screen runs.",
    },
    act: {
      Dots: "One dot per act. The current act is marked.",
      Focus: "Keyboard focus on an act dot.",
    },
    intro: {
      Panel: "One act of the opening. The copy and the map change together.",
    },
    mast: {
      Default: "The product name and the way into the kit.",
    },
    card: {
      Policy: "The reach control.",
      Check: "The address field and the run button.",
    },
    nav: {
      Focus: "Keyboard focus on the link into the kit.",
    },
  };
  function add(id, title, story, node, opts = {}) {
    if (!node) {
      const label = opts.fixture || story;
      console.warn("Missing fixture: " + label);
      node = document.createElement("p");
      node.className = "kit-missing text-body";
      node.textContent = "Missing fixture: " + label;
    }
    let section = catalog.find((item) => item.id === id);
    if (!section) {
      section = { id, title, stories: [] };
      catalog.push(section);
    }
    const copy = node.cloneNode(true);
    copy.classList?.remove("btn-block");
    retargetIds(copy, String(++kitCopy));
    section.stories.push({ story, note: NOTES[id]?.[story] || "", id: id + "-" + slug(story), node: copy, scale: !!opts.scale });
  }
  const take = (id, title, story, selector) => add(id, title, story, stage.querySelector(selector), { fixture: selector });
  const takeGlyph = (id, title, story, node) => {
    if (!node) { add(id, title, story, null, { fixture: story }); return; }
    const g = node.cloneNode(true);
    g.removeAttribute("transform");
    if (story !== "Selected") g.classList.remove("chosen");
    const label = id === "label";
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "kit-glyph");
    svg.setAttribute("viewBox", label ? "-36 -16 72 32" : "-18 -18 36 36");
    svg.setAttribute("width", label ? "72" : "36");
    svg.setAttribute("height", label ? "32" : "36");
    svg.setAttribute("aria-hidden", "true");
    svg.append(g);
    add(id, title, story, svg);
  };

  function addScale(id, title, rows) {
    const list = document.createElement("div");
    list.className = "kit-scale";
    rows.forEach((row) => {
      if (row.heading) {
        const head = document.createElement("p");
        head.className = "kit-scale-heading text-label";
        head.textContent = row.heading;
        list.append(head);
        return;
      }
      const item = document.createElement("div");
      item.className = "kit-scale-row";
      const meta = document.createElement("div");
      meta.className = "kit-scale-meta";
      const name = document.createElement("span");
      name.className = "kit-scale-name";
      name.textContent = row.name;
      const note = document.createElement("span");
      note.className = "kit-scale-note";
      note.textContent = row.note;
      meta.append(name, note);
      const sample = document.createElement("div");
      sample.className = "kit-scale-sample";
      sample.append(row.node);
      item.append(meta, sample);
      list.append(item);
    });
    add(id, title, "Scale", list, { scale: true });
  }
  try {
    view = "states";
    document.title = "UI kit · Lazarus Scan";
    document.body.classList.add("is-building");
    await renderStatesBoard({ wallet, catalog, add, take, takeGlyph, addScale });
    kitActive = true;
  } finally {
    stopAuto();
    hops = snap.hops;
    usd = snap.usd;
    act = snap.act;
    view = kitActive ? "states" : snap.view;
    pickAddr = snap.pickAddr;
    currentAddress = snap.currentAddress;
    Object.keys(outcomes).forEach((key) => { delete outcomes[key]; });
    Object.assign(outcomes, snap.outcomes);
    presets = snap.presets;
    radiusDemoShown = snap.radiusDemoShown;
    freezeUrl = snap.freezeUrl;
    kitOutcomeKeys.clear();
  }
}
