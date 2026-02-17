#!/usr/bin/env bash
# =============================================================================
# Resolve Pricing Role ARN
# =============================================================================
# Determines which AWS role ARN to use for the Pricing API.
#
# Environment variables:
#   SINGLE_ROLE_ARN - Single-account role ARN (optional)
#   MULTI_ROLE_ARNS - JSON map of account IDs to role ARNs (optional)
#
# Outputs (via $GITHUB_OUTPUT):
#   arn - Resolved role ARN
# =============================================================================
set -euo pipefail

if [ -n "$SINGLE_ROLE_ARN" ]; then
  echo "arn=$SINGLE_ROLE_ARN" >> "$GITHUB_OUTPUT"
else
  # Multi-account: use the first role ARN for Pricing API (it's global)
  ARN=$(echo "$MULTI_ROLE_ARNS" | jq -r 'to_entries[0].value // empty')
  echo "arn=$ARN" >> "$GITHUB_OUTPUT"
fi
