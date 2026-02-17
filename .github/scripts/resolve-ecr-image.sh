#!/usr/bin/env bash
# =============================================================================
# Resolve ECR Image Name from Config
# =============================================================================
# Looks up the ECR image name from the services config JSON.
#
# Environment variables:
#   SERVICE          - Service name (e.g., "bronze")
#   TARGET_ENV       - Target environment (e.g., "staging", "production")
#   AWS_ACCOUNT_ID   - AWS account ID
#   AWS_REGION       - AWS region
#   SERVICES_CONFIG  - JSON config mapping services to ECR repo names
#
# Outputs (via $GITHUB_OUTPUT):
#   IMAGE_NAME    - ECR repository name
#   ECR_REGISTRY  - Full ECR registry URL
#   FULL_IMAGE    - Full image URI (registry/repo)
# =============================================================================
set -euo pipefail

# Normalize environment name for config lookup
if [ "$TARGET_ENV" = "prod" ]; then
  CONFIG_ENV="production"
else
  CONFIG_ENV="$TARGET_ENV"
fi

IMAGE_NAME=$(echo "$SERVICES_CONFIG" | jq -r ".[\"$SERVICE\"][\"$CONFIG_ENV\"] // empty")

if [ -z "$IMAGE_NAME" ]; then
  echo "ERROR: No image name configured for service '$SERVICE' in environment '$CONFIG_ENV'"
  echo "Available config: $SERVICES_CONFIG"
  exit 1
fi

ECR_REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
FULL_IMAGE="${ECR_REGISTRY}/${IMAGE_NAME}"

echo "IMAGE_NAME=$IMAGE_NAME" >> "$GITHUB_OUTPUT"
echo "ECR_REGISTRY=$ECR_REGISTRY" >> "$GITHUB_OUTPUT"
echo "FULL_IMAGE=$FULL_IMAGE" >> "$GITHUB_OUTPUT"

echo "Image name: $IMAGE_NAME"
echo "Full image: $FULL_IMAGE"
