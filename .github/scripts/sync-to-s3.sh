#!/usr/bin/env bash
# =============================================================================
# Sync Files to S3
# =============================================================================
# Builds the S3 destination URI and runs `aws s3 sync`.
#
# Environment variables:
#   S3_BUCKET   - S3 bucket name
#   DEST_DIR    - S3 prefix/path (empty = bucket root)
#   SOURCE_DIR  - Local source directory
#   SYNC_ARGS   - Pre-built sync arguments string
# =============================================================================
set -euo pipefail

if [ -n "$DEST_DIR" ]; then
  DEST="s3://${S3_BUCKET}/${DEST_DIR}/"
else
  DEST="s3://${S3_BUCKET}/"
fi
echo "Syncing ./${SOURCE_DIR}/ → ${DEST}"
eval aws s3 sync "./${SOURCE_DIR}/" "$DEST" $SYNC_ARGS
