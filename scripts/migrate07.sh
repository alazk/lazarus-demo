#!/usr/bin/env bash
# Run the 0.7 migration end to end: deploy the policy, then the clients.
# Prompts for the deployer key so it stays out of shell history.
# Usage: bash scripts/migrate07.sh [--yes]
set -euo pipefail

AUTO=0
[ "${1:-}" = "--yes" ] && AUTO=1

ask() {
  [ "$AUTO" = "1" ] && return 0
  printf '%s [y/N] ' "$1"
  read -r reply
  case "$reply" in [yY]*) return 0 ;; *) echo "stopping."; exit 1 ;; esac
}

if [ -z "${DEMO_PRIVATE_KEY:-}" ]; then
  printf 'Deployer private key (hidden): '
  read -rs DEMO_PRIVATE_KEY
  printf '\n'
  export DEMO_PRIVATE_KEY
fi
[ -n "${DEMO_PRIVATE_KEY:-}" ] || { echo "no key given."; exit 1; }

DEPLOYER=$(node -e '
import("viem/accounts").then(({ privateKeyToAccount }) => {
  const k = process.env.DEMO_PRIVATE_KEY;
  process.stdout.write(privateKeyToAccount(k.startsWith("0x") ? k : "0x" + k).address);
});')
echo "deployer: $DEPLOYER"
export NEWTON_OWNER="$DEPLOYER"

echo
echo "--- step 1 of 2: the policy (dry run) ---"
node scripts/deploy07.mjs
ask "Deploy the policy under $DEPLOYER?"

echo
echo "--- deploying the policy ---"
node scripts/deploy07.mjs --execute | tee /tmp/deploy07.out

POLICY=$(grep -oE 'policy deployed at 0x[0-9a-fA-F]{40}' /tmp/deploy07.out | tail -1 | grep -oE '0x[0-9a-fA-F]{40}' || true)
if [ -z "$POLICY" ]; then
  POLICY=$(grep -oE 'predicted policy address +0x[0-9a-fA-F]{40}' /tmp/deploy07.out | tail -1 | grep -oE '0x[0-9a-fA-F]{40}' || true)
fi
[ -n "$POLICY" ] || { echo "could not determine the policy address; stopping."; exit 1; }
echo
echo "policy: $POLICY"
export NEWTON_POLICY="$POLICY"

echo
echo "--- step 2 of 2: the clients (dry run) ---"
node scripts/deployclients07.mjs
ask "Deploy the clients against $POLICY?"

echo
echo "--- deploying the clients ---"
node scripts/deployclients07.mjs --execute

echo
echo "Done. The env vars to set are listed above."
echo "Record the policy address too: $POLICY"
