/** Mast. The wordmark, badge, and network pill are in index.html.
 * @typedef {Object} MastProps
 * @property {string} [network]
 */
const mast = {
  render() { return document.querySelector(".mast")?.outerHTML || ""; },
  update(el, props) {
    const pill = (el || document).querySelector?.(".pill");
    if (pill && props && props.network) pill.lastChild.textContent = props.network;
  },
  STATES: ["Default"],
};
