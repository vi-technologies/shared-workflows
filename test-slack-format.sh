#!/bin/bash
# Test Slack message formatting locally
#
# Usage:
#   ./test-slack-format.sh [format]     # Preview JSON (paste into Block Kit Builder)
#   ./test-slack-format.sh [format] send  # Send to Slack (requires SLACK_WEBHOOK_URL)
#
# Formats: v1, v2, v3
#
# To get webhook URL from GitHub:
#   gh secret list -R vi-technologies/iac-aws-org  # Shows available secrets
#   # (Note: GitHub doesn't allow reading secret values directly)
#
# Test visually at: https://app.slack.com/block-kit-builder

set -e

FORMAT="${1:-v2}"
ACTION="${2:-preview}"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

generate_v1() {
  cat <<'EOF'
{
  "blocks": [
    {
      "type": "header",
      "text": { "type": "plain_text", "text": "🔍 CDK Diff Preview (PR)", "emoji": true }
    },
    {
      "type": "section",
      "fields": [
        { "type": "mrkdwn", "text": "*Repository:*\n`iac-aws-org`" },
        { "type": "mrkdwn", "text": "*Author:*\namitaig" }
      ]
    },
    {
      "type": "section",
      "text": { "type": "mrkdwn", "text": "*PR:* <https://github.com/vi-technologies/iac-aws-org/pull/199|#199 TEST: Slack format>" }
    },
    { "type": "divider" },
    {
      "type": "section",
      "text": { "type": "mrkdwn", "text": "📊 *28 changes:* 🟢 18 add | 🟡 10 update | 🔴 0 destroy\n\n📦 *Stack TestBuckets*\n🟢 S3::Bucket slack-notification-test-bucket\n🟡 S3::Bucket vi-engage-partners-events-test\n   └── Tags: +SlackNotificationTest" }
    },
    {
      "type": "context",
      "elements": [{ "type": "mrkdwn", "text": "🔗 <https://github.com|View workflow>" }]
    }
  ]
}
EOF
}

generate_v2() {
  cat <<'EOF'
{
  "blocks": [
    {
      "type": "header",
      "text": { "type": "plain_text", "text": "🔍 CDK Diff Preview", "emoji": true }
    },
    {
      "type": "context",
      "elements": [{ "type": "mrkdwn", "text": "📁 *iac-aws-org* • 👤 amitaig • <https://github.com/vi-technologies/iac-aws-org/pull/199|PR #199>" }]
    },
    { "type": "divider" },
    {
      "type": "section",
      "text": { "type": "mrkdwn", "text": "📊 *28 changes:*  `+18 adds`  `~10 updates`  `-0 deletes`" }
    },
    {
      "type": "section",
      "text": { "type": "mrkdwn", "text": "*📦 TestBuckets* _(staging)_\n```\n+ S3::Bucket       slack-notification-test-bucket\n+ S3::BucketPolicy slack-notification-test-bucket/Policy\n~ S3::Bucket       vi-engage-partners-events-test\n  └─ Tags: +SlackNotificationTest\n```" }
    },
    {
      "type": "section",
      "text": { "type": "mrkdwn", "text": "*📦 AthenaResultsDataVaultViBucket* _(data-vault)_\n```\n+ S3::Bucket       slack-notification-test-bucket\n~ S3::Bucket       athena-results-data-vault-vi\n  └─ Tags: +ParserTest\n```" }
    },
    {
      "type": "context",
      "elements": [{ "type": "mrkdwn", "text": "🔗 <https://github.com|View workflow run>" }]
    }
  ]
}
EOF
}

generate_v3() {
  cat <<'EOF'
{
  "attachments": [
    {
      "color": "#36a64f",
      "blocks": [
        {
          "type": "section",
          "text": { "type": "mrkdwn", "text": "*🔍 CDK Diff Preview*\n<https://github.com/vi-technologies/iac-aws-org/pull/199|iac-aws-org #199> by amitaig" }
        },
        {
          "type": "section",
          "fields": [
            { "type": "mrkdwn", "text": "*Adds*\n`18`" },
            { "type": "mrkdwn", "text": "*Updates*\n`10`" },
            { "type": "mrkdwn", "text": "*Deletes*\n`0`" },
            { "type": "mrkdwn", "text": "*Stacks*\n`8`" }
          ]
        },
        { "type": "divider" },
        {
          "type": "section", 
          "text": { "type": "mrkdwn", "text": "```\n📦 TestBuckets (staging)\n  + S3::Bucket slack-notification-test-bucket\n  ~ S3::Bucket vi-engage-partners-events-test\n      └─ Tags: +SlackNotificationTest\n\n📦 AthenaResultsDataVaultViBucket (data-vault)\n  + S3::Bucket slack-notification-test-bucket\n  ~ S3::Bucket athena-results-data-vault-vi\n```" }
        },
        {
          "type": "context",
          "elements": [{ "type": "mrkdwn", "text": "<https://github.com|View workflow>" }]
        }
      ]
    }
  ]
}
EOF
}

# Generate payload based on format
case "$FORMAT" in
  v1) PAYLOAD=$(generate_v1) ;;
  v2) PAYLOAD=$(generate_v2) ;;
  v3) PAYLOAD=$(generate_v3) ;;
  *)
    echo -e "${RED}Unknown format: $FORMAT${NC}"
    echo "Available formats: v1, v2, v3"
    exit 1
    ;;
esac

if [ "$ACTION" == "send" ]; then
  if [ -z "$SLACK_WEBHOOK_URL" ]; then
    echo -e "${RED}Error: SLACK_WEBHOOK_URL environment variable is required${NC}"
    echo ""
    echo "Set it with:"
    echo "  export SLACK_WEBHOOK_URL='https://hooks.slack.com/services/...'"
    echo ""
    echo "Or run in preview mode (no webhook needed):"
    echo "  ./test-slack-format.sh $FORMAT"
    exit 1
  fi
  
  echo -e "${BLUE}Sending format $FORMAT to Slack...${NC}"
  RESPONSE=$(curl -s -w "\n%{http_code}" -X POST -H 'Content-type: application/json' --data "$PAYLOAD" "$SLACK_WEBHOOK_URL")
  HTTP_CODE=$(echo "$RESPONSE" | tail -1)
  BODY=$(echo "$RESPONSE" | head -n -1)
  
  if [ "$HTTP_CODE" == "200" ]; then
    echo -e "${GREEN}✅ Message sent successfully!${NC}"
  else
    echo -e "${RED}❌ Failed to send (HTTP $HTTP_CODE): $BODY${NC}"
    exit 1
  fi
else
  # Preview mode - output JSON
  echo -e "${YELLOW}═══════════════════════════════════════════════════════════════${NC}"
  echo -e "${YELLOW}  Format: $FORMAT - Copy this JSON to Block Kit Builder${NC}"
  echo -e "${YELLOW}  https://app.slack.com/block-kit-builder${NC}"
  echo -e "${YELLOW}═══════════════════════════════════════════════════════════════${NC}"
  echo ""
  echo "$PAYLOAD" | jq .
  echo ""
  echo -e "${YELLOW}═══════════════════════════════════════════════════════════════${NC}"
  echo -e "${GREEN}To send to Slack:${NC}"
  echo "  export SLACK_WEBHOOK_URL='https://hooks.slack.com/services/...'"
  echo "  ./test-slack-format.sh $FORMAT send"
  echo -e "${YELLOW}═══════════════════════════════════════════════════════════════${NC}"
fi
