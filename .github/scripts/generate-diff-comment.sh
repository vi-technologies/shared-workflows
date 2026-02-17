#!/usr/bin/env bash
# =============================================================================
# Generate CDK Diff Comment and Slack Blocks
# =============================================================================
# Takes diff JSON and context, calls the shared formatter, and outputs
# markdown and Slack blocks as GitHub Actions outputs.
#
# Environment variables:
#   DIFF_SINGLE - Single-account diff JSON (optional)
#   DIFF_MULTI  - Multi-account combined diff JSON (optional)
#   REPO        - Repository name
#   RUN_URL     - Workflow run URL
#   PR_URL      - Pull request URL
#   PR_NUM      - Pull request number
#   SCRIPT_PATH - Path to format-cdk-diff.js
#
# Outputs (via $GITHUB_OUTPUT):
#   comment      - Markdown comment body
#   slack_blocks - Slack Block Kit JSON
# =============================================================================
set -euo pipefail

DIFF_JSON="${DIFF_SINGLE:-$DIFF_MULTI}"
if [ -z "$DIFF_JSON" ]; then
  echo "comment=## 🔍 CDK Diff\n\n⚠️ No diff results" >> "$GITHUB_OUTPUT"
  echo 'slack_blocks=[]' >> "$GITHUB_OUTPUT"
  exit 0
fi

CONTEXT_JSON=$(jq -nc \
  --arg repo "$REPO" \
  --arg runUrl "$RUN_URL" \
  --arg prUrl "$PR_URL" \
  --arg prNum "$PR_NUM" \
  --argjson isDeployment false \
  '{repo: $repo, runUrl: $runUrl, prUrl: $prUrl, prNum: $prNum, isDeployment: $isDeployment}')

FORMATTED=$(node "$SCRIPT_PATH" "$DIFF_JSON" "$CONTEXT_JSON")

MARKDOWN=$(echo "$FORMATTED" | jq -r '.markdown')
SLACK_BLOCKS=$(echo "$FORMATTED" | jq -c '.slack_blocks')

echo "comment<<COMMENT_EOF" >> "$GITHUB_OUTPUT"
echo "$MARKDOWN" >> "$GITHUB_OUTPUT"
echo "COMMENT_EOF" >> "$GITHUB_OUTPUT"

echo "slack_blocks=$SLACK_BLOCKS" >> "$GITHUB_OUTPUT"
