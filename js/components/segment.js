/** Hop segment. The buttons are painted by renderCoverage.
 * @typedef {Object} SegmentProps
 * @property {number} hops
 */
const segment = {
  render(props) { return String(props.hops); },
  update(el, props) {
    if (!el || !props) return;
    el.querySelectorAll(".m-seg-btn").forEach((b) => {
      b.setAttribute("aria-pressed", String(Number(b.dataset.hops) === props.hops));
    });
  },
  STATES: ["OneHop", "TwoHops", "ThreeHops", "Hover", "Focus"],
};
