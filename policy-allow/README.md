# Allow-all policy

Policy D on the page. Pure Rego, no oracle: `allow_all.allow` is always true.

It is here to make one thing visible. The three Lazarus policies and this one
are enforced by the same Newton Protocol operators and signed the same way.
Only the rule differs. A known Lazarus address comes back compliant under this
policy, with a real attestation, because that is what the rule says.

## Deploying

One command, from the repo root. It prompts for the deployer key, deploys the
policy, deploys one client bound to it with empty params, proves by gateway
simulation that a known Lazarus address comes back ALLOW, then fills in
`ALLOW_ALL_CLIENT` in `js/data.js` and offers to set the Vercel variable.

```bash
bash scripts/deploy-allow.sh
```

Needs `newton-cli` 0.5.3 or later on PATH, and `NEWTON_API_KEY` in the
environment for the simulation step (without it the client still deploys, but
the proof is skipped).

The pieces, if you need them apart: `newton-cli --chain-id 11155111 policy
deploy -p policy-allow` for the policy, `scripts/deployclient-allow.mjs` for the
client (dry run by default, `--execute` to send), `NEWTON_POLICY_CLIENT_ALLOW`
for the API, `ALLOW_ALL_CLIENT` in `js/data.js` for the page.

Before sharing, run a known Lazarus address against Policy D on the live page.
The result must be Compliant with an attestation on the explorer. That is the
whole point.
