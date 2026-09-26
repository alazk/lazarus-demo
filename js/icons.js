/* Phosphor regular, the weight phosphoricons.com ships from @phosphor-icons/core.
   Paths are viewBox 0 0 256 256. */
const PHOSPHOR = {
  Check: "M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-56-56a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z",
  Warning: "M236.8,208H19.2a16,16,0,0,1-13.81-7.69,15.86,15.86,0,0,1,0-16.62L114.18,28.93a15.88,15.88,0,0,1,27.64,0l108.8,154.76a15.86,15.86,0,0,1,0,16.62A16,16,0,0,1,236.8,208ZM120,104v40a8,8,0,0,0,16,0V104a8,8,0,0,0-16,0Zm8,88a12,12,0,1,0-12-12A12,12,0,0,0,128,192Z",
  Minus: "M224,128a8,8,0,0,1-8,8H40a8,8,0,0,1,0-16H216A8,8,0,0,1,224,128Z",
  ArrowRight: "M221.66,133.66l-72,72a8,8,0,0,1-11.32-11.32L196.69,136H40a8,8,0,0,1,0-16H196.69L138.34,61.66a8,8,0,0,1,11.32-11.32l72,72A8,8,0,0,1,221.66,133.66Z",
  ArrowUpRight: "M200,64V168a8,8,0,0,1-16,0V83.31L69.66,197.66a8,8,0,0,1-11.32-11.32L172.69,72H88a8,8,0,0,1,0-16H192A8,8,0,0,1,200,64Z",
};

function iconSvg(name, className) {
  const d = PHOSPHOR[name];
  if (!d) return "";
  const cls = className ? ` class="${className}"` : "";
  const rule = name === "Warning" ? ` fill-rule="evenodd"` : "";
  return `<svg${cls} viewBox="0 0 256 256" aria-hidden="true" fill="currentColor"><path${rule} d="${d}"/></svg>`;
}

function stepIcon() {
  return `<span class="step-icon" aria-hidden="true">${iconSvg("Check", "step-glyph step-glyph-check")}${iconSvg("Warning", "step-glyph step-glyph-warning")}${iconSvg("Minus", "step-glyph step-glyph-minus")}</span>`;
}

/* The marks the product draws, in the order the kit shows them. */
const ICON_CATALOG = [
  { name: "Check", use: "Clear and attested steps. Pass status." },
  { name: "Warning", use: "Listed, exposed, and outside steps. Warnline. Block and caution status." },
  { name: "Minus", use: "Failed screening and an unattested decision. Neutral status." },
  { name: "ArrowRight", use: "A path hop with no transaction to open." },
  { name: "ArrowUpRight", use: "A link that leaves the page: explorer, transfer, transaction." },
];
