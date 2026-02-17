#!/usr/bin/env bash
# =============================================================================
# Run CDK Diff (wrapper)
# =============================================================================
# Installs @aws-cdk/toolkit-lib, copies the shared run-cdk-diff.mjs script,
# runs it, and captures the result as a GitHub Actions output.
#
# Environment variables:
#   STACKS         - Space-separated stack names
#   ENABLE_DRIFT   - "true" to run drift detection
#   WORK_DIR       - Absolute path to working directory
#   SCRIPT_PATH    - Path to the run-cdk-diff.mjs script
#
# Outputs (via $GITHUB_OUTPUT):
#   result - JSON diff result
# =============================================================================
set -euo pipefail

npx cdk synth --quiet --output cdk.out

mkdir -p /tmp/cdk-runner && cd /tmp/cdk-runner
echo '{"type":"module","dependencies":{"@aws-cdk/toolkit-lib":"*"}}' > package.json
npm install --silent
cp "$SCRIPT_PATH" run.js

cd "$WORK_DIR"
CDK_OUT="$(pwd)/cdk.out" node /tmp/cdk-runner/run.js > /tmp/result.json 2>&1 || true
RESULT=$(cat /tmp/result.json | tail -1 || echo '{"success":false,"error":"no output","stacks":[]}')
echo "result<<EOF" >> "$GITHUB_OUTPUT"
echo "$RESULT" >> "$GITHUB_OUTPUT"
echo "EOF" >> "$GITHUB_OUTPUT"
