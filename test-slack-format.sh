#!/bin/bash
# Test Slack formatting locally
# Usage: SLACK_WEBHOOK_URL=https://hooks.slack.com/... ./test-slack-format.sh

if [ -z "$SLACK_WEBHOOK_URL" ]; then
  echo "Error: SLACK_WEBHOOK_URL environment variable is required"
  echo "Usage: SLACK_WEBHOOK_URL=\$SLACK_DEVOPS_WEBHOOK_URL ./test-slack-format.sh"
  exit 1
fi

# Sample CDK diff data for testing
PAYLOAD=$(cat <<'EOF'
{
  "blocks": [
    {
      "type": "header",
      "text": {
        "type": "plain_text",
        "text": "🔍 CDK Diff Preview (PR)",
        "emoji": true
      }
    },
    {
      "type": "context",
      "elements": [
        {
          "type": "mrkdwn",
          "text": "📁 *iac-aws-org* • 👤 amitaig • <https://github.com/vi-technologies/iac-aws-org/pull/199|PR #199>"
        }
      ]
    },
    {
      "type": "divider"
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "📊 *28 changes:*  `+18`  `~10`  `-0`"
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*📦 TestBuckets* _(staging)_\n```\n+ S3::Bucket                slack-notification-test-bucket\n+ S3::BucketPolicy          slack-notification-test-bucket/Policy\n~ S3::Bucket                vi-engage-partners-events-test\n    └─ Tags: +SlackNotificationTest```"
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*📦 AthenaResultsDataVaultViBucket* _(data-vault)_\n```\n+ S3::Bucket                slack-notification-test-bucket\n+ S3::BucketPolicy          slack-notification-test-bucket/Policy\n~ S3::Bucket                athena-results-data-vault-vi\n    └─ Tags: +ParserTest, +SlackNotificationTest```"
      }
    },
    {
      "type": "context",
      "elements": [
        {
          "type": "mrkdwn",
          "text": "🔗 <https://github.com/vi-technologies/iac-aws-org/actions/runs/123|View workflow run>"
        }
      ]
    }
  ]
}
EOF
)

echo "Sending test message to Slack..."
curl -s -X POST -H 'Content-type: application/json' --data "$PAYLOAD" "$SLACK_WEBHOOK_URL"
echo ""
echo "Message sent! Check your Slack channel."
