#!/usr/bin/env bash
# Probe recent builds in both Vercel scopes with a clean wallet and an exposed
# one. The exposed wallet shows whether a build can see the chain at all: a
# build screening blind answers ALLOW for it too, with cps=0.
set -uo pipefail

CLEAN=0x00000000219ab540356cbb839cbe05303d7705fa
THREE=0x1fc2e37e99ae7ac11353f183d7bfbb8105148bdf
PER_SCOPE=${PER_SCOPE:-6}

summarise() {
  python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
except Exception:
    print("no json (protected, down, or not an API build)"); sys.exit()
a = d.get("attestation") or {}
print("%-5s %-15s cps=%-4s hops=%s" % (d.get("decision"), a.get("status"),
      d.get("counterparties_examined"), d.get("hop_count")))
'
}

probe_scope() {
  local project="$1" scope="$2"
  echo
  echo "################  $scope / $project  ################"
  npx vercel ls "$project" --scope "$scope" 2>&1 | sed -n '4,16p'
  npx vercel ls "$project" --scope "$scope" 2>/dev/null \
    | grep -oE 'https://[a-z0-9.-]+\.vercel\.app' \
    | awk '!seen[$0]++' | head -"$PER_SCOPE" > /tmp/probe-urls.txt
  if [ "$scope" = "k-93d6" ]; then
    echo "https://lazarus-identitiy-checker.vercel.app" >> /tmp/probe-urls.txt
  fi
  echo
  while read -r u; do
    c=$(npx vercel curl "$u/api/evaluate?address=$CLEAN&max_hops=3&min_usd=0" --scope "$scope" 2>/dev/null | summarise)
    t=$(npx vercel curl "$u/api/evaluate?address=$THREE&max_hops=3&min_usd=0" --scope "$scope" 2>/dev/null | summarise)
    printf '%s\n    clean wallet : %s\n    3-hop wallet : %s\n' "$u" "$c" "$t"
  done < /tmp/probe-urls.txt
}

probe_scope lazarus-exposure-demo k-93d6
probe_scope lazarus-screening newtonlabs
