#!/usr/bin/env bash
# =============================================================================
# Build CDK Diff Matrix
# =============================================================================
# Determines single vs multi-account mode and builds a JSON matrix
# for parallel GitHub Actions jobs.
#
# Environment variables:
#   ROLE_ARNS          - JSON map of account IDs to role ARNs
#   STACKS_PER_ACCOUNT - JSON map of account IDs to stack lists
#
# Outputs (via $GITHUB_OUTPUT):
#   is_multi - "true" or "false"
#   matrix   - JSON matrix for GitHub Actions strategy
# =============================================================================
set -euo pipefail

if [ -n "$ROLE_ARNS" ] && [ -n "$STACKS_PER_ACCOUNT" ]; then
  echo "is_multi=true" >> "$GITHUB_OUTPUT"
  MATRIX=$(echo "$ROLE_ARNS" | jq -c --argjson stacks "$STACKS_PER_ACCOUNT" '
    to_entries | map({
      account: .key,
      role: .value,
      stacks: ($stacks[.key] // "")
    }) | {include: .}
  ')
  echo "matrix=$MATRIX" >> "$GITHUB_OUTPUT"
else
  echo "is_multi=false" >> "$GITHUB_OUTPUT"
  echo 'matrix={"include":[]}' >> "$GITHUB_OUTPUT"
fi
