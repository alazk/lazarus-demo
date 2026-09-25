/** Address field.
 * @typedef {Object} FieldProps
 * @property {string} [value]
 * @property {string} [error]
 * @property {boolean} [disabled]
 */
function fieldRender(props = {}) {
  const invalid = props.error ? " invalid" : "";
  return `<input class="field${invalid}" id="addr" spellcheck="false" autocomplete="off" placeholder="0x…" value="${esc(props.value || "")}"${props.disabled ? " disabled" : ""} />`;
}
function fieldUpdate(el, props = {}) {
  if (!el || !props) return;
  if (props.value != null) el.value = props.value;
  el.classList.toggle("invalid", !!props.error);
  el.disabled = !!props.disabled;
}
const field = { render: fieldRender, update: fieldUpdate, STATES: ["Empty", "Hover", "Focus", "Invalid", "Disabled"] };
