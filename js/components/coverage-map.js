/** Coverage map. renderCoverage paints the svg; paintReach updates the radius.
 * @typedef {Object} CoverageMapProps
 * @property {Array} ready
 * @property {string} [mode]
 * @property {number} [hops]
 */
const coverageMap = {
  render(props) { return renderCoverage(props.ready, props.mode || "console"); },
  update(el, props) { if (props && props.hops != null) paintReach(props.hops); },
  STATES: ["Layers"],
};
