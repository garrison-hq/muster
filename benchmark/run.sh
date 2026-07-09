#!/usr/bin/env bash
# Run muster's shipped behavioral suite against every model in models.tsv.
# Only the endpoint/model + API key change between runs (SC-005).
# Exit 1 from muster is EXPECTED (the xfail control case); exit 2 = exec error.
set -u
cd "$(dirname "$0")/.."
SUITE="behave/voice-frontdesk.yaml"
OUT="benchmark/results"
mkdir -p "$OUT"
while IFS=$'\t' read -r label base model keyenv; do
  [[ -z "$label" || "$label" == \#* ]] && continue
  key="${!keyenv:-}"
  if [[ -z "$key" ]]; then echo "SKIP $label — \$$keyenv not set"; continue; fi
  echo -n "running $label ($model) ... "
  MUSTER_API_KEY="$key" node dist/cli/index.js behave run "$SUITE" \
    --base-url "$base" --model "$model" --json \
    > "$OUT/$label.json" 2> "$OUT/$label.log"
  rc=$?
  if [[ $rc -le 1 ]]; then echo "ok (exit $rc)"; else echo "EXEC ERROR (exit $rc) — see $OUT/$label.log"; fi
  sleep 2   # be gentle with free-tier rate limits
done < benchmark/models.tsv
echo "done. aggregate with: python3 benchmark/aggregate.py $OUT"
