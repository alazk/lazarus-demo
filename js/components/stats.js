/** Stats under a verdict.
 * @typedef {Object} StatsProps
 * @property {object} result
 */
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

function statsUpdate(el, props) {
  if (!el || !props) return;
  el.outerHTML = renderStats(props.result);
}
const stats = { render: renderStats, update: statsUpdate, STATES: ["Clear"] };
