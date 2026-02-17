#!/usr/bin/env bash
# =============================================================================
# Detect Affected CDK Stacks
# =============================================================================
# Checks which CDK stacks are affected by file changes in the latest commit.
# Uses a JSON mapping of file path patterns to stack names.
#
# Environment variables (all required unless noted):
#   STACK_MAPPINGS  - JSON: {"path/": ["StackName", ...]}
#   ALL_STACKS      - Space-separated list of all stack name prefixes
#   ENTRY_FILES     - Space-separated entry point files (e.g., "app.py")
#   ENVIRONMENT     - Suffix to append (e.g., "Production") (optional)
#   INFRA_PATTERN   - Regex to filter infra files (e.g., "^iac/")
#   WORKING_DIR     - Git working directory
#
# Outputs (via $GITHUB_OUTPUT):
#   has_changes  - "true" or "false"
#   stacks       - Space-separated affected stacks
#   stacks_json  - JSON array of affected stacks
# =============================================================================
set -euo pipefail

cd "$WORKING_DIR"

# Get files changed in this commit (comparing with parent)
CHANGED_FILES=$(git diff --name-only HEAD~1 HEAD)

echo "=== Changed files in merge ==="
echo "$CHANGED_FILES"
echo ""

# Filter to infrastructure files only
INFRA_FILES=$(echo "$CHANGED_FILES" | grep -E "$INFRA_PATTERN" || true)

if [ -z "$INFRA_FILES" ]; then
  echo "No infrastructure files changed"
  echo "has_changes=false" >> "$GITHUB_OUTPUT"
  echo "stacks=" >> "$GITHUB_OUTPUT"
  echo "stacks_json=[]" >> "$GITHUB_OUTPUT"
  exit 0
fi

echo "=== Infrastructure files changed ==="
echo "$INFRA_FILES"
echo ""

AFFECTED_STACKS=""

# Check if any entry files changed (affects all stacks)
for entry_file in $ENTRY_FILES; do
  if echo "$INFRA_FILES" | grep -qE "(^|/)${entry_file}$"; then
    echo "Entry file '$entry_file' changed - all stacks affected"
    AFFECTED_STACKS="$ALL_STACKS"
    break
  fi
done

# If no entry file changed, check mappings
if [ -z "$AFFECTED_STACKS" ]; then
  echo "Checking stack mappings..."

  for file in $INFRA_FILES; do
    echo "  Analyzing: $file"
    MATCHING_STACKS=$(echo "$STACK_MAPPINGS" | jq -r --arg file "$file" '
      to_entries[] |
      .key as $k |
      select($file | startswith($k)) |
      .value[]
    ' 2>/dev/null || true)

    if [ -n "$MATCHING_STACKS" ]; then
      echo "    -> Matches: $MATCHING_STACKS"
      AFFECTED_STACKS="$AFFECTED_STACKS $MATCHING_STACKS"
    fi
  done
fi

# Append environment suffix if specified
if [ -n "$ENVIRONMENT" ] && [ -n "$AFFECTED_STACKS" ]; then
  STACKS_WITH_ENV=""
  for stack in $AFFECTED_STACKS; do
    if ! echo "$stack" | grep -qE "(Production|Staging|Dev)$"; then
      STACKS_WITH_ENV="$STACKS_WITH_ENV ${stack}${ENVIRONMENT}"
    else
      STACKS_WITH_ENV="$STACKS_WITH_ENV $stack"
    fi
  done
  AFFECTED_STACKS="$STACKS_WITH_ENV"
fi

# Remove duplicates and empty entries
AFFECTED_STACKS=$(echo "$AFFECTED_STACKS" | tr ' ' '\n' | sort -u | grep -v '^$' | tr '\n' ' ' | xargs)

echo ""
echo "=== Affected stacks ==="
echo "$AFFECTED_STACKS"
echo ""

if [ -z "$AFFECTED_STACKS" ]; then
  echo "No stacks affected by the changes"
  echo "has_changes=false" >> "$GITHUB_OUTPUT"
  echo "stacks=" >> "$GITHUB_OUTPUT"
  echo "stacks_json=[]" >> "$GITHUB_OUTPUT"
else
  echo "has_changes=true" >> "$GITHUB_OUTPUT"
  echo "stacks=$AFFECTED_STACKS" >> "$GITHUB_OUTPUT"
  STACKS_JSON=$(echo "$AFFECTED_STACKS" | tr ' ' '\n' | jq -R . | jq -sc .)
  echo "stacks_json=$STACKS_JSON" >> "$GITHUB_OUTPUT"
fi
