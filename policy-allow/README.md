# Allow-all policy

Policy D on the page. Pure Rego, no oracle: `allow_all.allow` is always true.

It is here to make one thing visible. The three Lazarus policies and this one
are enforced by the same Newton Protocol operators and signed the same way.
Only the rule differs. A known Lazarus address comes back compliant under this
policy, with a real attestation, because that is what the rule says.

## Deploying

Same steps as `policy/`, from the repo root:

```bash
unset PINATA_JWT
export PRIVATE_KEY=<funded Sepolia key>
newton-cli --chain-id 11155111 policy deploy -p policy-allow
```

Then deploy one client bound to the new policy, with empty params, using the
same client script as the others. Record it in `policy/out/clients.sepolia.json`
under `allow`, set `NEWTON_POLICY_CLIENT_ALLOW` in Vercel to the client address,
and put the client address in `ALLOW_ALL_CLIENT` in `js/data.js`.

Before sharing, run a known Lazarus address against it. The result must be
Compliant with an attestation on the explorer. That is the whole point.
