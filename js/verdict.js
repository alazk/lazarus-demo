/* ── Submit ──────────────────────────────────────────────────── */
async function submit(address) {
  if (inFlight) return;
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
  clear: { tone: "pass", icon: "✓", label: "Clear" },
  listed: { tone: "block", icon: "!", label: "Listed" },
  exposed: { tone: "block", icon: "!", label: "Exposed" },
  outside: { tone: "caution", icon: "⚠", label: "Outside policy" },
  failed: { tone: "neutral", icon: "–", label: "Screening failed" },
  unattested: { tone: "neutral", icon: "–", label: "Not attested" },
};

function renderPath(r) {
  const nodes = Array.isArray(r.path) && r.path.length > 1
    ? r.path
    : (r.edges || []).flatMap((edge, i) => (i === 0 ? [edge.from, edge.to] : [edge.to])).filter(Boolean);
  if (nodes.length < 2) return "";
  const edges = r.edges || [];
  const body = nodes.map((addr, i) => {
    const role = i === 0 ? "You" : i === nodes.length - 1 ? "Lazarus" : "Via";
    const lazarus = i === nodes.length - 1 ? " is-lazarus" : "";
    const node = `<span class="path-node${lazarus}"><span class="path-role text-eyebrow">${role}</span><span class="text-data">${esc(short(addr))}</span></span>`;
    if (i === nodes.length - 1) return `<span class="path-hop">${node}</span>`;
    const tx = edges[i]?.tx;
    const link = tx
      ? `<a class="path-edge text-caption" href="https://etherscan.io/tx/${esc(tx)}" target="_blank" rel="noopener">${esc(short(tx))}<span aria-hidden="true"> ↗</span></a>`
      : `<span class="path-edge text-caption" aria-hidden="true">→</span>`;
    return `<span class="path-hop">${node}${link}</span>`;
  }).join("");
  return `<div class="path-strip">${body}</div>`;
}

function renderStats(r) {
  const max = r.dataset?.max_hops ?? hops;
  const distance = r.direct_match ? "On the list"
    : r.exposure ? `${r.hop_count} ${r.hop_count === 1 ? "hop" : "hops"}`
    : "None";
  const value = r.direct_match ? "—"
    : typeof r.exposure_usd === "number" ? money(r.exposure_usd) : "—";
  const decision = r.decision === "ALLOW" ? "Allowed" : "Blocked";

  // The figure links to its transfer only when that transfer is the one the
  // screening reported. When the smallest sits deeper in the path there is
  // no hash for it, and linking the first edge would point at the wrong one.
  const tx = (r.edges || [])[0]?.tx;
  const isFirstEdge = typeof r.first_edge_usd === "number"
    && r.first_edge_usd === r.exposure_usd;
  const valueCell = (tx && isFirstEdge)
    ? `<a class="stat-v text-title stat-link" href="https://etherscan.io/tx/${esc(tx)}"
         target="_blank" rel="noopener" title="The transfer this figure comes from"
         >${esc(value)} <span class="stat-ext">↗</span></a>`
    : `<div class="stat-v text-title">${esc(value)}</div>`;

  return `<div class="stats">
    <div class="stat"><div class="stat-k text-eyebrow">Distance</div>
      <div class="stat-v text-title">${esc(distance)}</div></div>
    <div class="stat"><div class="stat-k text-eyebrow">Smallest transfer</div>${valueCell}</div>
    <div class="stat"><div class="stat-k text-eyebrow">Decision</div>
      <div class="stat-v text-title">${esc(decision)}</div></div>
  </div>`;
}

/** Fill the panel the scan is already sitting in: colour it, write the right
 *  column, add the path below the settled steps. The steps do not move. */
async function fillVerdict(r, outsideReach) {
  const panel = document.getElementById("panel");
  const right = document.getElementById("right-slot");

  const actions = document.getElementById("actions-slot");
  if (!panel || !right) return;

  const max = r.dataset?.max_hops ?? hops;
  const hopWord = (n) => `${n} ${n === 1 ? "hop" : "hops"}`;
  const key = outcomeOf(r, outsideReach);
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
  panel.dataset.state = key;
  panel.classList.add("settled");
  if (currentAddress && key !== "failed" && key !== "unattested") {
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
  const path = (key === "exposed" || key === "outside") ? renderPath(r) : "";
  const status = STATUS_LABEL[key];
  right.innerHTML = `
    <div class="result-lead">
      <div class="result-status tone-${status.tone}">
        <span class="result-status-icon" aria-hidden="true">${status.icon}</span>
        <span class="text-eyebrow">${status.label}</span>
      </div>
      <div class="text-display">${esc(headline)}</div>
      ${outsideLine}
      ${disagree}
      <p class="reason text-lead">${esc(reason)}</p>
    </div>
    ${path}
    ${r.status === "SCREENING_FAILED" ? "" : renderStats(r)}
    ${detail ? `<div class="detail text-data">${esc(detail)}</div>` : ""}`;
  paintAttestation(key === "failed" || key === "unattested" ? "failed" : "attested");
  requestAnimationFrame(() => right.classList.remove("swapping"));

  actions.innerHTML = `
    <span class="line"></span>
    ${r.explorer_url ? `<a class="btn btn-primary btn-md" href="${esc(r.explorer_url)}"
       target="_blank" rel="noopener"><span>View attestation<span class="btn-long"> on the Newton explorer</span></span><span aria-hidden="true">↗</span></a>` : ""}
    <button class="btn btn-tertiary btn-md" id="again">New check</button>`;
  actions.dataset.state = "ready";
  // Back to the console without an entrance, so the map does not jump.
  document.getElementById("again").onclick = () => renderConsole(currentAddress || r.wallet || "", "", true);
}
