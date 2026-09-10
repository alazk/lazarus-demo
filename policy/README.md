# Lazarus Exposure Policy

The Newton half of the demo. The screening service answers what the graph says;
this decides what the answer means and produces the attestation.

```
wallet address
      ↓
policy.js (WASM oracle)  ──HTTP──>  /api/screen
      ↓                             traces the graph live
data.wasm
      ↓
policy.rego              ──uses──>  data.params.max_hops
      ↓
allow / deny  →  attestation on the Newton Explorer
```

## Where the Newton guide is wrong

Both of these cost hours, and neither is in the published documentation. If you
are integrating against Newton, read this section first.

**`wasm_args` is hex-encoded, not raw JSON.** The oracle receives
`0x7b22616464...`, not `{"address":"0x..."}`. `JSON.parse` on the raw argument
fails, and because the failure happens before any error handling it surfaces as
an unexplained WASM trap. `decodeArgs()` in `policy.js` handles it. The policy
guide mentions this in a single line under key facts, and the code example on
the same page ignores it.

**The HTTP import does not return a tagged result.** The guide shows:

```js
const result = httpFetch({ ... });
if (result.tag === "err") { ... }
const response = result.val;
```

Under jco as of this build, `httpFetch` returns the response object directly.
`result.tag` is `undefined`, so `result.val` is `undefined`, and reading
`.status` off it traps. `policy.js` accepts both shapes:

```js
const response = (result && result.tag !== undefined) ? result.val : result;
```

Symptom for both: a `wasm backtrace` with no message. When you see one, the
fastest route is a probe component that fetches and returns only the shape of
what came back, rather than reasoning about what it should be. `probe2.js`
alongside this file is that probe, and it is what found the second bug after
several wrong guesses.

## Two design decisions

**The endpoint is compiled in, not passed at call time.** `wasm_args` come from
the caller. An endpoint supplied there would let anyone point the oracle at a
server of their own that answers "clean" to everything. Hardcoding it fixes the
data source at deploy time and makes it part of what gets attested.

**The policy binds the screening to the intent.** The address to screen is also
caller-supplied, so `policy.rego` denies unless `data.wasm.wallet` matches
`input.to`. Without that rule a caller could screen a clean address while the
transaction touched a sanctioned one, and the attestation would look valid.

## max_hops

The parameter the case study turns on. The graph result does not change; the
rule applied to it does.

| max_hops | Blocks |
| --- | --- |
| 3 | any exposure the screening can find |
| 2 | direct, 1-hop and 2-hop; a 3-hop wallet passes |
| 1 | direct and 1-hop only |
| 0 | known Lazarus addresses themselves, nothing else |

Demonstrated on one wallet, `0x1fc2e37e…148bdf`, verified at 3 hops:

```bash
# max_hops 3  ->  DENIED
newton-cli policy simulate --wasm-file policy.wasm --rego-file policy.rego \
  --intent-json intent.example.json --entrypoint "lazarus_exposure.allow" \
  --policy-params-data policy_params.example.json --wasm-args wasm_args.json

# max_hops 2  ->  ALLOWED
echo '{ "max_hops": 2 }' > params_2.json
newton-cli policy simulate --wasm-file policy.wasm --rego-file policy.rego \
  --intent-json intent.example.json --entrypoint "lazarus_exposure.allow" \
  --policy-params-data params_2.json --wasm-args wasm_args.json
```

Same wallet, same oracle output, opposite decisions.

## Failing closed

`allow` defaults to false and is granted only when the deny set is empty. An
unreachable screening service, an unparseable response, or a `SCREENING_FAILED`
answer all produce `screened: false`, which denies with "screening did not
complete" rather than passing. A wallet that was not screened is not a clean one.

## Build

```bash
cd policy
npx -y @bytecodealliance/jco componentize -w newton-provider.wit \
  -o policy.wasm policy.js -d stdio random clocks http fetch-event
```

`npx` rather than a global install: `npm install -g` fails on some setups with
an internal "Exit handler never called" error, and npx sidesteps it.

Set `ENDPOINT` in `policy.js` to the deployed screening URL first. Operators run
the WASM in a sandbox that blocks localhost, so it has to be the public
deployment, and it has to answer anonymously. Vercel's deployment protection
returns a 302 to an SSO page, which the oracle receives as HTML where it expects
JSON. Check with an anonymous request before building:

```bash
curl -s -o /dev/null -w "HTTP %{http_code}\n" "$ENDPOINT?address=0x0004a76e39d33edfeac7fc3c8d3994f54428a0be"
```

Anything other than 200 will fail inside the oracle with a less obvious error.

## Simulate

Oracle alone. Note the hex encoding:

```bash
newton-cli policy-data simulate --wasm-file policy.wasm \
  --input-json "$(python3 -c "print('0x' + '{\"address\":\"0x1fc2e37e99ae7ac11353f183d7bfbb8105148bdf\"}'.encode().hex())")"
```

Policy and oracle together. `--wasm-args` takes a path to a JSON file, not a
string, and without it the oracle receives `{}` and correctly denies on the
fail-closed rule, which looks like a policy failure but is not one.

`failed to decode calldata: Failed to parse function signature` appears on every
run against an intent with empty calldata. It is cosmetic for a native transfer
and does not affect evaluation.

## Deploying

```bash
unset PINATA_JWT
export PRIVATE_KEY=<funded Sepolia key>
newton-cli --chain-id 11155111 policy deploy -p policy
```

**Requires newton-cli 0.5.3 or later.** Releases up to 0.5.1 were cut from
`main`, which uploads to IPFS. Staging and testnet run `unified/main`, which
uploads to S3 exclusively. Deploying with an older CLI appears to succeed, pins
to IPFS, registers the CIDs on-chain, and then fails at
`newt_storeEncryptedSecrets` because the operator backend never received the
objects. Pinning the CIDs does not fix it; the backend is not an IPFS pinset.

`newtup -b unified/main` is not a workaround unless you have access to the
private `newt-foundation/newton-prover-avs` repo.

## Wiring the result back

`api/screen.js` returns the field the page reads for the attestation link. Once
tasks are being submitted, set `explorer_url` on the response and the button in
the verdict panel activates on its own.

## Known gap

`input.to` is right for a native transfer. For an ERC-20 transfer, `to` is the
token contract and the recipient sits in the calldata, so the binding rule would
need to decode `data` instead. The demo screens a wallet directly, which keeps
this out of scope, but it has to be handled before this policy guards real token
transfers.
