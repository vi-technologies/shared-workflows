#!/usr/bin/env bash
# =============================================================================
# Resolve Docker Environment and AWS Account
# =============================================================================
# Determines the target environment and corresponding AWS account ID.
#
# Environment variables:
#   INPUT_ENV            - Explicit environment input (optional)
#   GITHUB_EVENT_NAME    - GitHub event type
#   GITHUB_REF           - Git ref
#   AWS_ACCOUNT_STAGING  - AWS account ID for staging
#   AWS_ACCOUNT_PROD     - AWS account ID for production
#
# Outputs (via $GITHUB_OUTPUT):
#   TARGET_ENV      - Resolved environment name
#   AWS_ACCOUNT_ID  - Corresponding AWS account ID
# =============================================================================
set -euo pipefail

# Determine environment
if [ -n "$INPUT_ENV" ]; then
  TARGET_ENV="$INPUT_ENV"
elif [ "$GITHUB_EVENT_NAME" = "workflow_dispatch" ]; then
  TARGET_ENV="staging"
elif [ "$GITHUB_REF" = "refs/heads/main" ]; then
  TARGET_ENV="production"
else
  TARGET_ENV="staging"
fi

echo "TARGET_ENV=$TARGET_ENV" >> "$GITHUB_OUTPUT"

# Select AWS account
if [ "$TARGET_ENV" = "production" ] || [ "$TARGET_ENV" = "prod" ]; then
  echo "AWS_ACCOUNT_ID=$AWS_ACCOUNT_PROD" >> "$GITHUB_OUTPUT"
else
  echo "AWS_ACCOUNT_ID=$AWS_ACCOUNT_STAGING" >> "$GITHUB_OUTPUT"
fi

echo "Environment: $TARGET_ENV"
