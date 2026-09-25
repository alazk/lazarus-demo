/** Filled and outlined buttons.
 * @typedef {Object} ButtonProps
 * @property {string} label
 * @property {"primary"|"tertiary"} [variant]
 * @property {"md"|"lg"} [size]
 * @property {string} [id]
 * @property {boolean} [disabled]
 * @property {string} [extra]
 */
function buttonRender(props) {
  const variant = props.variant === "tertiary" ? "btn-tertiary" : "btn-primary";
  const size = props.size === "md" ? "btn-md" : "btn-lg";
  const id = props.id ? ` id="${props.id}"` : "";
  const disabled = props.disabled ? " disabled" : "";
  const extra = props.extra ? " " + props.extra : "";
  return `<button class="btn ${variant} ${size}${extra}" type="button"${id}${disabled}>${esc(props.label)}</button>`;
}
function buttonUpdate(el, props) {
  if (!el || !props) return;
  if (props.label != null) el.textContent = props.label;
  if (props.disabled != null) el.disabled = !!props.disabled;
}
const button = {
  render: buttonRender,
  update: buttonUpdate,
  STATES: ["Primary", "Tertiary", "Hover", "Pressed", "Focus", "Disabled"],
};
