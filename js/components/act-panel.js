/** Intro act panel. renderIntro paints the three acts; paintAct updates which one shows.
 * @typedef {Object} ActPanelProps
 * @property {number} act
 * @property {boolean} [animate]
 */
const actPanel = {
  render() { return ""; },
  update(el, props) { if (props) paintAct(props.act, props.animate !== false); },
  STATES: ["Panel"],
};
