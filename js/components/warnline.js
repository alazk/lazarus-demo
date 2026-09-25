/** Warnline. The verdict paints it when the attested decision disagrees.
 * @typedef {Object} WarnlineProps
 * @property {string} text
 */
function warnlineRender(props) {
  return `<div class="warnline"><span class="warn-icon" aria-hidden="true"></span><p>${esc(props.text)}</p></div>`;
}
function warnlineUpdate(el, props) {
  if (!el || !props) return;
  const p = el.querySelector("p");
  if (p) p.textContent = props.text;
}
const warnline = { render: warnlineRender, update: warnlineUpdate, STATES: ["Disagreement"] };
