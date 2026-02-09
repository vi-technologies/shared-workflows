#!/usr/bin/env bash
# =============================================================================
# Combine Multi-Account CDK Diff Results
# =============================================================================
# Merges diff result artifacts from multiple accounts into a single result.
#
# Environment variables:
#   DIFFS_DIR - Directory containing downloaded diff artifacts
#
# Outputs (via $GITHUB_OUTPUT):
#   result - Combined JSON diff result
# =============================================================================
set -euo pipefail

ALL_STACKS='[]'
for f in "$DIFFS_DIR"/*/result.json; do
  if [ -f "$f" ]; then
    STACKS=$(cat "$f" | tail -1 | jq -c '.stacks // []')
    ALL_STACKS=$(echo "$ALL_STACKS" | jq --argjson new "$STACKS" '. + $new')
  fi
done
RESULT='{"success":true,"stacks":'"$ALL_STACKS"'}'
echo "result<<EOF" >> "$GITHUB_OUTPUT"
echo "$RESULT" >> "$GITHUB_OUTPUT"
echo "EOF" >> "$GITHUB_OUTPUT"
