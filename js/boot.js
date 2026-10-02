/* ── Boot ────────────────────────────────────────────────────────
   Wait for the example wallets before the first paint, with a cap so a slow
   file cannot hold the page blank. Painting twice shows an empty console.
   Review and the UI kit stay off the product header. On a local host they
   sit under the mast; a live host never inserts them. */
if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
  const dev = document.createElement("nav");
  dev.className = "dev-links";
  dev.innerHTML = `<a class="states-link" href="?review=1">Review</a><a class="states-link" href="?states=1">UI kit</a>`;
  document.querySelector(".mast")?.after(dev);
}

document.getElementById("home").onclick = () => {
  const leavingKit = kitActive || document.body.classList.contains("is-states");
  const leavingReview = typeof reviewActive !== "undefined" && reviewActive;
  document.body.classList.remove("is-states", "is-building", "is-reduced");
  if (leavingReview) leaveReview();
  clearKitOutcomes();
  freezeUrl = false;
  if (view === "intro" && !leavingKit && !leavingReview) return;
  if (leavingKit) kitActive = false;
  view = "intro"; act = 0;
  document.title = "Lazarus Scan · Newton";
  try { history.replaceState({ view: "intro" }, "", location.pathname); } catch (e) {}
  renderIntro();
};

window.addEventListener("popstate", (e) => {
  if (inFlight) return;
  const v = e.state?.view;
  if (!v || v === "intro") { view = "intro"; act = 0; renderIntro(); return; }
  const s = stateFromUrl();
  if (s && s.hops !== null) { hops = s.hops; usd = s.usd; }
  if (v === "policy") { renderPolicy(); return; }
  renderConsole(s?.address || "", "", true);
});

(async function boot() {
  const wallets = fetch("data/demo_wallets.json")
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  // The intro paints straight away and does not need the wallets, so there
  // is nothing to wait for. The wallets arrive whenever the file does: a slow
  // mobile connection used to miss a fixed deadline and the late response was
  // thrown away, leaving the console with no examples for the whole session.
  const wantStates = () => {
    try { return new URLSearchParams(location.search).has("states"); }
    catch (e) { return false; }
  };
  const wantReview = () => {
    try { return new URLSearchParams(location.search).has("review"); }
    catch (e) { return false; }
  };
  if (!wantStates() && !wantReview()) renderIntro();
  const data = await wallets;
  const loaded = data?.wallets;
  if (wantStates()) {
    if (Array.isArray(loaded)) presets = loaded.filter((w) => w.address);
    stopAuto();
    radiusDemoShown = true;
    freezeUrl = true;
    await renderStates();
    return;
  }
  if (wantReview()) {
    if (Array.isArray(loaded)) presets = loaded.filter((w) => w.address);
    stopAuto();
    const picked = new URLSearchParams(location.search).get("radius") || "two";
    await renderReview(picked);
    return;
  }
  if (!Array.isArray(loaded)) return;
  presets = loaded.filter((w) => w.address);
  // A shared link names the radius and the wallet: open the console on it.
  const shared = stateFromUrl();
  if (shared && view === "intro" && !inFlight) {
    if (shared.hops !== null) { hops = shared.hops; usd = shared.usd; }
    stopAuto();
    radiusDemoShown = true;            // the link already says what to look at
    if (shared.step === "policy") { renderPolicy(); return; }
    renderConsole(shared.address || "", "", true);
    return;
  }
  // If the reader is already past the intro, give it the examples now.
  if (view === "console" && !inFlight && document.getElementById("addr")) {
    renderConsole(document.getElementById("addr").value || "", "", true);
  }
  if (view === "policy" && !inFlight) renderPolicy();
})();
