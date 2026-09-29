const stage = document.getElementById("stage");
const short = (a) => (a ? a.slice(0, 6) + "…" + a.slice(-4) : "");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function money(n) {
  if (typeof n !== "number") return null;
  if (n >= 1e6) {
    const m = n / 1e6;
    return "$" + (m >= 10 || Number.isInteger(m) ? Math.round(m) : m.toFixed(1)) + "m";
  }
  if (n >= 1e3) return "$" + Math.round(n / 1e3) + "k";
  return "$" + Math.round(n);
}
/* The deployed contracts, so the policy can be read rather than trusted. */
const POLICY_ADDRESS = "0x5A46A90e0B26Ed56201F24620dbF701D53433BB8";

/* Every combination below is a policy client already bound to the policy
   with those parameters. Selecting one selects which contract the check is
   submitted to, so the rule is fixed onchain before the wallet is screened. */
const RULES = [
  { hops: 1, usd: 0 }, { hops: 2, usd: 0 }, { hops: 3, usd: 0 },
];
const HOP_CHOICES = [...new Set(RULES.map((r) => r.hops))].sort();
const USD_CHOICES = [...new Set(RULES.map((r) => r.usd))].sort((a, b) => a - b);

const STEP_LABELS = [
  "Checking the wallet itself",
  "Looking one hop out",
  "Looking two hops out",
  "Looking three hops out",
];
const WARN_ICON = iconSvg("Warning", "warn-icon");
const STEP_TILE = ["Wallet", "1 hop", "2 hops", "3 hops"];
const STEP_SHORT = ["The wallet itself", "One hop out", "Two hops out", "Three hops out"];

/* Captions say where the wallet sits without naming the verdict. */
const LABELS = {
  direct: "Lazarus", one: "1 hop", two: "2 hops", three: "3 hops", clean: "No known link",
};
/* Phone ladder: each example wallet with its known distance. */
const DIST = { direct: 0, one: 1, two: 2, three: 3, clean: null };
const LADDER_NAMES = {
  direct: "Lazarus wallet", one: "1 hop away", two: "2 hops away",
  three: "3 hops away", clean: "No known link",
};
/* The example wallets by letter, with labels limited to what is verified
   about each address: its distance from the list, and for E what the
   address publicly is. No invented identities or locations. */
const WALLET_LETTER = { direct: "A", one: "B", two: "C", three: "D", clean: "E" };
const WALLET_TITLE = {
  direct: "Lazarus Group address", one: "Direct counterparty",
  two: "Second-degree contact", three: "Third-degree contact",
  clean: "Clean wallet",
};
const WALLET_NOTE = {
  direct: "North Korea · on the list", one: "1 hop from Lazarus", two: "2 hops from Lazarus",
  three: "3 hops from Lazarus", clean: "No known link to the list",
};
/* Where each wallet sits on the map: its band, on 45° compass points,
   clear of the hop labels stacked above the centre (270°). */
const WALLET_ANGLE = { direct: 90, one: 180, two: 0, three: 135, clean: 45 };
function walletXY(key) {
  const d = DIST[key];
  const r = d === 0 ? COV_R[0] - 16 : (d === null || d === undefined) ? COV_R[3] + 22 : (COV_R[d - 1] + COV_R[d]) / 2;
  const a = (WALLET_ANGLE[key] ?? 45) * Math.PI / 180;
  return [COV_C + r * Math.cos(a), COV_C + r * Math.sin(a)];
}
function walletStatus(d) {
  return d === null || d === undefined || d === "" ? "" : Number(d) <= hops ? "covered" : "not covered";
}
function walletSub(key, d) {
  const st = walletStatus(d);
  return (WALLET_NOTE[key] || "") + (st ? " · " + st : "");
}
/** The descriptor as parts, so narrow phones can show just the status. */
function walletSubHtml(key, d) {
  const st = walletStatus(d);
  return `<span class="sub-note">${esc(WALLET_NOTE[key] || "")}</span><span class="sub-sep">${st ? " · " : ""}</span><span class="sub-status">${esc(st)}</span>`;
}
/* One name for each outcome. Tone is the colour; kit is the story label. */
const OUTCOME = Object.freeze({
  clear:      { tone: "pass",    headline: "Compliant",                         kit: "Clear" },
  listed:     { tone: "block",   headline: "Non-compliant",                     kit: "Listed" },
  exposed:    { tone: "block",   headline: "Non-compliant",                     kit: "Exposed" },
  outside:    { tone: "caution", headline: "Compliant",                        kit: "Outside reach" },
  failed:     { tone: "neutral", headline: "Screening failed",                  kit: "Failed" },
  unattested: { tone: "neutral", headline: "Not attested",                      kit: "Not attested" },
});
function outcomeOf(result, outsideReach) {
  if (!result) return "clear";
  if (result.status === "SCREENING_FAILED") return "failed";
  if (result.status === "ATTESTATION_FAILED" || result.attestation?.status === "NOT_CONFIGURED") return "unattested";
  if (result.direct_match) return "listed";
  if (outsideReach) return "outside";
  if (result.exposure) return "exposed";
  return "clear";
}
function outcomeDotLabel(state) {
  return OUTCOME[state]?.headline || "";
}

/* The last outcome per wallet, kept with the reach it was checked under, so
   a row only shows a result that is true of the current rule. */
const outcomes = {};
const kitOutcomeKeys = new Set();
function clearKitOutcomes() {
  kitOutcomeKeys.forEach((key) => { delete outcomes[key]; });
  kitOutcomeKeys.clear();
}
let currentAddress = "";

const BP = Object.freeze({ sm: 640, lg: 1024 });
let view = "intro";
let act = 0;
let hops = 3;
let usd = 0;
let inFlight = false;
let presets = [];


/* The chain reads differently in each act: first only the listed address is
   known, then a list check clears everything downstream of it, then the scan
   covers the whole path. Same four nodes throughout, so the argument is made
   by what lights up rather than by three separate diagrams. */
const CHAIN = ["Lazarus wallet", "Direct counterparty", "Second degree", "Wallet you pay"];

const ACTS = [
  { kicker: "Why this exists", title: "The Lazarus Group",
    body: "A North Korean state hacking operation. They have taken billions from "
        + "exchanges and bridges, and their addresses are designated by OFAC.",
    cover: "none",
    note: "Lazarus at the centre. Each ring is one transfer out." },

  { kicker: "The gap", title: "A list checks one address.",
    body: "It compares the wallet you are paying against a set of designated "
        + "addresses. But the money moved along a path. The wallet is not on "
        + "the list, it is one transfer from a wallet that is, and a list check "
        + "cannot tell you that.",
    cover: 1,
    note: "A list covers one hop. The wallet you pay clears." },

  { kicker: "The policy", title: "Screen the path, not the address.",
    body: "Newton Lazarus Scan walks the transfer graph outward from the wallet you are "
        + "paying and reports how far a known address sits, and how much moved "
        + "along the way.",
    cover: "all",
    note: "The policy covers every ring inside your reach." },
];

/* Must match the motion tokens in design/tokens.css.
   --duration-interaction 300, emphasis ×2, beat ×4, cycle ×12.
   Map timings must match the Map block: pulseCycle = cycle,
   pulseGap = beat (cycle / 3), frontStep = flash = emphasis,
   burst = interaction × 2, pickPulse = beat. */
const MOTION = Object.freeze({
  interaction: 300,
  emphasis: 600,
  beat: 1200,
  cycle: 3600,
  pulseCycle: 3600,
  pulseGap: 1200,
  frontStep: 600,
  flash: 600,
  burst: 600,
  pickPulse: 1200,
});

const flowSteps = () => [
  "The wallet\u2019s transfers are read from the live graph.",
  `The scan walks outward up to ${hops} ${hops === 1 ? "hop" : "hops"}, `
    + "stopping at the first flagged address.",
  "An operator quorum attests the decision onchain.",
];
