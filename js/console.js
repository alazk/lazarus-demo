/* ── Console ─────────────────────────────────────────────────── */
function setRule(nextHops, nextUsd) {
  let value = nextUsd;
  if (!RULES.some((r) => r.hops === nextHops && r.usd === value)) {
    // Not every combination has a deployed client. Fall to the nearest that
    // does rather than refusing the click and looking broken.
    const atHops = RULES.filter((r) => r.hops === nextHops).map((r) => r.usd);
    if (atHops.length === 0) return;
    value = atHops.reduce((best, v) =>
      Math.abs(v - nextUsd) < Math.abs(best - nextUsd) ? v : best);
  }
  if (nextHops === hops && value === usd) return;
  hops = nextHops;
  usd = value;
  if (document.querySelector(".console")) applyReach();
  else renderConsole(document.getElementById("addr")?.value || "", "", true);
  syncUrl();
}

/* The example wallets in order of distance, with a bar marking the ones the
   current reach covers. Used beside the rings on desktop and on its own on a
   phone, so both show the same picture. */
function renderWalletList(ready, prefill, extra = "") {
  const rows = [...ready].sort((a, b) => (DIST[a.key] ?? 99) - (DIST[b.key] ?? 99));
  const chosenAddr = String(prefill || "").trim().toLowerCase();
  return `
    <div class="m-ladder ${extra}" role="list">
      ${rows.map((r) => {
        const d = DIST[r.key];
        const inside = d !== null && d !== undefined && d <= hops;
        const sub = walletSub(r.key, d);
        const chosen = r.address.toLowerCase() === chosenAddr;
        return `<button class="m-row wrow ${inside ? "in" : ""} ${chosen ? "chosen" : ""} ${walletStatus(d) ? "" : "nostatus"}"
            type="button" role="listitem" data-addr="${esc(r.address)}" data-dist="${d ?? ""}" data-key="${esc(r.key)}"
            aria-pressed="${chosen}" title="${esc(r.address)}"
            aria-label="Wallet ${esc(WALLET_LETTER[r.key] || "")}, ${esc(WALLET_TITLE[r.key] || "")}, ${esc(sub)}">
          <span class="m-bar" aria-hidden="true"></span>
          <span class="w-letter" aria-hidden="true">${esc(WALLET_LETTER[r.key] || "")}</span>
          <span class="m-text">
            <span class="m-name text-ui text-ui--phone-subheading">${esc(WALLET_TITLE[r.key] || r.label || "")}</span>
            <span class="m-sub text-caption text-caption--phone-body">${walletSubHtml(r.key, d)}</span>
          </span>
          <span class="w-addr">${esc(short(r.address))}</span>
        </button>`;
      }).join("")}
    </div>`;
}

/* ── Phone ladder ────────────────────────────────────────────────
   On a phone the reach control and the example wallets are one thing: the
   wallets are listed in order of distance, and a bar marks which ones the
   current reach covers, so what the rule catches is visible before a check
   runs. */
function renderLadder(ready, prefill) {
  const rows = [...ready].sort((a, b) =>
    (DIST[a.key] ?? 99) - (DIST[b.key] ?? 99));
  const chosenAddr = String(prefill || "").trim().toLowerCase();
  const pasted = chosenAddr && !rows.some((r) => r.address.toLowerCase() === chosenAddr);
  return `
    <div class="m-only m-list-head">
      <span class="label">Try a wallet</span>
      <button class="m-paste ${pasted ? "hide" : ""}" type="button" id="m-paste">Paste address</button>
    </div>
    ${renderWalletList(ready, prefill, "m-only")}
`;
}
