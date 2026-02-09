#!/usr/bin/env bash
# =============================================================================
# Verify ECR Repository Exists
# =============================================================================
# Checks that the ECR repository exists before pushing.
#
# Environment variables:
#   IMAGE_NAME - ECR repository name
#   AWS_REGION - AWS region
# =============================================================================
set -euo pipefail

if ! aws ecr describe-repositories --repository-names "$IMAGE_NAME" --region "$AWS_REGION" 2>/dev/null; then
  echo "ERROR: ECR repository '$IMAGE_NAME' does not exist!"
  echo "Please create the repository before running this workflow."
  exit 1
fi
echo "✅ ECR repository exists: $IMAGE_NAME"
