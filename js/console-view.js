/* ── Step 2: enforcement ──────────────────────────────────────────
   The policy is already chosen, so the map here only shows what it covers;
   the reader picks a wallet and asks Newton to run the policy on it. The
   radius is changed on the policy step. */
function renderConsole(prefill = "", error = "", still = false, opts = {}) {
  document.title = "Lazarus Scan · Newton";
  view = "console";
  paintFlow("scan");
  const ready = presets.filter((p) => p.address);
  const pasted = prefill && !ready.some((r) => r.address.toLowerCase() === String(prefill).trim().toLowerCase());
  const rule = ruleNow();
  stage.className = "stage";
  stage.innerHTML = `
    <div class="console ${still ? "still" : ""} ${opts.swap ? "swap-right" : ""}">
      <div class="col">
        <div class="step-head">
          <div class="text-eyebrow muted">Your policy</div>
          <div class="step-title">
            <div class="text-heading">${esc(ruleTitle(rule))}</div>
            <button class="link-btn" type="button" id="change-policy">Change</button>
          </div>
        </div>
        <div class="card card-policy card-cov">
          <div class="card-body">${renderCoverage(ready, document.body.classList.contains("is-building") ? "console" : "pick")}</div>
        </div>
      </div>

      <div class="col">
        <div class="step-head">
          <div class="text-eyebrow muted">How Newton enforces it</div>
          <div class="text-heading">Pick a wallet to check</div>
        </div>
        <div class="card card-check ${pasted ? "show-paste" : ""}">
          <div class="card-body">
            <p class="part-note">Newton Protocol operators run your policy on this wallet, and a quorum signs the result.</p>
            ${renderLadder(ready, prefill)}
            <div class="d-only try-wallet">
              <span class="label">Example wallets</span>
              ${renderWalletList(ready, prefill, "d-only")}
            </div>
            <button class="d-only paste-link" type="button" id="d-paste">Paste any address</button>
            <div class="addr-wrap">
              <label class="label" for="addr">Paste any Ethereum address</label>
              <input class="field" id="addr" spellcheck="false" autocomplete="off"
                     placeholder="0x…" value="${esc(prefill)}" />
              <p class="err" id="err">${esc(error)}</p>
            </div>
          </div>
          <button class="btn btn-primary btn-lg btn-block" id="run">Run the check</button>
        </div>
      </div>
    </div>`;

  const input = document.getElementById("addr");
  const run = document.getElementById("run");
  document.getElementById("change-policy").onclick = () => { if (!inFlight) { renderPolicy({ swap: true }); syncUrl(true); } };

  const selectAddress = (addr, opts = {}) => {
    const a = String(addr || "").toLowerCase();
    stage.querySelectorAll(".m-row").forEach((x) => {
      const on = (x.dataset.addr || "").toLowerCase() === a;
      x.setAttribute("aria-pressed", String(on));
    });
    input.value = addr;
    input.classList.remove("invalid");
    document.getElementById("err").textContent = "";
    if (!opts.keepDot) placePick(addr);
    else pickAddr = String(addr).toLowerCase();
    syncUrl();
    sync();
  };

  // Coverage map: tap a wallet, or drag the wallet dot along its line to
  // move between wallets. On a phone the list is the only way to choose.
  const svg = document.getElementById("cov-svg");
  const phoneMap = () => stage.clientWidth <= 639;
  let dragged = false;
  if (svg) {
    const pick = document.getElementById("cov-pick");
    const byDist = new Map(ready.map((w) => [DIST[w.key] ?? null, w.address]));
    const toSvg = (ev) => {
      const pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY;
      const m = svg.getScreenCTM(); return m ? pt.matrixTransform(m.inverse()) : null;
    };
    const bandFor = (r) => r < COV_R[0] + 14 ? 0 : r < COV_R[1] ? 1 : r < COV_R[2] ? 2 : r < COV_R[3] ? 3 : null;
    let dragging = false, current;
    pick?.addEventListener("pointerdown", (ev) => {
      if (phoneMap()) return;
      ev.stopPropagation(); ev.preventDefault();
      dragging = true; dragged = false;
      pick.setPointerCapture?.(ev.pointerId);
      pick.classList.add("dragging"); svg.classList.add("ray-active");
      current = undefined;
    });
    pick?.addEventListener("pointermove", (ev) => {
      if (!dragging) return;
      const q = toSvg(ev); if (!q) return;
      const a = RAY_DEG * Math.PI / 180;
      // Project the pointer onto the ray, so the dot only moves along it.
      const r = Math.max(COV_R[0] - 6, Math.min(COV_R[3] + 34,
        (q.x - COV_C) * Math.cos(a) + (q.y - COV_C) * Math.sin(a)));
      const [x, y] = onRay(r);
      setPos(pick, x, y);
      dragged = true;
      const band = bandFor(r);
      if (band !== current) {
        current = band;
        const addr = byDist.get(band);
        if (addr) selectAddress(addr, { keepDot: true });
      }
    });
    const drop = () => {
      if (!dragging) return;
      dragging = false;
      pick.classList.remove("dragging"); svg.classList.remove("ray-active");
      placePick(input.value);                       // snap into the band
    };
    pick?.addEventListener("pointerup", drop);
    pick?.addEventListener("pointercancel", drop);

    svg.querySelectorAll(".wdot").forEach((el) => {
      el.style.cursor = "pointer";
      const choose = (e) => {
        if (phoneMap()) return;
        e.stopPropagation();
        selectAddress(el.dataset.addr);
      };
      el.addEventListener("click", choose);
      el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(e); } });
    });
    svg.addEventListener("click", () => { if (dragged) dragged = false; });
  }

  stage.querySelectorAll(".m-row").forEach((b) => {
    b.onclick = () => {
      stage.querySelector(".card-check")?.classList.remove("show-paste");
      selectAddress(b.dataset.addr);
    };
  });
  const openPaste = () => {
    stage.querySelectorAll(".m-row").forEach((x) => {
      x.setAttribute("aria-pressed", "false");
    });
    stage.querySelector(".card-check")?.classList.add("show-paste");
    input.value = "";
    placePick("");
    sync();
    input.focus();
  };
  const dPaste = document.getElementById("d-paste");
  if (dPaste) dPaste.onclick = openPaste;
  const paste = document.getElementById("m-paste");
  if (paste) paste.onclick = openPaste;

  const valid = (v) => /^0x[0-9a-fA-F]{40}$/.test(String(v ?? "").trim());
  const sync = () => { run.disabled = !valid(input.value); };
  input.oninput = () => {
    input.classList.remove("invalid");
    document.getElementById("err").textContent = "";
    const typed = input.value.trim().toLowerCase();
    placePick(typed);
    stage.querySelectorAll(".m-row").forEach((x) => {
      const on = (x.dataset.addr || "").toLowerCase() === typed;
      x.setAttribute("aria-pressed", String(on));
    });
    sync();
  };
  input.onkeydown = (e) => { if (e.key === "Enter" && !run.disabled) run.click(); };
  run.onclick = () => submit(String(input.value ?? "").trim());
  placePick(prefill);
  sync();
  if (window.matchMedia(`(min-width: ${BP.lg}px)`).matches) input.focus();
}
