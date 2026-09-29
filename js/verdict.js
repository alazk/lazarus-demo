/* ── Submit ──────────────────────────────────────────────────── */
async function submit(address) {
  if (inFlight || (typeof reviewActive !== "undefined" && reviewActive)) return;
  const input = document.getElementById("addr");
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    if (input) {
      input.classList.add("invalid");
      document.getElementById("err").textContent = "That is not a 42-character Ethereum address.";
      input.focus();
    }
    return;
  }
  inFlight = true;
  const run = document.getElementById("run");
  if (run) {
    run.classList.add("is-loading");
    run.setAttribute("aria-busy", "true");
  }
  currentAddress = address.toLowerCase();
  syncUrl(true);
  const search = renderChecking(address);
  try {
    const resp = await fetch("/api/evaluate?address=" + encodeURIComponent(address)
      + "&max_hops=" + hops + "&min_usd=" + usd);
    const result = await resp.json();
    if (result.status === "INVALID_ADDRESS") return renderConsole(address, result.reason);

    // A path found but allowed means the policy's value floor let it through:
    // its own outcome, not a plain pass.
    // Exposure the policy allowed means it sits past the reach you set.
    const outsideReach = result.exposure && result.decision === "ALLOW"
      && typeof result.hop_count === "number" && result.hop_count > hops;
    const key = outcomeOf(result, outsideReach);
    const finding = key === "listed" || key === "exposed" || key === "outside";
    await search.settle(finding ? result.hop_count : null, key);
    await fillVerdict(result, outsideReach);
  } catch (e) {
    await fillVerdict({
      wallet: address.toLowerCase(), status: "SCREENING_FAILED", decision: "DENY",
      detail: String(e.message || e),
    }, false);
  } finally { inFlight = false; }
}

/* ── Verdict ─────────────────────────────────────────────────── */
const STATUS_LABEL = {
  clear: { tone: "pass", icon: "Check", label: "Clear" },
  listed: { tone: "block", icon: "Warning", label: "Listed" },
  exposed: { tone: "block", icon: "Warning", label: "Exposed" },
  outside: { tone: "caution", icon: "Warning", label: "Outside policy" },
  failed: { tone: "neutral", icon: "Minus", label: "Screening failed" },
  unattested: { tone: "neutral", icon: "Minus", label: "Not attested" },
};

/** The same band spec the review fixtures paint, derived from a real result. */
function bandsForOutcome(r, key) {
  const max = r.dataset?.max_hops ?? hops;
  const hit = typeof r.hop_count === "number" ? r.hop_count : null;
  if (key === "listed") return { core: true };
  if (key === "exposed" && hit != null) return { clear: Math.max(0, hit - 1), exposed: hit };
  if (key === "outside" && hit != null) return { clear: max, outside: hit };
  if (key === "clear") return { clear: max };
  return null;
}

async function fillVerdict(r, outsideReach) {
  const panel = document.getElementById("panel");
  const right = document.getElementById("right-slot");

  const actions = document.getElementById("actions-slot");
  if (!panel || !right) return;

  const max = r.dataset?.max_hops ?? hops;
  const hopWord = (n) => `${n} ${n === 1 ? "hop" : "hops"}`;
  const key = outcomeOf(r, outsideReach);
  const bands = bandsForOutcome(r, key);
  if (bands) paintBands(bands);
  paintMapVerdict(key);
  const headline = OUTCOME[key].headline;
  let reason;

  if (key === "failed") {
    reason = "The transaction graph could not be read, so the wallet was not "
           + "screened. The policy denies by default, which is not a finding of exposure.";
  } else if (key === "unattested") {
    reason = r.attestation?.status === "NOT_CONFIGURED"
      ? "This decision is local screening only. It has not been attested."
      : "The wallet was screened, but the decision could not be attested, "
        + "so the policy denies by default.";
  } else if (key === "outside") {
    reason = `Allowed under your reach of ${hopWord(max)}. The policy only blocks `
           + "exposure inside the reach you set.";
  } else if (key === "listed") {
    reason = "This wallet is a known Lazarus Group address.";
  } else if (key === "exposed") {
    reason = `This wallet reaches a known Lazarus Group address in ${hopWord(r.hop_count)}.`;
  } else {
    reason = `No path to a known Lazarus Group address was found within `
           + `${hopWord(max)}.`;
  }

  right.classList.add("swapping");
  await new Promise((res) => setTimeout(res, Math.round(MOTION.interaction * 0.75)));
  if (!panel.isConnected || !right.isConnected) return;
  panel.dataset.state = key;
  panel.classList.add("settled");
  if (view !== "review" && currentAddress && key !== "failed" && key !== "unattested") {
    outcomes[currentAddress] = { state: key, hops: r.dataset?.max_hops ?? hops };
    if (view === "states") kitOutcomeKeys.add(currentAddress);
  }
  document.title = `${headline} · Lazarus Scan`;
  stage.querySelectorAll(".step.waiting").forEach((row) => {
    row.classList.remove("waiting");
    const note = row.querySelector(".step-note");
    if (note && note.textContent === "signing" && row.dataset.state !== "outside") {
      note.textContent = (row.dataset.state === "listed" || row.dataset.state === "exposed")
        ? row.dataset.state : "clear";
    }
  });

  const detail = r.detail || r.attestation?.detail;
  const disagree = r.warning
    ? `<div class="warnline" role="note">${WARN_ICON}<span>${esc(r.warning)}${r.local_decision ? ` Local screening was ${esc(r.local_decision)}.` : ""}</span></div>`
    : "";
  const outsideLine = outsideReach
    ? `<div class="warnline" role="note">${WARN_ICON}
      <span>Exposure found ${esc(hopWord(r.hop_count))} out, outside your reach
      of ${esc(hopWord(max))}.</span></div>`
    : "";
  const status = STATUS_LABEL[key];
  const statusLine = status.label.toLowerCase() === headline.toLowerCase() ? "" : `
      <div class="result-status tone-${status.tone}">
        <span class="result-status-icon" aria-hidden="true">${iconSvg(status.icon)}</span>
        <span class="text-label">${status.label}</span>
      </div>`;
  right.innerHTML = `
    <div class="result-lead">
      ${statusLine}
      <div class="text-display">${esc(headline)}</div>
      ${outsideLine}
      ${disagree}
      <p class="reason text-lead">${esc(reason)}</p>
    </div>
    ${r.status === "SCREENING_FAILED" ? "" : renderStats(r)}
    ${detail ? `<div class="detail text-data">${esc(detail)}</div>` : ""}`;
  paintAttestation(key === "failed" || key === "unattested" ? "failed" : "attested");
  requestAnimationFrame(() => right.classList.remove("swapping"));

  actions.innerHTML = `
    <span class="line"></span>
    ${r.explorer_url ? `<a class="btn btn-primary btn-md" href="${esc(r.explorer_url)}"
       target="_blank" rel="noopener"><span>View attestation<span class="btn-long"> on the Newton explorer</span></span>${iconSvg("ArrowUpRight", "icon")}</a>` : ""}
    <button class="btn btn-tertiary btn-md" id="again">New check</button>`;
  actions.dataset.state = "ready";
  // Back to the console without an entrance, so the map does not jump.
  document.getElementById("again").onclick = () => renderConsole(currentAddress || r.wallet || "", "", true);
}
