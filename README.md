# Lazarus Wallet Screening Demo

Screens an Ethereum address for direct or indirect exposure to the Lazarus
Group within three hops, then passes the result to a Newton policy that
allows or blocks.

## Architecture

Two layers, deliberately separated.

**Identity is pulled once and committed.** The Lazarus seed set and the
service-entity address lists are resolved through a vendor attribution API and
frozen as small JSON files. Attribution barely changes, so it is worth freezing,
and nothing else in the project calls that API. `scripts/pull_arkham.py` is the
only file that does, and it is not needed to run the demo.

**The graph comes from Etherscan, live.** Transaction edges are public data
with no window and nothing proprietary to redistribute, so the trace runs at
request time rather than from a snapshot. The page can say the path is real.

A live three-hop expansion would be hundreds of API calls per request, so the
neighbourhood around the seed set is precomputed. Distance is symmetric, which
means a screening only needs the submitted wallet's own counterparties:

| Counterparty of the submitted wallet | Distance |
| --- | --- |
| is a seed | 1 hop |
| sits at halo distance 1 | 2 hops |
| sits at halo distance 2 | 3 hops |

Three Etherscan calls per screening.

## Why the traversal is cut

An unbounded three-hop rule flags everyone. Lazarus addresses touch exchange
hot wallets and bridges at the first hop, and from a Binance hot wallet the
second hop is millions of addresses. The result would be correct and useless.

Four rules bound it, all set in `data/config.json` and all worth stating
openly in the case study, since they make the point the demo exists to make:
exposure is a policy parameter, not a fact of the chain.

- **Service nodes are terminal.** Exchanges, bridges, mixers and no-KYC swaps
  can be the end of a path but never the middle of one. Sharing a counterparty
  with Lazarus because you both used Binance is not exposure.
- **Contracts and high-degree nodes are terminal**, for the same reason, and it
  catches hubs Arkham has not labelled.
- **Value floors.** Edges below the floor are ignored. Without this, anyone can
  taint any wallet with a dust transfer, which is a live attack, not a theory.
  The floors are identical on both sides of every path. If the build used a
  higher threshold than the live check, a verdict would depend on which half of
  the path an edge happened to fall in.
- **Unlisted tokens are ignored entirely.** Spam tokens are the main dust vector.

Fanout is different in kind from the rules above: it is a compute budget, not a
claim about exposure. Building the halo costs three Etherscan calls per node,
so `max_fanout_build` keeps each node's highest-value counterparties and the
output records its coverage. At screening time the same check is a dictionary
lookup costing nothing, so `max_fanout_query` is set far higher. Capping it
there would discard detections in exchange for no saving.

## Run order

```bash
export ARKHAM_API_KEY=...
export ETHERSCAN_API_KEY=...

python3 scripts/pull_arkham.py probe lazarus-group
python3 scripts/pull_arkham.py seeds
python3 scripts/pull_arkham.py services

python3 scripts/build_halo.py
python3 scripts/build_halo.py --yes
```

The Arkham host is `api.arkm.com`; the other domain redirects there and the
redirect can drop the auth header. Cloudflare fronts it and rejects Python's
default user agent with error 1010, which is why both scripts send their own.

The halo build runs in two phases. Phase one expands every seed, then stops
and reports how many distinct level-one nodes exist and what phase two would
cost. That number cannot be predicted in advance because it depends on how far
the seeds' counterparties overlap, and with a few thousand seeds the difference
between heavy and light overlap is hours of crawling. Read the report, then
rerun with `--yes`.

Phase two expands level-one nodes highest transfer value first and stops at
`max_api_calls`, below Etherscan's daily limit. If the budget runs out early
the halo is still coherent: the unexpanded nodes simply contribute no third
hop, and `coverage` in `halo.json` records exactly how many were reached.

`pull_arkham.py` caches every response permanently under `.arkham_cache/`, so
the window is only ever spent once. `build_halo.py` checkpoints to
`.halo_state.json` and is safe to interrupt and restart.

Read the probe output before running `seeds`. The address extraction walks the
entity response generically, and it is better to confirm the shape than to
discover a chain mismatch after the pull.

If the supplied Lazarus list is not the Arkham entity, drop it into
`data/seeds_manual.json` as `[{"address": "0x...", "source": "..."}]`. Manual
entries take precedence and keep their own provenance.

## Endpoints

Two, and the split matters. The Newton oracle calls `/api/screen` during
evaluation, so that endpoint must not submit tasks: if it did, the operators
running the oracle would call back into it and submit another, without end.

| Endpoint | Called by | Does |
| --- | --- | --- |
| `/api/screen` | the Newton oracle | traces the graph, returns the result, nothing else |
| `/api/evaluate` | the page | screens, submits the task, returns the attested decision |

`/api/evaluate` works before the policy exists. With `NEWTON_API_KEY`,
`NEWTON_POLICY_CLIENT` or `DEMO_PRIVATE_KEY` unset it screens as normal and
marks the result `NOT_CONFIGURED`, so the app is usable at every stage of the
build rather than only at the end.

Newton is the authority on the decision; this service only supplies the input.
Where the attested result and the local screening disagree, the response says
so instead of quietly preferring one, since that disagreement would be a defect
worth seeing.

An attestation that cannot be obtained is not a pass. A failed submission
returns `ATTESTATION_FAILED` with a deny, matching how the policy behaves when
it cannot reach a conclusion.

## Screening

`api/screen.js` is a Vercel function. `GET /api/screen?address=0x...` returns:

```json
{
  "wallet": "0x...",
  "direct_match": false,
  "exposure": true,
  "hop_count": 2,
  "matched_wallet": "0x...",
  "path": ["0x...", "0x...", "0x..."],
  "status": "NON_COMPLIANT",
  "decision": "DENY",
  "reason": "2-hop Lazarus exposure"
}
```

It fails closed. If Etherscan is unreachable the response is
`SCREENING_FAILED` with `decision: DENY`, which the UI must render distinctly
from `NON_COMPLIANT`. A failure to screen is not evidence of exposure.

## The built graph

| | |
| --- | --- |
| Seeds (Ethereum) | 3,597 |
| Distance 1 | 3,643 |
| Distance 2 | 3,954 |
| Terminal nodes | 119 |
| Coverage | 3,643 of 3,643 first-hop nodes expanded |
| Etherscan calls | 21,837 of an 80,000 budget |

Coverage is complete: nothing was truncated, so results hold under the stated
rules without a caveat about partial expansion.

Worth knowing what that means in practice. Both `vitalik.eth` and
`0xab5801a7…` screen as exposed within three hops. That is not a defect in the
data, it is what a three-hop rule means on a graph this dense, and it is the
clearest argument for why the traversal cuts exist.

## Demo wallets

`scripts/pick_demo_wallets.py` chooses one wallet per band from the built graph.
It verifies each candidate by running the same check the server runs, rather
than reasoning about what a candidate should be. That distinction matters: an
address three hops out along one path is often two hops along another, and
screening reports the shortest. Picking by construction produced wallets
labelled 3-hop that screened at 2.

## Still to build

- Sepolia deployment of the policy, blocked on newton-cli 0.5.3 (see
  `policy/README.md`).
- Task submission wired to a deployed policy client.

## Note on scope

Arkham has no Sepolia data and Lazarus has no testnet activity, so the two
halves sit on different networks. The intelligence and the trace are Ethereum
mainnet. The policy evaluation and its attestation are Sepolia, the same split
the sanctions case study used with the OFAC list. The copy should not imply the
trace happened on testnet.

The demo is illustrative and is not a regulatory or legal determination.

## Environment

| Variable | Needed for | Notes |
| --- | --- | --- |
| `ETHERSCAN_API_KEY` | screening | required; without it every trace silently returns empty |
| `NEWTON_API_KEY` | attestation | gateway key |
| `NEWTON_POLICY_CLIENT` | attestation | from `policy deploy` |
| `DEMO_PRIVATE_KEY` | attestation | funded Sepolia key, throwaway only |
| `SEPOLIA_RPC_URL` | attestation | optional |
| `NEWTON_EXPLORER_BASE` | attestation | optional; confirm the real path on a first task |
| `ARKHAM_API_KEY` | rebuilding seeds | not needed to run the demo |

With the three attestation variables unset the app screens as normal and marks
the result `NOT_CONFIGURED`, so it is usable at every stage of the build.

Set them on Vercel from a shell that already has the value, which avoids the
CLI's interactive prompt:

```bash
printf '%s' "$ETHERSCAN_API_KEY" | npx vercel env add ETHERSCAN_API_KEY production
npx vercel --prod
```

Environment variables only apply to deployments created after they are set, so
the redeploy is not optional.

## Two things that will waste your time

**Deployment protection.** Vercel gates deployments by default, returning a 302
to an SSO page. A signed-in browser passes and everything looks fine, while
anonymous callers, which is what Newton operators are, get HTML instead of JSON.
Test with `curl`, never with a browser, and note that disabling protection only
affects deployments made afterwards.

**A missing Etherscan key is silent.** `call()` returns an empty list on a
rejected key, so a build with a placeholder key runs for an hour and maps
nothing. If the first progress line of a halo build shows zero level-one hits,
stop: the key is wrong.
