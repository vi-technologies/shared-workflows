# Shared Workflows

Reusable GitHub Actions workflows for vi-technologies repositories.

## Available Workflows

### CDK Diff (`cdk-diff.yaml`)

A reusable workflow that runs CDK diff and drift detection, then posts a formatted table comment on PRs.

#### Features
- 📊 Table-formatted PR comments with change counts
- 🔍 Stack drift detection using AWS CloudFormation
- 📦 Collapsible detailed diff output per stack
- 🎯 Supports both Python and TypeScript CDK apps

#### Usage

```yaml
name: CDK Diff

on:
  pull_request:
    branches: [main]
    paths:
      - 'iac/**'

jobs:
  cdk-diff:
    uses: vi-technologies/shared-workflows/.github/workflows/cdk-diff.yaml@main
    with:
      working-directory: 'iac'
      python-version: '3.12'
      aws-role-arn: 'arn:aws:iam::123456789012:role/GithubActionsRole'
      stacks: 'Stack1 Stack2 Stack3'
      install-command: 'pip install -r requirements.txt'
      enable-drift-detection: true
```

#### Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `working-directory` | Working directory for CDK commands | No | `.` |
| `python-version` | Python version (for Python CDK apps) | No | `''` |
| `node-version` | Node.js version | No | `20` |
| `aws-region` | AWS region | No | `us-east-1` |
| `aws-role-arn` | AWS IAM role ARN to assume | **Yes** | - |
| `stacks` | Space-separated list of stack names | **Yes** | - |
| `install-command` | Command to install dependencies | No | `npm ci` |
| `enable-drift-detection` | Run drift detection | No | `true` |

#### Example Output

## 🏗️ CDK Diff

**3 changes:** 🟢 1 to add, 🟡 2 to update, 🟠 0 to replace, 🔴 0 to destroy

| Stack | Diff | Drift |
|-------|------|-------|
| `MyStackStaging` | 🟢 +1 🟡 ~2 | ✅ In Sync |
| `MyStackProduction` | ✅ No changes | 🚨 Drifted |
