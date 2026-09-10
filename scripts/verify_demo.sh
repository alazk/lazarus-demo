#!/usr/bin/env bash
# Check every demo wallet screens at the distance its label claims.
BASE="https://lazarus-exposure-demo-git-main-k-93d6.vercel.app"
fail=0

check() {
  local label="$1" addr="$2" want="$3"
  local out hop status
  out=$(curl -s --max-time 45 "$BASE/api/screen?address=$addr")
  hop=$(printf '%s' "$out" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('hop_count'))" 2>/dev/null)
  status=$(printf '%s' "$out" | python3 -c "import json,sys; print(json.load(sys.stdin).get('status'))" 2>/dev/null)
  if [ "$hop" = "$want" ]; then
    printf "  PASS  %-24s hop=%-4s %s\n" "$label" "$hop" "$status"
  else
    printf "  FAIL  %-24s hop=%-4s want=%s  %s\n" "$label" "$hop" "$want" "$status"
    fail=1
  fi
}

echo "Screening each demo wallet against its label:"
python3 - <<'PY' > /tmp/wallets.txt
import json
for w in json.load(open("data/demo_wallets.json"))["wallets"]:
    want = {"direct":"0","one":"1","two":"2","three":"3","clean":"None"}[w["key"]]
    if w["address"]:
        print(w["key"], w["label"], w["address"], want, sep="|")
PY
while IFS='|' read -r key label addr want; do
  check "$label" "$addr" "$want"
done < /tmp/wallets.txt

echo
echo "Malformed address:"
curl -s "$BASE/api/screen?address=0xnope" | head -c 120; echo

echo
echo "Rules endpoint:"
curl -s "$BASE/api/rules" | python3 -c "import json,sys; d=json.load(sys.stdin); print('  ready:', d['ready'], '| seeds:', d['dataset']['seeds'], '| coverage:', d['dataset']['coverage'])"

exit $fail
