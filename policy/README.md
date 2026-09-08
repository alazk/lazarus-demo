# Lazarus Exposure Policy

The Newton half of the demo. The screening service answers what the graph says;
this decides what the answer means and produces the attestation.

## Shape

```
wallet address
      ↓
policy.js (WASM oracle)  ──HTTP──>  /api/screen
      ↓                             traces the graph live
data.wasm
      ↓
policy.rego              ──uses──>  data.params.max_hops
      ↓
allow / deny  →  BLS attestation on the Newton Explorer
```

## Two decisions worth knowing about

**The endpoint is compiled in, not passed at call time.** `wasm_args` come from
the caller. An endpoint supplied there would let anyone point the oracle at a
server of their own that answers "clean" to everything. Hardcoding it fixes the
data source at deploy time and makes it part of what gets attested.

**The policy binds the screening to the intent.** The address to screen is
caller-supplied, so `policy.rego` denies unless `data.wasm.wallet` matches
`input.to`. Without that rule a caller could screen a clean address while the
transaction touched a sanctioned one, and the attestation would look valid.

## max_hops

`max_hops` is the parameter the case study turns on. The graph result does not
change; the rule applied to it does.

| max_hops | Blocks |
| --- | --- |
| 3 | any exposure the screening can find |
| 2 | direct, 1-hop and 2-hop; a 3-hop wallet passes |
| 1 | direct and 1-hop only |
| 0 | known Lazarus addresses themselves, nothing else |

## Failing closed

`allow` defaults to false and is granted only when the deny set is empty. An
unreachable screening service, an unparseable response, or a `SCREENING_FAILED`
answer all produce `screened: false`, which denies with "screening did not
complete" rather than passing. A wallet that was not screened is not a clean one.

## Build

```bash
npm install -g @bytecodealliance/jco @bytecodealliance/componentize-js

# Set ENDPOINT in policy.js to the deployed screening URL first.
# Operators run WASM in a sandbox that blocks private and loopback addresses,
# so localhost will not work; it has to be the public deployment.

jco componentize -w newton-provider.wit -o policy.wasm policy.js \
  -d stdio random clocks http fetch-event
```

## Test before deploying

Oracle on its own:

```bash
newton-cli policy-data simulate \
  --wasm-file policy.wasm \
  --input-json '{"address":"0x098b716b8aaf21512996dc57eb0615e2383e2f96"}'
```

Policy and oracle together:

```bash
newton-cli policy simulate \
  --wasm-file policy.wasm \
  --rego-file policy.rego \
  --intent-json intent.example.json \
  --entrypoint "lazarus_exposure.allow" \
  --policy-params-data policy_params.example.json
```

The entrypoint has to match the package and rule names, so
`lazarus_exposure.allow`.

To see why something was denied rather than just that it was, query the deny
set instead:

```bash
newton-cli policy simulate ... --entrypoint "lazarus_exposure.deny"
```

## Deploying

`newton-cli` publishes the policy files to IPFS and registers them on-chain.
See https://docs.newton.xyz/developers/guides/deploying-with-cli. Deployment
returns the `policyId`, `policyAddress` and `policyDataAddress` that the
frontend needs to submit tasks.

## Wiring the result back to the UI

`api/screen.js` already returns the field the page reads for the attestation
link. Once tasks are being submitted, set `explorer_url` on the response to the
Newton Explorer URL for the task id and the button in the verdict panel
activates on its own.

## Known gap

`input.to` is the right field for a native transfer. For an ERC-20 transfer,
`to` is the token contract and the actual recipient sits in the calldata, so
the binding rule would need to decode `data` instead. The demo screens a wallet
directly, which keeps this out of scope, but it has to be handled before this
policy guards real token transfers.
