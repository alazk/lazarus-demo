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
    let result = null;
    try { result = await resp.json(); } catch (e) { result = null; }
    if (result?.status === "INVALID_ADDRESS") return renderConsole(address, result.reason);
    if (!resp.ok || !result) {
      result = { wallet: address.toLowerCase(), status: "SCREENING_FAILED", decision: "DENY",
        detail: result?.reason || `The check did not complete (HTTP ${resp.status}).` };
    }

    // A path found but allowed means the policy's value floor let it through:
    // its own outcome, not a plain pass.
    // Exposure the policy allowed means it sits past the reach you set.
    const outsideReach = result.exposure && result.decision === "ALLOW"
      && typeof result.hop_count === "number" && result.hop_count > hops;
    const key = outcomeOf(result, outsideReach);
    const finding = key === "listed" || key === "exposed" || key === "outside";
    // Unattested results were still screened: the trail shows what the
    // screening found, not a blanket "clear".
    let trailKind = key, trailHit = finding ? result.hop_count : null;
    if (key === "outside" && belowFloor(result)) trailKind = "floor";
    if (key === "unattested") {
      if (result.direct_match) { trailKind = "listed"; trailHit = 0; }
      else if (result.exposure && typeof result.hop_count === "number") {
        trailKind = result.hop_count > hops ? "outside" : belowFloor(result, true) ? "floor" : "exposed";
        trailHit = result.hop_count;
      } else trailKind = "clear";
    }
    await search.settle(trailHit, trailKind);
    await fillVerdict(result, outsideReach);
  } catch (e) {
    await fillVerdict({
      wallet: address.toLowerCase(), status: "SCREENING_FAILED", decision: "DENY",
      detail: String(e.message || e),
    }, false);
  } finally { inFlight = false; }
}

/* ── Verdict ─────────────────────────────────────────────────── */
/** A link inside the radius whose smallest transfer is under the policy's
 *  value floor: the policy allows it, and the page should say why. With
 *  any=true it ignores the decision (for results that were not attested). */
function belowFloor(r, any = false) {
  const floor = r.dataset?.min_exposure_usd ?? usd;
  return Boolean(floor && r.exposure && !r.direct_match
    && (any || r.decision === "ALLOW")
    && typeof r.hop_count === "number" && r.hop_count <= (r.dataset?.max_hops ?? hops)
    && typeof r.exposure_usd === "number" && r.exposure_usd < floor);
}
/** The deployed rule a result was decided under. */
function ruleOf(r) {
  const h = r.dataset?.max_hops ?? hops, u = r.dataset?.min_exposure_usd ?? usd;
  return RULES.find((x) => x.hops === h && x.usd === u) || ruleNow();
}
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
  // Below the floor: the link is inside the reach, so only the rings before
  // it are known to be clear.
  if (key === "outside" && hit != null && hit <= max) return { clear: Math.max(0, hit - 1), outside: hit };
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
  // The headline is the policy's answer. The card under it says Newton's
  // operators signed that answer, so a reader can disagree with the rule or
  // its data without reading it as the protocol missing something.
  const rule = ruleOf(r);
  const answer = { listed: "Non-compliant", exposed: "Non-compliant", clear: "Compliant", outside: "Compliant" }[key];
  const headline = answer || OUTCOME[key].headline;
  let reason;

  if (key === "failed") {
    reason = "The wallet's transfers could not be read, so nothing was sent to "
           + "Newton. The page treats it as non-compliant, which is not a finding of exposure.";
  } else if (key === "unattested") {
    reason = r.attestation?.status === "NOT_CONFIGURED"
      ? "This is a local result only. It was not sent to Newton."
      : "The wallet was read, but no evaluation came back from the Newton Protocol operators, "
        + "so the page treats it as non-compliant.";
  } else if (key === "outside" && belowFloor(r)) {
    reason = `The smallest transfer on the link is ${money(r.exposure_usd)}, `
           + `under this policy's ${money(ruleOf(r).usd)} floor.`;
  } else if (key === "outside") {
    reason = `The data in the policy you have chosen puts this wallet ${hopWord(r.hop_count)} `
           + `from a known Lazarus address.`;
  } else if (key === "listed") {
    reason = `The data in the policy you have chosen lists this wallet as a known Lazarus address.`;
  } else if (key === "exposed") {
    reason = `The data in the policy you have chosen puts this wallet ${hopWord(r.hop_count)} `
           + `from a known Lazarus address.`;
  } else {
    reason = `The data in the policy you have chosen found no known Lazarus address within ${hopWord(max)}.`;
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
  const outsideLine = "";
  // Who decided: Newton's operators, under the policy client the check was
  // sent to. Only an attested result has a verdict to attribute.
  const attested = r.attestation?.status === "ATTESTED" && key !== "failed" && key !== "unattested";
  // The enforcement card closes the result: the answer above is the
  // policy's, and this says Newton's operators signed that answer.
  const decided = attested
    ? `<div class="decided">
        <div class="decided-text">
          <div class="decided-head"><span class="text-ui">Signed by Newton Protocol operators</span></div>
          <p class="decided-body">The operator quorum ran ${esc(rule.label)} on this wallet and signed this answer.</p>
        </div>
        ${r.explorer_url ? `<a class="btn btn-primary btn-md decided-btn" href="${esc(r.explorer_url)}"
          target="_blank" rel="noopener"><span>View the attestation on Newton Explorer</span>${iconSvg("ArrowUpRight", "icon")}</a>` : ""}
      </div>`
    : "";
  const head = document.getElementById("result-head");
  if (head) head.innerHTML = `<div class="text-eyebrow muted">Policy enforcement</div>
    <div class="text-heading">${attested ? "Result" : "No result from Newton"}</div>`;
  const status = answer
    ? { ...STATUS_LABEL[key], label: `${rule.label}'s answer` } : STATUS_LABEL[key];
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
    ${decided}
    <button class="btn btn-tertiary btn-md" id="again">New check</button>`;
  actions.dataset.state = "ready";
  // Back to the console without an entrance, so the map does not jump.
  document.getElementById("again").onclick = () => renderConsole(currentAddress || r.wallet || "", "", true);
}
