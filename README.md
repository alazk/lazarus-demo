# Lazarus Wallet Screening Demo

Screens an Ethereum address for direct or indirect exposure to the Lazarus
Group within three hops, then passes the result to a Newton policy that
allows or blocks. The operators' decision is attested on Sepolia.

Live at [lazarus-screening.vercel.app](https://lazarus-screening.vercel.app).
Every push to `main` deploys production.

## Architecture

Two layers, deliberately separated.

**Identity is pulled once and committed.** The Lazarus seed set and the
service-entity address lists are resolved through Arkham's API and frozen as
small JSON files. Attribution barely changes, so it is worth freezing, and
nothing else in the project calls that API. `scripts/pull_arkham.py` is the
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

A screening reads the wallet's history in three Etherscan calls (normal,
internal and token transfers). A path that looks like exposure then costs up
to 12 more `eth_getCode` lookups, to confirm every address between the wallet
and Lazarus is a wallet. A listed address matches before any chain read.

Each check is screened twice: once by this service for the page, and again by
each Newton operator through the WASM oracle, which calls `/api/screen`.

## Why the traversal is cut

An unbounded three-hop rule flags everyone. Lazarus addresses touch exchange
hot wallets and bridges at the first hop, and from a Binance hot wallet the
second hop is millions of addresses. The result would be correct and useless.

The rules below bound it, all set in `data/config.json` and all stated openly
in the case study. They make the point the demo exists to make: exposure is a
policy parameter, and the chain alone does not settle it.

- **Service nodes are terminal.** Exchanges, bridges, mixers and no-KYC swaps
  (52,659 Arkham labels) can be the end of a path and never the middle of one.
  Sharing a counterparty with Lazarus because you both used Binance is not
  exposure.
- **Contracts are terminal.** Every address between the wallet and the Lazarus
  address must be an ordinary wallet. Routers, WETH, aggregators, marketplaces
  and bridges are skipped from a built-in list; any other intermediary is
  checked with `eth_getCode` at query time. Without this, anyone who had
  swapped on Uniswap screened as two hops from Lazarus.
- **Value floor.** Transfers below $300 are ignored, on both sides of every
  path. Without it anyone can taint any wallet with a dust transfer, which is
  a live attack. If the build used a higher floor than the live check, a
  verdict would depend on which half of the path an edge happened to fall in.
- **Tokens are recognised by contract address.** Only known mainnet contracts
  count: USDT, USDC, DAI, BUSD, TUSD, USDP, FRAX, WETH, stETH, wstETH, rETH,
  cbETH, WBTC and tBTC, plus ETH itself. A token that calls itself "USDT" from
  any other contract is ignored, which keeps spam and look-alike tokens out.
- **Exposure is the weakest link.** A wallet that received $500,000 from an
  intermediary that received $30 from Lazarus is exposed to $30.

Every edge is valued in dollars at the close on the day it happened, from
`data/prices.json`. Transfers after the file's last day use the last close;
gaps use the nearest earlier close within a week.

Fanout is a compute budget and makes no claim about exposure. Building the
halo costs three Etherscan calls per node, so `max_fanout_build` keeps each
node's 12 highest-value counterparties. At screening time the same check is a
dictionary lookup, so `max_fanout_query` keeps the wallet's top 200.

## Endpoints

The split matters. The Newton oracle calls `/api/screen` during evaluation,
so that endpoint must not submit tasks: if it did, the operators running the
oracle would call back into it and submit another, without end.

| Endpoint | Called by | Does |
| --- | --- | --- |
| `/api/screen` | the Newton oracle | traces the graph, returns the result, nothing else |
| `/api/evaluate` | the page | screens, submits the task, returns the attested decision |
| `/api/rules` | anyone | describes the rules and the radii that have a deployed client |

`/api/evaluate` takes `address`, and optionally `max_hops` and `min_usd`. With
neither set it uses the default rule (3 hops, no floor). A combination with no
deployed client returns 400 `UNSUPPORTED_RULE` before any Etherscan call. It is
never run under a different client.

Newton is the authority on the decision; this service only supplies the input.
The page shows a pass only for an attested ALLOW. Where the attested result and
the local screening disagree, the response says so instead of quietly
preferring one, since that disagreement would be a defect worth seeing.

Fail-closed cases, each shown distinctly on the page:

| Case | Response | Page shows |
| --- | --- | --- |
| Etherscan unreachable, or its key missing | `SCREENING_FAILED`, DENY, attestation `SKIPPED` (no task sent) | Screening failed |
| Operators' decision not obtained | `ATTESTATION_FAILED`, DENY | Not attested |
| Newton key or client unset | screening as normal, attestation `NOT_CONFIGURED` | Not attested |
| Any response that is not JSON, or not a 200 | treated as `SCREENING_FAILED` | Screening failed |

A failure to screen is not evidence of exposure, and it is not a pass.

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
  "exposure_usd": 55270,
  "first_edge_usd": 55270,
  "edges": [{ "from": "0x...", "to": "0x...", "tx": "0x...", "ts": 0, "direction": "out" }],
  "paths_through_contracts_skipped": 0,
  "contract_check_incomplete": false,
  "counterparties_examined": 14,
  "submitted_wallet_high_degree": false,
  "history_truncated": false,
  "status": "NON_COMPLIANT",
  "decision": "DENY",
  "reason": "2-hop Lazarus exposure",
  "nodes": [{ "address": "0x...", "role": "wallet", "label": null }],
  "evaluated_at": "...",
  "dataset": { "seeds": 3597, "max_depth": 3, "min_edge_usd": 300, "...": "..." }
}
```

Screening reports the fewest-hop path, and among equals the most valuable one.

- `paths_through_contracts_skipped` counts shorter or richer paths dropped
  because an intermediary is a contract or a service.
- `contract_check_incomplete` means the 12-lookup budget ran out. A lookup that
  errors keeps the path, so an outage blocks rather than clears.
- `history_truncated` means the wallet has more than 2,000 transfers of one
  kind and only the most recent 2,000 were read.

## The built graph

Built 10 September 2026 from the Arkham `lazarus-group` entity.

| | |
| --- | --- |
| Seeds (Ethereum) | 3,597 |
| Distance 1 | 3,644 |
| Distance 2 | 3,837 |
| Terminal nodes | 154 |
| Coverage | 3,644 of 3,644 first-hop nodes expanded |

Every first-hop node was expanded, so no third hop is missing for lack of
budget.

The map was built before the contract and token-address rules. It still holds
paths through contracts and links built on look-alike tokens. The query drops
the contract paths, but a map link built on a fake-token transfer can still
count at the second or third hop. Of eight two-hop entries sampled on 30
September, six did not verify. A rebuild with the current rules is due.

What the rules do in practice: `vitalik.eth` used to screen as exposed through
Uniswap. Those paths are now skipped, and it shows a $373 link at three hops
through ordinary wallets. That is what a three-hop rule means on a graph this
dense, and it is the clearest argument for the cuts.

## Run order

```bash
export ARKHAM_API_KEY=...
export ETHERSCAN_API_KEY=...

python3 scripts/pull_arkham.py probe lazarus-group
python3 scripts/pull_arkham.py seeds
python3 scripts/pull_arkham.py services

python3 scripts/build_prices.py
python3 scripts/build_halo.py
python3 scripts/build_halo.py --yes
python3 scripts/pick_demo_wallets.py
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

## Demo wallets

| Example | Address | Screens as |
| --- | --- | --- |
| A | `0x0004a76e39d33edfeac7fc3c8d3994f54428a0be` | listed |
| B | `0x0a3b4bde9116a950a036204bf0d7a16d285f8995` | 1 hop, $90,473 |
| C | `0x001139ead8b38f353c2151af48df7d3bf2363c9d` | 2 hops, $55,270 |
| D | `0x1fc2e37e99ae7ac11353f183d7bfbb8105148bdf` | 3 hops, $5,857,588 |
| E | `0x00000000219ab540356cbb839cbe05303d7705fa` | clean (Beacon Deposit Contract) |

`scripts/pick_demo_wallets.py` chooses one wallet per band from the built
graph. It verifies each candidate by running the same check the server runs,
since an address three hops out along one path is often two hops along
another, and screening reports the shortest. Picking by construction produced
wallets labelled 3-hop that screened at 2.

Two scripts check the examples against the real chain with the live rules:

```bash
node scripts/audit-screen.mjs      # screens each example locally
node scripts/verify-examples.mjs   # re-screens every wallet on each path, hop by hop
```

C was replaced on 30 September. The old C's only qualifying transfer was a
$233m look-alike stablecoin, which the token-address rule now ignores.

## Newton deployment

Sepolia, protocol 0.7. One policy, four clients, one per supported rule.

| | Address |
| --- | --- |
| Policy | `0xCC3957c06472f9E599ED2eebA754D5854F23321b` |
| Client, 1 hop | `0x8a8F5389B1ab8Dee99829A9bB2E7b235809EaeC4` |
| Client, 2 hops | `0x426B922f21bdb1201Cac1470d224B6F9b92630fe` |
| Client, 3 hops (default) | `0xAbe39aa25ffB4B13C15166D10a27E9132f207BE8` |
| Client, 3 hops, $1m floor | `0x4f15C595E8a6332A56A2101b61239FB2cE9163F6` |

Tasks are listed on the [Newton Explorer](https://explorer.newton.xyz/testnet).
Policy details and the gaps in Newton's guide are in `policy/README.md`.

## Known limits

These need a new policy deployment to fix.

- **The $1m floor checks one path.** The floor is compared against the
  fewest-hop path's weakest link. A wallet with a $400 one-hop link and a $50m
  two-hop path is allowed by the $1m client.
- **The oracle reads from the `main` branch alias**
  (`…-git-main-…vercel.app/api/screen`). Every push to `main` changes the
  attested data source without changing the policy's `wasmCid`.
- **The Rego policy fails open on missing fields** (`input.to`, `max_hops`,
  `min_exposure_usd`). This API always sends them, so it is not reachable here.

And these need data work:

- **The precomputed map needs a rebuild** with the current rules (see above).
- **Recent history only.** Busy wallets are read to their most recent 2,000
  transfers of each kind; the response says when.

## Note on scope

Arkham has no Sepolia data and Lazarus has no testnet activity, so the two
halves sit on different networks. The intelligence and the trace are Ethereum
mainnet. The policy evaluation and its attestation are Sepolia, the same split
the sanctions case study used with the OFAC list. The copy should not imply the
trace happened on testnet.

The use case is outgoing payments: the check answers whether a wallet you are
about to pay is linked to Lazarus. Transfers in either direction count as a
link.

The demo is illustrative and is not a regulatory or legal determination.

## Environment

| Variable | Needed for | Notes |
| --- | --- | --- |
| `ETHERSCAN_API_KEY` | screening | required; without it every check fails closed |
| `NEWTON_API_KEY` | attestation | gateway key; its wallet must own the policy clients |
| `NEWTON_POLICY_CLIENT` | attestation | default client (3 hops) |
| `NEWTON_POLICY_CLIENT_H1V0` | 1-hop rule | optional; rule unavailable without it |
| `NEWTON_POLICY_CLIENT_H2V0` | 2-hop rule | optional |
| `NEWTON_POLICY_CLIENT_H3V1M` | $1m floor rule | optional |
| `NEWTON_POLICY` | reference | policy address |
| `NEWTON_EXPLORER_BASE` | task links | optional; defaults to `https://explorer.newton.xyz/testnet/task` |
| `ARKHAM_API_KEY` | rebuilding seeds | not needed to run the demo |

No private key is needed. The gateway authenticates with the API key and the
operators evaluate the policy, so nothing here signs a transaction.

Set them on Vercel from a shell that already has the value, which avoids the
CLI's interactive prompt:

```bash
printf '%s' "$ETHERSCAN_API_KEY" | npx vercel env add ETHERSCAN_API_KEY production
npx vercel --prod
```

Environment variables only apply to deployments created after they are set, so
the redeploy is not optional.

## What is public

The repo root is served statically. `vercel.json` redirects the data files
(seeds, services, halo, prices, config), README, AUDIT.md, package files,
`scripts/`, `policy/` and `case-study/` to a 404, so Arkham's attribution and
labels are not downloadable. `data/demo_wallets.json` stays public because the
page needs it.
