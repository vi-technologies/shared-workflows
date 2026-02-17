#!/usr/bin/env bash
# =============================================================================
# Estimate CDK Cost Impact (wrapper)
# =============================================================================
# Calls the estimate-cost.js script and outputs the markdown as a
# GitHub Actions output.
#
# Environment variables:
#   DIFF_JSON         - CDK diff JSON
#   PRICING_REGION    - AWS region for pricing
#   SCRIPT_PATH       - Path to estimate-cost.js
#   RESOURCE_MAP_PATH - Path to resource-map.json
#
# Outputs (via $GITHUB_OUTPUT):
#   cost_comment - Markdown cost estimate
# =============================================================================
set -euo pipefail

RESULT=$(node "$SCRIPT_PATH" "$DIFF_JSON" "$RESOURCE_MAP_PATH" "$PRICING_REGION")
COST_MD=$(echo "$RESULT" | jq -r '.markdown // empty')

echo "cost_comment<<COST_EOF" >> "$GITHUB_OUTPUT"
echo "$COST_MD" >> "$GITHUB_OUTPUT"
echo "COST_EOF" >> "$GITHUB_OUTPUT"
