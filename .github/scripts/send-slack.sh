#!/usr/bin/env bash
# =============================================================================
# Send Slack Notification
# =============================================================================
# Sends Slack blocks via webhook.
#
# Environment variables:
#   SLACK_WEBHOOK_URL - Slack webhook URL
#   SLACK_BLOCKS      - JSON Slack Block Kit blocks
# =============================================================================
set -euo pipefail

PAYLOAD=$(jq -nc --argjson blocks "$SLACK_BLOCKS" '{blocks: $blocks}')
curl -X POST -H 'Content-type: application/json' --data "$PAYLOAD" "$SLACK_WEBHOOK_URL"
