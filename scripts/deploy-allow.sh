#!/usr/bin/env bash
# Deploy Policy D end to end: the allow-all policy, then its one client, then
# wire the client into the page. Prompts for the deployer key so it never
# touches shell history or this chat. Usage: bash scripts/deploy-allow.sh
set -euo pipefail
set +H 2>/dev/null || true

OWNER=0x8b4bA8708239757e84aD26a503500Bc5fC1c1a48
FACTORY=${NEWTON_POLICY_FACTORY:-0x8dd5984f8f626a2fd1c61872217d1f8269a831da}
RPC=${SEPOLIA_RPC_URL:-https://ethereum-sepolia-rpc.publicnode.com}

ask() {
  printf '%s [y/N] ' "$1"
  read -r reply
  case "$reply" in [yY]*) return 0 ;; *) echo "stopping."; exit 1 ;; esac
}

command -v newton-cli >/dev/null || { echo "newton-cli is not on PATH. Install 0.5.3 or later first."; exit 1; }
[ -f policy-allow/policy.rego ] || { echo "run this from the repo root; policy-allow/policy.rego not found."; exit 1; }
[ -f policy/out/LazarusPolicyClient.json ] || node scripts/compile-client.mjs

if [ -z "${DEMO_PRIVATE_KEY:-}" ]; then
  printf 'Deployer private key (hidden): '
  read -rs DEMO_PRIVATE_KEY
  printf '\n'
fi
[ -n "${DEMO_PRIVATE_KEY:-}" ] || { echo "no key given."; exit 1; }
export DEMO_PRIVATE_KEY
export PRIVATE_KEY="$DEMO_PRIVATE_KEY"
unset PINATA_JWT

# The CLI uploads the policy files with the Newton API key, and the last step
# uses the same key to simulate the client. Same key as the Vercel project.
if [ -z "${NEWTON_API_KEY:-}" ]; then
  printf 'Newton API key (hidden): '
  read -rs NEWTON_API_KEY
  printf '\n'
fi
[ -n "${NEWTON_API_KEY:-}" ] || { echo "no API key given."; exit 1; }
export NEWTON_API_KEY
export API_KEY="$NEWTON_API_KEY"

DEPLOYER=$(node -e '
import("viem/accounts").then(({ privateKeyToAccount }) => {
  const k = process.env.DEMO_PRIVATE_KEY;
  process.stdout.write(privateKeyToAccount(k.startsWith("0x") ? k : "0x" + k).address);
});')
echo "deployer: $DEPLOYER"
if [ "$(printf '%s' "$DEPLOYER" | tr 'A-F' 'a-f')" != "$(printf '%s' "$OWNER" | tr 'A-F' 'a-f')" ]; then
  echo "That key is not the client owner $OWNER. The gateway would answer 401. Stopping."
  exit 1
fi

# The policies this wallet owns before, so the new one can be found by
# difference rather than by parsing the CLI's output.
list_policies() {
  node -e '
import("viem").then(async ({ createPublicClient, http, getAddress }) => {
  const { sepolia } = await import("viem/chains");
  const pc = createPublicClient({ chain: sepolia, transport: http(process.env.RPC) });
  const abi = [{ type:"function", name:"getAllPoliciesByOwner", inputs:[{type:"address"}], outputs:[{type:"address[]"}], stateMutability:"view" }];
  const got = await pc.readContract({ address: process.env.FACTORY, abi, functionName: "getAllPoliciesByOwner", args: [process.env.OWNER] });
  process.stdout.write(got.map(getAddress).join("\n"));
});'
}
export RPC FACTORY OWNER
if [ -n "${NEWTON_POLICY:-}" ]; then
  # Reuse a policy that is already deployed, so a rerun never deploys a second copy.
  NEW="$NEWTON_POLICY"
  echo
  echo "--- step 1 of 3: skipped, reusing the policy at $NEW ---"
else
  BEFORE=$(list_policies)

  echo
  echo "--- step 1 of 3: deploy the allow-all policy ---"
  echo "This uploads policy-allow/ and sends one transaction from $DEPLOYER."
  ask "Go ahead?"
  export RPC_URL="$RPC"
  RPC_URL="$RPC" newton-cli --chain-id 11155111 policy deploy -p policy-allow | tee /tmp/deploy-allow.out

  AFTER=$(list_policies)
  NEW=$(comm -13 <(printf '%s\n' "$BEFORE" | sort) <(printf '%s\n' "$AFTER" | sort) || true)
  if [ -z "$NEW" ]; then
    # Fall back to the CLI's output, then to asking.
    NEW=$(grep -oiE 'policy.{0,40}0x[0-9a-fA-F]{40}' /tmp/deploy-allow.out | grep -oE '0x[0-9a-fA-F]{40}' | tail -1 || true)
  fi
  if [ -z "$NEW" ]; then
    printf 'Could not find the new policy address. Paste it: '
    read -r NEW
  fi
  case "$(printf '%s\n' "$NEW" | wc -l | tr -d ' ')" in 1) ;; *) echo "More than one new policy appeared:"; echo "$NEW"; printf 'Which one is the allow-all policy? '; read -r NEW ;; esac
  echo
  echo "policy: $NEW"
fi
# Lower case is always a valid address; mixed case has to match the checksum exactly.
NEW=$(printf '%s' "$NEW" | tr -d '[:space:]' | tr 'A-F' 'a-f')
export NEWTON_POLICY="$NEW"

echo
echo "--- step 2 of 3: the client (dry run, checks the policy is allow_all.allow) ---"
node scripts/deployclient-allow.mjs
ask "Deploy the client against $NEW?"
echo
node scripts/deployclient-allow.mjs --execute | tee /tmp/deployclient-allow.out

CLIENT=$(grep -oE 'NEWTON_POLICY_CLIENT_ALLOW=0x[0-9a-fA-F]{40}' /tmp/deployclient-allow.out | tail -1 | cut -d= -f2 || true)
[ -n "$CLIENT" ] || { echo "could not read the client address from the output; stopping before wiring."; exit 1; }

echo
echo "--- step 3 of 3: wire it in ---"
# The page: the policy picker links Policy D to this contract.
if grep -q 'const ALLOW_ALL_CLIENT = ""' js/data.js; then
  sed -i '' "s/const ALLOW_ALL_CLIENT = \"\"/const ALLOW_ALL_CLIENT = \"$CLIENT\"/" js/data.js
  echo "js/data.js: ALLOW_ALL_CLIENT set to $CLIENT"
else
  echo "js/data.js: ALLOW_ALL_CLIENT already set; check it is $CLIENT"
fi

if npx vercel whoami >/dev/null 2>&1; then
  ask "Set NEWTON_POLICY_CLIENT_ALLOW on Vercel production and redeploy?"
  npx vercel env rm NEWTON_POLICY_CLIENT_ALLOW production --yes >/dev/null 2>&1 || true
  printf '%s' "$CLIENT" | npx vercel env add NEWTON_POLICY_CLIENT_ALLOW production
  npx vercel --prod
else
  echo "Not logged in to Vercel here. Set this in the project settings, then redeploy:"
  echo "  NEWTON_POLICY_CLIENT_ALLOW=$CLIENT"
fi

echo
echo "Done. Commit js/data.js and policy/out/clients.sepolia.json, then run wallet A under Policy D."
echo "It must come back Compliant with an attestation. That is the proof."
