# Lazarus Scan design audit, 2 October 2026

Scope: the whole page as a first-time visitor meets it, judged on one question: can someone who has never heard of Newton work out what this is, trust it, and finish the core action without help?

**Core action:** choose a policy, check a wallet, read the signed result. From the landing screen that takes four clicks: Start with a policy → Use this policy → pick a wallet → Run the check.

## Method

The real page ran in Chromium, served from the repo. `/api/evaluate` was replaced by a mock that follows the same rules as the live endpoint, so every result state could be reached on demand, including the failures. The five example wallets map to the real ones: A listed, B 1 hop, C 2 hops, D 3 hops, E clean. Desktop captures are 1440×900; phone captures are 390×844, full height. `assets/notes.json` holds each state's visible copy, buttons and scroll overflow.

| # | State | Desktop | Phone |
|---|---|---|---|
| 01 | Intro, why this exists | [01](assets/01-intro-why.png) | [01-m](assets/01-intro-why-m.png) |
| 02 | Intro, what the demo does | [02](assets/02-intro-demo.png) | |
| 03 | Intro, part 1 the check | [03](assets/03-intro-policy.png) | |
| 04 | Intro, part 2 enforcement | [04](assets/04-intro-enforcement.png) | |
| 05 | Choose the policy, default | [05](assets/05-policy-default.png) | [05-m](assets/05-policy-default-m.png) |
| 06 | Choose the policy, Policy D | [06](assets/06-policy-d.png) | |
| 07 | Pick a wallet | [07](assets/07-wallet.png) | [07-m](assets/07-wallet-m.png) |
| 08 | Malformed address typed | [08](assets/08-invalid-address.png) | |
| 09 | Checking | [09](assets/09-checking.png) | |
| 10 | Non-compliant, 3 hops, Policy C | [10](assets/10-result-3hop.png) | [10-m](assets/10-result-3hop-m.png) |
| 11 | Same, hovering a map dot | [11](assets/11-result-hover.png) | |
| 12 | Non-compliant, listed wallet | [12](assets/12-result-listed.png) | [12-m](assets/12-result-listed-m.png) |
| 13 | Compliant, clean wallet | [13](assets/13-result-clean.png) | |
| 14 | Compliant, link outside Policy A | [14](assets/14-result-outside.png) | |
| 15 | Compliant under Policy D, listed wallet | [15](assets/15-result-allowed.png) | [15-m](assets/15-result-allowed-m.png) |
| 16 | Screening failed | [16](assets/16-result-failed.png) | [16-m](assets/16-result-failed-m.png) |
| 17 | Not attested | [17](assets/17-result-unattested.png) | |
| 18 | Gateway timeout (504) | [18](assets/18-result-504.png) | |
| 19 | Policy with no contract | [19](assets/19-not-deployed.png) | |
| 20 | Shared link `?wallet=D&hops=2` | [20](assets/20-deep-link.png) | |

Every desktop state fits a 1440×900 screen without scrolling, and the result states also fit 1024×600. No state threw a page error. The only console error is the 504 the timeout state is made of.

## Verdict

The page now does its main job. Policy and enforcement read as two separate things, and every claim on a result can be checked: the path on Etherscan, the label on Arkham, the signature on the Newton Explorer. Policy D makes the split concrete: the same operators sign a bad rule's result just as faithfully as a good one's.

The audit found three groups of problems: on phones the result sat below the fold, the failure states ended without a way forward, and a couple of sentences claimed more than the page can show. All are fixed below. Nothing here blocks sharing the demo.

## Findings by dimension

**1. First impressions: healthy.** In five seconds the intro says who Lazarus is, why paying one is a risk, and offers one primary action ([01](assets/01-intro-why.png)). The map teaches the rings before you need them.

**2. Navigation: healthy.** The step bar lets you go back to the policy without losing the wallet. "Change" next to the policy and "New check" both land where you'd expect. A shared link opens on the right policy and wallet ([20](assets/20-deep-link.png)).

**3. Visual hierarchy**

- **F1 · P2 · Understanding · S · fixed.** With a path on screen, the scan steps under it ("Wallet clear, 1 hop clear…") repeated the same information with less detail. At 1440×900 both were visible, so the result had two answers to the same question ([10](assets/10-result-3hop.png), before the fix). `design/flow.css:344`.
- **F2 · P3 · Understanding · S · fixed.** A listed wallet's path is a single stop, but it was laid out as a column: a dot, then the address, then the labels on separate lines. It looked like an unfinished rail ([12](assets/12-result-listed.png), before the fix). It's now one line: dot, address, Lazarus, Arkham. `design/flow.css:346`.

**4. Component consistency: healthy.** One colour language throughout: green compliant, red non-compliant, yellow for anything let through despite a finding (outside the rule, or Policy D). Map, chip, path and trail all agree ([13](assets/13-result-clean.png), [14](assets/14-result-outside.png), [15](assets/15-result-allowed.png)).

**5. Loading, empty and error states**

- **F3 · P2 · Understanding · S · fixed.** A malformed address only greyed out the run button; nothing said why. A visitor pasting a truncated address had no clue what was wrong ([08](assets/08-invalid-address.png)). The field now explains when you leave it or press Enter. `js/console-view.js:169`.
- **F4 · P3 · Understanding · S · fixed.** "Not attested" printed its reason twice, once as the sentence and once as a monospace detail line ([17](assets/17-result-unattested.png)). `js/verdict.js:194`.
- **F5 · P2 · Conversion · S · fixed (on request).** The three failure states (screening failed, not attested, timeout) ended with only "New check", which sends you back to pick a wallet again. They now offer "Try again", which reruns the same wallet under the same policy ([16](assets/16-result-failed.png), [18](assets/18-result-504.png)). A policy with no contract gets no retry, since it would only fail again. Held back at first because it submits a new task to Newton; added once asked for. `js/verdict.js`.

**6. Trust signals**

- **F6 · P1 · Trust · S · fixed.** The intro said operators "sign the result as an onchain attestation". Nothing on the page can show that: the endpoint never receives a transaction hash (`api/evaluate.js:175` is always `null`), and the explorer link goes to a task, not a transaction. A visitor who checks would find no transaction. It now says "sign the result as an attestation anyone can check", which the explorer link proves. `js/data.js:191`.
- **Strength.** Every step of a path links to Etherscan, the Lazarus end links to its Arkham label, and the signature links to the Newton Explorer. Hovering the map and the path highlights the same step in both ([11](assets/11-result-hover.png)). Don't trade any of this away for brevity.
- **F7 · P3 · Trust · S · declined.** The page doesn't say how old the data is (list pulled 7 Sep 2026, map built 10 Sep 2026). A line was added to the policy step, then removed at the owner's request.

**7. Conversion paths: healthy.** Four clicks to a signed result, and a shared link skips straight to the wallet. The example wallets mean nobody needs an address of their own to try it.

**8. Mobile**

- **F8 · P1 · Conversion · S · fixed.** On a 390px phone the map comes first and the result starts about 450px down, so the answer needed a scroll. The page now scrolls the result into view when it lands, with the map's caption just above it for context ([10-m](assets/10-result-3hop-m.png)). Reordering the columns would go further, but the scroll covers the problem without a layout change.
- **F9 · P3 · Understanding · S · fixed.** On the phone policy step, the sticky "Use this policy" button covered part of Policy B on the first screen. It now follows the options instead of floating over them ([05-m](assets/05-policy-default-m.png)).
- **Healthy.** The path fits four addresses at 390px, and the tap targets on the map and the policy cards are at least 36px.

## Fixed during the audit

| Finding | Change | Verified by |
|---|---|---|
| F1 | Scan steps hide once a path is shown, at every size | [10](assets/10-result-3hop.png) re-captured |
| F2 | A listed wallet's path is one line | [12](assets/12-result-listed.png), [15](assets/15-result-allowed.png) re-captured |
| F3 | Malformed address explains itself on blur and on Enter | [08](assets/08-invalid-address.png) re-captured |
| F4 | "Not attested" no longer repeats its reason | [17](assets/17-result-unattested.png) re-captured |
| F6 | Intro no longer claims an onchain attestation | [02](assets/02-intro-demo.png) re-captured |
| F5 | Try again on the failure states | [16](assets/16-result-failed.png); clicking it reran the check |
| F8 | Phones scroll the result into view | [10-m](assets/10-result-3hop-m.png); result heading lands 121px from the top |
| F9 | Phone policy button no longer covers the list | [05-m](assets/05-policy-default-m.png) re-captured |
| QW5 | Task ID on the signed card links to the explorer | [10](assets/10-result-3hop.png) |
| Follow-up | The path in its own panel; Arkham as a source line under it; hovering the Lazarus stop lights the map's centre; the signed card is one sentence | [10](assets/10-result-3hop.png), [11](assets/11-result-hover.png), [12](assets/12-result-listed.png) |

After the fixes: every result state still fits 1024×600 and 1440×900 without scrolling, and the UI kit reports no missing fixtures or stories.

## Status after follow-up

Every finding above is fixed except F7, declined. The one structural option left is putting the result column first on phones; the scroll-into-view covers it for now.

## Re-running

```
node audit-capture.mjs                 # desktop set
W=390 H=844 node audit-capture.mjs     # phone set
NO_D=1 ONLY=19-not-deployed node audit-capture.mjs
```

`docs/design-audit/audit-capture.mjs` and its mock `harness.mjs` sit next to this file; run them from that folder with Playwright installed. Diff the new `assets/` against these, and check that nothing in the "Fixed" table comes back.
