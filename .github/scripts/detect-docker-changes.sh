#!/usr/bin/env bash
# =============================================================================
# Detect Changed Docker Service Folders
# =============================================================================
# Determines which microservice Docker images need to be rebuilt based on
# changed files, shared paths, or explicit build-all flag.
#
# Environment variables:
#   SERVICES_FOLDER  - Top-level folder containing service subfolders
#   SERVICES_CONFIG  - JSON config mapping services to ECR repo names
#   BUILD_ALL        - "true" to build all services
#   SHARED_PATHS     - Space-separated paths that trigger all rebuilds
#   GITHUB_EVENT_NAME, GITHUB_SHA, etc. - Standard GitHub Actions context
#   PR_BASE_SHA      - PR base SHA (for pull_request events)
#   PR_HEAD_SHA      - PR head SHA (for pull_request events)
#   PUSH_BEFORE_SHA  - Push before SHA (for push events)
#   PUSH_SHA         - Push SHA (for push events)
#
# Outputs (via $GITHUB_OUTPUT):
#   services       - Space-separated list of services to build
#   services_json  - JSON array for matrix strategy
#   has_changes    - "true" or "false"
#   changed_files  - List of changed files
# =============================================================================
set -euo pipefail

# Determine diff range based on event type
if [ "$GITHUB_EVENT_NAME" = "pull_request" ]; then
  DIFF_RANGE="${PR_BASE_SHA}...${PR_HEAD_SHA}"
elif [ "$GITHUB_EVENT_NAME" = "push" ]; then
  DIFF_RANGE="${PUSH_BEFORE_SHA}...${PUSH_SHA}"
else
  # workflow_dispatch or other - compare to main
  git fetch origin main || true
  DIFF_RANGE="origin/main...HEAD"
fi

echo "Using diff range: $DIFF_RANGE"

# Get list of configured services from services-config
CONFIGURED_SERVICES=$(echo "$SERVICES_CONFIG" | jq -r 'keys[]')
echo "Configured services: $CONFIGURED_SERVICES"

# Find all service folders that have a non-empty Dockerfile AND are in config
ALL_SERVICES=""
for SERVICE_NAME in $CONFIGURED_SERVICES; do
  dir="${SERVICES_FOLDER}/${SERVICE_NAME}/"
  if [ -d "$dir" ] && [ -f "${dir}Dockerfile" ] && [ -s "${dir}Dockerfile" ]; then
    ALL_SERVICES="$ALL_SERVICES $SERVICE_NAME"
  fi
done
ALL_SERVICES=$(echo "$ALL_SERVICES" | xargs)
echo "All available services: $ALL_SERVICES"

# If build-all is true, build everything
if [ "$BUILD_ALL" = "true" ]; then
  echo "Build all requested - building all services"
  SERVICES="$ALL_SERVICES"
  CHANGED_FILES="(build-all requested)"
else
  # Check if any shared paths changed (triggers all services)
  SHARED_CHANGED=""
  if [ -n "$SHARED_PATHS" ]; then
    for shared_path in $SHARED_PATHS; do
      SHARED_FILES=$(git diff --name-only "$DIFF_RANGE" -- "$shared_path" 2>/dev/null || true)
      if [ -n "$SHARED_FILES" ]; then
        SHARED_CHANGED="$SHARED_CHANGED $SHARED_FILES"
      fi
    done
    SHARED_CHANGED=$(echo "$SHARED_CHANGED" | xargs)
  fi

  if [ -n "$SHARED_CHANGED" ]; then
    echo "Shared paths changed - rebuilding all services"
    echo "Changed shared files: $SHARED_CHANGED"
    SERVICES="$ALL_SERVICES"
    CHANGED_FILES="$SHARED_CHANGED"
  else
    # Get changed files in the services folder
    CHANGED_FILES=$(git diff --name-only "$DIFF_RANGE" -- "${SERVICES_FOLDER}/**" 2>/dev/null || true)

    echo "Changed files:"
    echo "$CHANGED_FILES"

    # Extract unique service names from changed files (only if in config)
    SERVICES=""
    for file in $CHANGED_FILES; do
      SERVICE_NAME=$(echo "$file" | sed -n "s|^${SERVICES_FOLDER}/\([^/]*\)/.*|\1|p")
      if [ -n "$SERVICE_NAME" ] && \
         echo "$SERVICES_CONFIG" | jq -e ".[\"$SERVICE_NAME\"]" > /dev/null 2>&1 && \
         [ -f "${SERVICES_FOLDER}/${SERVICE_NAME}/Dockerfile" ] && \
         [ -s "${SERVICES_FOLDER}/${SERVICE_NAME}/Dockerfile" ]; then
        SERVICES="$SERVICES $SERVICE_NAME"
      fi
    done
    SERVICES=$(echo "$SERVICES" | tr ' ' '\n' | sort -u | tr '\n' ' ' | xargs || true)
  fi
fi

echo "Services to build: $SERVICES"

# Set outputs
echo "services=$SERVICES" >> "$GITHUB_OUTPUT"

if [ -n "$SERVICES" ]; then
  SERVICES_JSON=$(echo "$SERVICES" | tr ' ' '\n' | jq -R -s -c 'split("\n") | map(select(length > 0))')
else
  SERVICES_JSON="[]"
fi
echo "services_json=$SERVICES_JSON" >> "$GITHUB_OUTPUT"

echo "changed_files<<EOF" >> "$GITHUB_OUTPUT"
echo "$CHANGED_FILES" >> "$GITHUB_OUTPUT"
echo "EOF" >> "$GITHUB_OUTPUT"

if [ -z "$SERVICES" ]; then
  echo "has_changes=false" >> "$GITHUB_OUTPUT"
else
  echo "has_changes=true" >> "$GITHUB_OUTPUT"
fi
