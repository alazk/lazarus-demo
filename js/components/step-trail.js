/** Step trail. The checking view paints the rows; paintSteps and paintAttestation update them.
 * @typedef {Object} StepTrailProps
 * @property {string} [kind]
 * @property {number|null} [hit]
 */
const stepTrail = {
  render() { return ""; },
  update(el, props) { if (props) paintSteps(props.kind, props.hit); },
  STATES: ["Checking", "Signing"],
};
