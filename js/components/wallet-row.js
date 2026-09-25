/** Wallet row. renderWalletList in console.js builds the list.
 * @typedef {Object} WalletRowProps
 * @property {Array} ready
 * @property {string} [prefill]
 * @property {string} [extra]
 */
const walletRow = {
  render(props) { return renderWalletList(props.ready, props.prefill || "", props.extra || ""); },
  update(el, props) { if (el && props) el.outerHTML = walletRow.render(props); },
  STATES: ["Covered", "Selected", "Hover", "Pressed", "Unlinked"],
};
