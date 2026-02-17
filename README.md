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
- 💰 Optional cost estimation using the native AWS Pricing API

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
| `enable-cost-estimate` | Estimate monthly cost impact using AWS Pricing API | No | `false` |

#### Example Output

## 🏗️ CDK Diff

**3 changes:** 🟢 1 to add, 🟡 2 to update, 🟠 0 to replace, 🔴 0 to destroy

| Stack | Diff | Drift |
|-------|------|-------|
| `MyStackStaging` | 🟢 +1 🟡 ~2 | ✅ In Sync |
| `MyStackProduction` | ✅ No changes | 🚨 Drifted |

---

#### Cost Estimation

Enable `enable-cost-estimate: true` to append a cost impact table to the PR comment. Uses the native AWS Pricing API -- no external services or API keys needed.

```yaml
jobs:
  cdk-diff:
    uses: vi-technologies/shared-workflows/.github/workflows/cdk-diff.yaml@main
    with:
      working-directory: 'iac'
      aws-role-arn: 'arn:aws:iam::123456789012:role/GithubActionsRole'
      stacks: 'Stack1 Stack2'
      enable-cost-estimate: true
```

**Supported resources (out of the box):** EC2, NAT Gateway, EBS, VPN, Transit Gateway, ALB/NLB, Lambda, ECS (Fargate), EKS, RDS, Aurora, DynamoDB, ElastiCache, DocumentDB, Neptune, S3, EFS, CloudFront, OpenSearch, MSK, MWAA, Redshift, SQS, SNS, Kinesis, Kinesis Firehose.

To add new resource types, edit `.github/pricing/resource-map.json`:

```json
{
  "AWS::EC2::Instance": {
    "serviceCode": "AmazonEC2",
    "unit": "Hrs",
    "monthlyHours": 730,
    "filters": [
      { "Field": "instanceType", "Value": { "cfProperty": "InstanceType" } },
      { "Field": "operatingSystem", "Value": { "default": "Linux" } },
      { "Field": "productFamily", "Value": { "default": "Compute Instance" } }
    ]
  }
}
```

- `cfProperty` -- reads the value from CDK diff property changes (old/new for before/after pricing)
- `default` -- static fallback value
- `monthlyHours` -- multiplier for per-hour resources (730 = 24/7)
- `monthlyQuantity` -- multiplier for per-unit resources (e.g., requests, GB)

---

### Git Sync to S3 (`git-sync-s3.yaml`)

A reusable workflow that syncs files from a Git repository folder to an S3 bucket path — **ArgoCD-style for files**: what's in Git is what's in S3.

#### Features
- 🔄 Syncs a repo folder to S3 using `aws s3 sync --delete`
- 🔐 OIDC-based keyless AWS authentication
- 📁 Supports root bucket path or nested prefixes
- 🔍 Dry-run mode to preview changes
- 🚫 Configurable file exclusion patterns

#### Use Cases
- Sync Airflow DAGs from Git to S3
- Deploy static config/data files managed in Git
- Any "Git as source of truth → S3" pattern

#### Usage

```yaml
name: Sync DAGs to S3

on:
  push:
    branches: [main]
    paths:
      - 'dags/**'

jobs:
  sync:
    uses: vi-technologies/shared-workflows/.github/workflows/git-sync-s3.yaml@main
    with:
      aws-role-arn: 'arn:aws:iam::123456789012:role/GithubActionsRole'
      github-folder-path: 'dags'
      s3-bucket-name: 'my-airflow-bucket'
      s3-bucket-path: 'dags'
```

#### Root Bucket Sync (no prefix)

```yaml
jobs:
  sync:
    uses: vi-technologies/shared-workflows/.github/workflows/git-sync-s3.yaml@main
    with:
      aws-role-arn: 'arn:aws:iam::123456789012:role/GithubActionsRole'
      github-folder-path: 'config'
      s3-bucket-name: 'my-bucket'
```

#### Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `aws-role-arn` | AWS IAM role ARN to assume (OIDC) | **Yes** | - |
| `aws-region` | AWS region | No | `us-east-1` |
| `s3-bucket-name` | S3 bucket name | **Yes** | - |
| `s3-bucket-path` | S3 prefix/path (empty = bucket root) | No | `''` |
| `github-folder-path` | Repo folder to sync | **Yes** | - |
| `dry-run` | Preview changes without applying | No | `false` |
| `exclude-patterns` | Space-separated exclude patterns | No | `''` |
| `extra-args` | Additional `aws s3 sync` arguments | No | `''` |

#### Outputs

| Output | Description |
|--------|-------------|
| `files-synced` | Number of files in the source folder |
| `s3-destination` | Full S3 destination URI |
