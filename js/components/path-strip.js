/** Path strip. The hops between the wallet and Lazarus.
 * @typedef {Object} PathStripProps
 * @property {object} result
 */
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


function pathStripUpdate(el, props) {
  if (!el || !props) return;
  el.outerHTML = renderPath(props.result);
}
const pathStrip = { render: renderPath, update: pathStripUpdate, STATES: ["Exposed", "Listed"] };
