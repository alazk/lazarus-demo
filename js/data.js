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
const POLICY_ADDRESS = "0xCC3957c06472f9E599ED2eebA754D5854F23321b";

/* Every rule below is a policy client already bound to the policy with
   those parameters (policy/out/clients.sepolia.json). Choosing one chooses
   which contract the check is submitted to, so the rule is fixed onchain
   before the wallet is screened. The owner is the wallet that deployed the
   clients; update it here if ownership moves. */
const POLICY_OWNER = "0x8b4bA8708239757e84aD26a503500Bc5fC1c1a48";
const RULES = [
  { hops: 1, usd: 0, client: "0x8a8F5389B1ab8Dee99829A9bB2E7b235809EaeC4",
    name: "1 hop" },
  { hops: 2, usd: 0, client: "0x426B922f21bdb1201Cac1470d224B6F9b92630fe",
    name: "2 hops" },
  { hops: 3, usd: 0, client: "0xAbe39aa25ffB4B13C15166D10a27E9132f207BE8",
    name: "3 hops" },
];
const ruleNow = () => RULES.find((r) => r.hops === hops && r.usd === usd) || RULES[2];
/** The rule in words, exactly as the policy evaluates it. */
function ruleText(r) {
  const reach = r.hops === 1 ? "one hop" : `${r.hops} hops`;
  return `Block the wallet if it is a Lazarus address or within ${reach} of one`
    + (r.usd ? `, and every transfer on that path is at least ${money(r.usd)}.` : ".");
}
const POLICY_DOCS = "https://docs.newton.xyz/developers/guides/writing-policies";
const SEPOLIA_ADDR = (a) => "https://sepolia.etherscan.io/address/" + a;
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
/* The smallest transfer on each example's path, from the chain check on
   30 Sep 2026. Only used to show which examples a value floor lets through. */
const WALLET_USD = { one: 90473, two: 55270, three: 5857588 };
function meetsFloor(key, floor = usd) {
  return !floor || key === "direct" || (WALLET_USD[key] ?? 0) >= floor;
}
/** Whether the rule at radius n (and the current floor) would block a wallet. */
function coversWallet(key, d, n = hops, floor = floorAt(n)) {
  if (d === 0) return true;
  if (d === null || d === undefined || d === "") return false;
  return Number(d) <= n && meetsFloor(key, floor);
}
/** The floor a radius would carry: the current one if a client exists for
 *  it, otherwise none (setRule falls back the same way). */
function floorAt(n) {
  return RULES.some((r) => r.hops === n && r.usd === usd) ? usd : 0;
}
function walletStatus(d, key) {
  if (d === null || d === undefined || d === "") return "";
  if (Number(d) > hops) return "not covered";
  return meetsFloor(key) ? "covered" : "below floor";
}
function walletSub(key, d) {
  const st = walletStatus(d, key);
  return (WALLET_NOTE[key] || "") + (st ? " · " + st : "");
}
/** The descriptor as parts, so narrow phones can show just the status. */
function walletSubHtml(key, d) {
  const st = walletStatus(d, key);
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
/* The attested decision is the authority. A pass is shown only for an
   attested ALLOW; anything unrecognised is treated as a failed check, so an
   unexpected response can never read as Compliant. */
function outcomeOf(result, outsideReach) {
  if (!result || result.status === "SCREENING_FAILED") return "failed";
  if (result.status === "ATTESTATION_FAILED" || result.attestation?.status === "NOT_CONFIGURED") return "unattested";
  if (result.decision !== "ALLOW" && result.decision !== "DENY") return "failed";
  if (result.direct_match) return "listed";
  if (result.decision === "DENY") return result.exposure ? "exposed" : "failed";
  if (result.attestation?.status !== "ATTESTED") return "unattested";
  return result.exposure ? "outside" : "clear";
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


/* The intro sets up why, then the two parts of the demo on the same rings.
   The policy is the scanner plus the rule; enforcement is Newton applying
   the policy and returning a signed evaluation. */
const ACTS = [
  { kicker: "Why this exists", title: "The Lazarus Group",
    body: "North Korea's state hackers. They have stolen billions in crypto, "
        + "and Arkham attributes thousands of addresses to them. Paying one of "
        + "those wallets, or one close to it, is the risk.",
    cover: 0, verdict: false,
    note: "Lazarus at the centre. Each ring is one transfer out." },

  { kicker: "Part 1 · The policy", title: "The policy is the check.",
    body: "It sets a rule and the data behind it. Here the data is a scanner "
        + "that finds how many hops a wallet sits from a Lazarus address, and "
        + "the rule says how many count. Anyone can write a policy with their own data.",
    cover: 2, verdict: false,
    note: "This policy covers 2 hops. The wallet at 3 is outside it." },

  { kicker: "Part 2 · Policy enforcement", title: "Newton enforces it.",
    body: "Newton's operator set evaluates the wallet you are about to pay "
        + "against the policy, and a quorum signs the result. Newton enforces "
        + "what the policy says, so the result is as good as the policy and its data.",
    cover: 3, verdict: true,
    note: "Inside a 3-hop policy, so the operators block it." },
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
