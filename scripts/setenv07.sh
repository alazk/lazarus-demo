#!/usr/bin/env bash
# Point Vercel production at the 0.7 policy and clients, then deploy.
# Safe to re-run: every variable is removed before being added.
set -uo pipefail

POLICY=0xcd23ab50D9a3867B9B75E72f7087B420d62BF65f
H1V0=0x8a8F5389B1ab8Dee99829A9bB2E7b235809EaeC4
H2V0=0x426B922f21bdb1201Cac1470d224B6F9b92630fe
H3V0=0xAbe39aa25ffB4B13C15166D10a27E9132f207BE8
H3V1M=0x4f15C595E8a6332A56A2101b61239FB2cE9163F6

echo "=== checking auth ==="
npx vercel whoami || { echo "run: npx vercel login"; exit 1; }

# Six variables for rules the app never reads. Removing them keeps Vercel and
# api/evaluate.js in agreement about which rules exist.
echo
echo "=== removing stale client variables ==="
for v in NEWTON_POLICY_CLIENT_100K NEWTON_POLICY_CLIENT_1M \
         NEWTON_POLICY_CLIENT_H1V100K NEWTON_POLICY_CLIENT_H1V1M \
         NEWTON_POLICY_CLIENT_H2V1M NEWTON_POLICY_CLIENT_H3V100K; do
  printf '  %s ... ' "$v"
  if npx vercel env rm "$v" production --yes >/dev/null 2>&1; then
    echo "removed"
  else
    echo "not present"
  fi
done

set_var() {
  local name="$1" value="$2"
  printf '  %s = %s ... ' "$name" "$value"
  npx vercel env rm "$name" production --yes >/dev/null 2>&1 || true
  if printf '%s' "$value" | npx vercel env add "$name" production >/dev/null 2>&1; then
    echo "set"
  else
    echo "FAILED"
    return 1
  fi
}

echo
echo "=== pointing at the new clients ==="
failed=0
set_var NEWTON_POLICY_CLIENT_H1V0 "$H1V0" || failed=1
set_var NEWTON_POLICY_CLIENT_H2V0 "$H2V0" || failed=1
set_var NEWTON_POLICY_CLIENT "$H3V0" || failed=1
set_var NEWTON_POLICY_CLIENT_H3V1M "$H3V1M" || failed=1
set_var NEWTON_POLICY "$POLICY" || failed=1

if [ "$failed" = "1" ]; then
  echo
  echo "At least one variable did not set. Not deploying."
  exit 1
fi

echo
echo "=== what production now has ==="
npx vercel env ls production 2>/dev/null | grep -i newton || true

echo
echo "=== deploying ==="
npx vercel --prod

echo
echo "=== checking the live endpoint ==="
sleep 5
curl -s "https://lazarus-identitiy-checker.vercel.app/api/evaluate?address=0x1fc2e37e99ae7ac11353f183d7bfbb8105148bdf" \
  | python3 -c '
import json, sys
d = json.load(sys.stdin)
print("status     ", d.get("status"))
print("decision   ", d.get("decision"))
a = d.get("attestation") or {}
print("attestation", a.get("status"))
if a.get("task_id"):
    print("task_id    ", a["task_id"])
if a.get("detail"):
    print("detail     ", a["detail"][:400])
if d.get("explorer_url"):
    print("explorer   ", d["explorer_url"])
'
