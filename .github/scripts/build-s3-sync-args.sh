#!/usr/bin/env bash
# =============================================================================
# Build S3 Sync Arguments
# =============================================================================
# Constructs the `aws s3 sync` CLI flags from inputs.
#
# Environment variables:
#   EXCLUDE_PATTERNS - Space-separated glob patterns to exclude
#   INCLUDE_PATTERNS - Space-separated glob patterns to include
#   DRY_RUN          - "true" to add --dryrun flag
#   DELETE_REMOVED   - "true" to add --delete flag
#   EXTRA_ARGS       - Additional raw arguments
#
# Outputs (via $GITHUB_OUTPUT):
#   flags - The complete argument string
# =============================================================================
set -euo pipefail

ARGS=""
if [ "$DELETE_REMOVED" = "true" ]; then ARGS="--delete"; fi
for p in $EXCLUDE_PATTERNS; do ARGS="$ARGS --exclude \"$p\""; done
for p in $INCLUDE_PATTERNS; do ARGS="$ARGS --include \"$p\""; done
if [ "$DRY_RUN" = "true" ]; then ARGS="$ARGS --dryrun"; fi
if [ -n "$EXTRA_ARGS" ]; then ARGS="$ARGS $EXTRA_ARGS"; fi
echo "flags=$ARGS" >> "$GITHUB_OUTPUT"
