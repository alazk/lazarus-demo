/* ── Radius review ───────────────────────────────────────────────
   ?review=1 paints the real dashboard from local fixtures. The selector
   chooses which radius state to show. Nothing here calls the API: that
   path stays in submit(), the same split as screening and the testnet. */

let reviewActive = false;
let reviewShowing = "";
let reviewGen = 0;
let reviewSnap = null;

/* The radius stories the kit already names, in the order they are reviewed. */
const REVIEW_RADIUS = [
  { id: "one", label: "1 hop", hops: 1, kind: "choose" },
  { id: "two", label: "2 hops", hops: 2, kind: "choose" },
  { id: "three", label: "3 hops", hops: 3, kind: "choose" },
  { id: "hover", label: "Hover", hops: 2, kind: "hover", preview: 3 },
  { id: "focus", label: "Focus", hops: 2, kind: "focus" },
  { id: "scanning", label: "Scanning", hops: 2, kind: "scanning", wallet: "two" },
  {
    id: "clear", label: "Clear", hops: 2, kind: "result", wallet: "clean",
    steps: "clear", hit: null, band: { clear: 2 },
    status: "No link found inside your coverage",
    result(addr) {
      return reviewBase(addr, { decision: "ALLOW", exposure: false });
    },
  },
  {
    id: "listed", label: "Listed", hops: 1, kind: "result", wallet: "direct",
    steps: "listed", hit: 0, band: { core: true },
    status: "Known Lazarus Group address",
    result(addr) {
      return reviewBase(addr, {
        decision: "DENY", exposure: true, direct_match: true, hop_count: 0,
      });
    },
  },
  {
    id: "exposed", label: "Exposed", hops: 3, kind: "result", wallet: "two",
    steps: "exposed", hit: 2, band: { clear: 1, exposed: 2 },
    status: "Found 2 hops out",
    result(addr) {
      return reviewBase(addr, {
        decision: "DENY", exposure: true, direct_match: false,
        hop_count: 2, exposure_usd: 1250, first_edge_usd: 1250,
        ...reviewPath([
          addr,
          "0x2222222222222222222222222222222222222222",
          "0x3333333333333333333333333333333333333333",
        ]),
      });
    },
  },
  {
    id: "outside", label: "Outside reach", hops: 1, kind: "result", wallet: "three",
    steps: "outside", hit: 3, band: { clear: 1, outside: 3 }, outside: true,
    status: "Found 3 hops out · outside your coverage",
    result(addr) {
      return reviewBase(addr, {
        decision: "ALLOW", exposure: true, direct_match: false,
        hop_count: 3, exposure_usd: 840,
        ...reviewPath([
          addr,
          "0x4444444444444444444444444444444444444444",
          "0x5555555555555555555555555555555555555555",
          "0x3333333333333333333333333333333333333333",
        ]),
      });
    },
  },
];

function reviewAddr(key) {
  const found = presets.find((p) => p.key === key);
  if (found?.address) return found.address;
  const standin = {
    direct: "0x1111111111111111111111111111111111111111",
    one: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    two: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    three: "0xcccccccccccccccccccccccccccccccccccccccc",
    clean: "0xdddddddddddddddddddddddddddddddddddddddd",
  };
  return standin[key] || standin.clean;
}

function reviewBase(addr, extra) {
  return {
    wallet: addr,
    dataset: { max_hops: hops },
    explorer_url: "https://www.newton.xyz",
    ...extra,
  };
}

function reviewPath(addrs) {
  const edges = addrs.slice(0, -1).map((from, i) => ({
    from,
    to: addrs[i + 1],
    tx: "0x" + String(i + 1).padStart(64, "a"),
  }));
  return { path: addrs, edges };
}

function reviewSpec(id) {
  return REVIEW_RADIUS.find((item) => item.id === id) || REVIEW_RADIUS[1];
}

function ensureReviewBar() {
  let bar = document.getElementById("review-bar");
  if (bar) return bar;
  bar = document.createElement("div");
  bar.id = "review-bar";
  bar.className = "review-bar";
  const groups = [
    ["Choosing", ["one", "two", "three", "hover", "focus"]],
    ["Checking", ["scanning"]],
    ["Result", ["clear", "listed", "exposed", "outside"]],
  ];
  const options = groups.map(([name, ids]) => {
    const items = ids.map((id) => {
      const spec = reviewSpec(id);
      return `<option value="${spec.id}">${esc(spec.label)}</option>`;
    }).join("");
    return `<optgroup label="${esc(name)}">${items}</optgroup>`;
  }).join("");
  bar.innerHTML = `
    <label class="text-label" for="review-radius">Radius</label>
    <select class="review-pick" id="review-radius">${options}</select>
    <p class="review-note">Local fixtures. The check is not sent.</p>`;
  stage.before(bar);
  bar.querySelector("#review-radius").onchange = (e) => { showReview(e.target.value); };
  return bar;
}

/** Replay the real scan, so the review shows the same timing as a check. */
async function playReviewScan(addr, gen) {
  while (gen === reviewGen) {
    const search = renderChecking(addr);
    if (gen !== reviewGen) return;
    await search.settle(null, "clear");
    if (gen !== reviewGen) return;
    await new Promise((r) => setTimeout(r, MOTION.beat));
  }
}

function reviewQuiet() {
  document.getElementById("cov-spulse")?.setAttribute("display", "none");
  const wave = document.getElementById("cov-wave");
  if (wave) { wave.className = "swave"; wave.dataset.state = "done"; }
}

async function showReview(id) {
  const spec = reviewSpec(id);
  const gen = ++reviewGen;
  reviewShowing = spec.id;
  const select = document.getElementById("review-radius");
  if (select) select.value = spec.id;
  hops = spec.hops;
  usd = 0;
  radiusDemoShown = true;
  stopRadiusDemo(false);
  freezeUrl = true;
  try {
    const params = new URLSearchParams();
    params.set("review", "1");
    params.set("radius", spec.id);
    history.replaceState({ view: "review", radius: spec.id }, "", location.pathname + "?" + params.toString());
  } catch (e) {}

  if (spec.kind === "scanning") {
    const addr = reviewAddr(spec.wallet);
    pickAddr = addr.toLowerCase();
    currentAddress = pickAddr;
    playReviewScan(addr, gen);
    return;
  }

  if (spec.kind === "result") {
    const addr = reviewAddr(spec.wallet);
    pickAddr = addr.toLowerCase();
    currentAddress = pickAddr;
    renderChecking(addr);
    if (gen !== reviewGen) return;
    paintSteps(spec.steps, spec.hit);
    paintBands(spec.band);
    reviewQuiet();
    const status = document.getElementById("cov-status");
    if (status) status.textContent = spec.status;
    await fillVerdict(spec.result(addr), !!spec.outside);
    if (gen !== reviewGen) return;
    const again = document.getElementById("again");
    if (again) again.onclick = () => { showReview("two"); };
    return;
  }

  renderConsole("", "", true);
  if (gen !== reviewGen) return;
  stopRadiusDemo(false);
  radiusDemoShown = true;
  if (spec.kind === "hover") previewReach(spec.preview);
  if (spec.kind === "focus") document.getElementById("cov-svg")?.classList.add("is-focus");
}

/** The dashboard's own radius control, followed while a choosing state is up. */
function noteReviewRadius(n) {
  if (!reviewActive) return;
  const id = n === 1 ? "one" : n === 2 ? "two" : n === 3 ? "three" : "";
  if (!id || id === reviewShowing) return;
  const current = reviewSpec(reviewShowing);
  if (current.kind !== "choose" && current.kind !== "hover" && current.kind !== "focus") return;
  showReview(id);
}

async function renderReview(id) {
  reviewActive = true;
  view = "review";
  if (!reviewSnap) reviewSnap = { radiusDemoShown };
  document.body.classList.add("is-review");
  document.querySelector('.states-link[href="?review=1"]')?.setAttribute("aria-current", "page");
  ensureReviewBar();
  await showReview(id);
}

function leaveReview() {
  reviewActive = false;
  reviewShowing = "";
  reviewGen += 1;
  document.body.classList.remove("is-review");
  document.getElementById("review-bar")?.remove();
  document.querySelector('.states-link[href="?review=1"]')?.removeAttribute("aria-current");
  if (reviewSnap) {
    radiusDemoShown = reviewSnap.radiusDemoShown;
    reviewSnap = null;
  }
}
