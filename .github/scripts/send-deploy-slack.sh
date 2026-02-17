#!/usr/bin/env bash
# =============================================================================
# Format and Send CDK Deploy Slack Notification
# =============================================================================
# Reads the diff result, formats it using the shared formatter, and sends
# the Slack notification.
#
# Environment variables:
#   SLACK_WEBHOOK_URL - Slack webhook URL (optional, skip if empty)
#   JOB_STATUS        - Job status (success/failure)
#   DRY_RUN           - "true" if dry-run mode
#   REPO              - Repository name
#   ACTOR             - GitHub actor
#   RUN_URL           - Workflow run URL
#   SCRIPT_PATH       - Path to format-cdk-diff.js
# =============================================================================
set -euo pipefail

# Skip if no webhook URL provided
if [ -z "$SLACK_WEBHOOK_URL" ]; then
  echo "No Slack webhook URL provided, skipping notification"
  exit 0
fi

# Read diff result
if [ -f diff_result.json ]; then
  DIFF_JSON=$(cat diff_result.json)
else
  DIFF_JSON='{"success":true,"stacks":[]}'
fi

# Build context
CONTEXT_JSON=$(jq -nc \
  --arg repo "$REPO" \
  --arg runUrl "$RUN_URL" \
  --arg actor "$ACTOR" \
  --arg jobStatus "$JOB_STATUS" \
  --argjson isDeployment true \
  '{repo: $repo, runUrl: $runUrl, actor: $actor, jobStatus: $jobStatus, isDeployment: $isDeployment}')

# Format using shared formatter and extract Slack blocks
FORMATTED=$(node "$SCRIPT_PATH" "$DIFF_JSON" "$CONTEXT_JSON")
SLACK_BLOCKS=$(echo "$FORMATTED" | jq -c '.slack_blocks')

# Send
PAYLOAD=$(jq -nc --argjson blocks "$SLACK_BLOCKS" '{blocks: $blocks}')
curl -X POST -H 'Content-type: application/json' --data "$PAYLOAD" "$SLACK_WEBHOOK_URL"
