#!/usr/bin/env bash
# Set every variable the demo needs on the linked Vercel project, then deploy.
set -uo pipefail

CLIENT_H3V0=0xAbe39aa25ffB4B13C15166D10a27E9132f207BE8
CLIENT_H1V0=0x8a8F5389B1ab8Dee99829A9bB2E7b235809EaeC4
CLIENT_H2V0=0x426B922f21bdb1201Cac1470d224B6F9b92630fe
CLIENT_H3V1M=0x4f15C595E8a6332A56A2101b61239FB2cE9163F6
POLICY=0xcd23ab50D9a3867B9B75E72f7087B420d62BF65f

echo "=== linked project ==="
npx vercel project ls 2>/dev/null | head -5
cat .vercel/project.json 2>/dev/null || cat .vercel/repo.json 2>/dev/null

printf '\nEtherscan API key (hidden): '
read -rs ETHERSCAN
printf '\nNewton API key (hidden): '
read -rs NEWTON
printf '\n\n'

if [ -z "$ETHERSCAN" ] || [ -z "$NEWTON" ]; then
  echo "both keys are required; nothing was changed."
  exit 1
fi

set_var() {
  printf '  %-30s ' "$1"
  npx vercel env rm "$1" production --yes >/dev/null 2>&1 || true
  if printf '%s' "$2" | npx vercel env add "$1" production >/dev/null 2>&1; then
    echo "set"
  else
    echo "FAILED"
    return 1
  fi
}

echo "=== setting variables ==="
failed=0
set_var ETHERSCAN_API_KEY "$ETHERSCAN" || failed=1
set_var NEWTON_API_KEY "$NEWTON" || failed=1
set_var NEWTON_POLICY_CLIENT "$CLIENT_H3V0" || failed=1
set_var NEWTON_POLICY_CLIENT_H1V0 "$CLIENT_H1V0" || failed=1
set_var NEWTON_POLICY_CLIENT_H2V0 "$CLIENT_H2V0" || failed=1
set_var NEWTON_POLICY_CLIENT_H3V1M "$CLIENT_H3V1M" || failed=1
set_var NEWTON_POLICY "$POLICY" || failed=1

if [ "$failed" = "1" ]; then
  echo; echo "At least one variable did not set. Not deploying."
  exit 1
fi

echo; echo "=== deploying ==="
npx vercel --prod

echo; echo "=== verifying ==="
sleep 6
curl -s "https://lazarus-screening.vercel.app/api/evaluate?address=0x1fc2e37e99ae7ac11353f183d7bfbb8105148bdf" \
  | python3 -c '
import json, sys
d = json.load(sys.stdin)
print("status       ", d.get("status"))
print("decision     ", d.get("decision"))
print("exposure     ", d.get("exposure"))
print("hop_count    ", d.get("hop_count"))
print("counterparties", d.get("counterparties_examined"))
a = d.get("attestation") or {}
print("attestation  ", a.get("status"))
for k in ("task_id", "detail"):
    if a.get(k):
        print(f"{k:13}", str(a[k])[:300])
'
