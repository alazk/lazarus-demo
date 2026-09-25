/** Result card. fillVerdict writes the panel the scan is already showing.
 * @typedef {Object} ResultCardProps
 * @property {object} result
 * @property {boolean} [outside]
 */
const resultCard = {
  render() { return ""; },
  update(el, props) { if (props) return fillVerdict(props.result, !!props.outside); },
  STATES: ["Clear", "Listed", "Exposed", "Outside", "Failed", "Not attested"],
};
