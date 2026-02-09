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

---

### CDK Cost Diff (`cdk-cost-diff.yaml`)

A reusable workflow that estimates the **monthly cost impact** of CDK infrastructure changes in PRs. Chains after `cdk-diff.yaml` and queries the native AWS Pricing API to calculate per-resource cost deltas.

#### Features
- 💰 Estimates monthly cost for added, updated, and removed resources
- 🔐 Uses native AWS Pricing API — no external services, API keys, or accounts needed
- 📊 Posts a sticky PR comment with a before/after cost table
- 🔄 Extensible `resource-map.json` — add new resource types without code changes
- ⚡ In-memory pricing cache to avoid redundant API calls
- 🏷️ Shows property change details (e.g., `t3.micro → t3.large`)

#### Supported Resources (out of the box)
EC2, NAT Gateway, EBS, VPN, Transit Gateway, ALB/NLB, Lambda, ECS (Fargate), EKS, RDS, Aurora, DynamoDB, ElastiCache, DocumentDB, Neptune, S3, EFS, CloudFront, OpenSearch, MSK, MWAA, Redshift, SQS, SNS, Kinesis, Kinesis Firehose — and more can be added via `resource-map.json`.

#### Usage

Chain after `cdk-diff.yaml` using `needs`:

```yaml
name: CDK Diff + Cost

on:
  pull_request:
    branches: [main]
    paths:
      - 'iac/**'

permissions:
  id-token: write
  contents: read
  pull-requests: write

jobs:
  diff:
    uses: vi-technologies/shared-workflows/.github/workflows/cdk-diff.yaml@main
    with:
      working-directory: 'iac'
      aws-role-arn: 'arn:aws:iam::123456789012:role/GithubActionsRole'
      stacks: 'Stack1 Stack2'

  cost:
    needs: diff
    uses: vi-technologies/shared-workflows/.github/workflows/cdk-cost-diff.yaml@main
    with:
      diff-json: ${{ needs.diff.outputs.result }}
      aws-role-name: 'arn:aws:iam::123456789012:role/GithubActionsRole'
```

#### With account ID + role name (short form)

```yaml
  cost:
    needs: diff
    uses: vi-technologies/shared-workflows/.github/workflows/cdk-cost-diff.yaml@main
    with:
      diff-json: ${{ needs.diff.outputs.result }}
      aws-account-id: '123456789012'
      aws-role-name: 'GithubActionsRole'
```

#### Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `diff-json` | Structured diff JSON (output from `cdk-diff.yaml`) | **Yes** | - |
| `aws-role-name` | AWS IAM role name or full ARN | **Yes** | - |
| `aws-account-id` | AWS account ID (if provided, builds ARN from account + role name) | No | `''` |
| `aws-region` | AWS region for pricing lookup | No | `us-east-1` |

#### Adding New Resource Types

Edit `.github/pricing/resource-map.json` to add pricing for new CloudFormation resource types. Each entry maps a CF type to AWS Pricing API filters:

```json
{
  "AWS::EC2::Instance": {
    "serviceCode": "AmazonEC2",
    "unit": "Hrs",
    "monthlyHours": 730,
    "filters": [
      { "Field": "instanceType", "Value": { "cfProperty": "InstanceType" } },
      { "Field": "operatingSystem", "Value": { "default": "Linux" } },
      { "Field": "tenancy", "Value": { "default": "Shared" } },
      { "Field": "capacitystatus", "Value": { "default": "Used" } },
      { "Field": "preInstalledSw", "Value": { "default": "NA" } },
      { "Field": "productFamily", "Value": { "default": "Compute Instance" } }
    ]
  }
}
```

- `cfProperty` — reads the value from the CDK diff property changes (supports old/new for before/after pricing)
- `default` — static fallback value when no property is available
- `monthlyHours` — multiplier for per-hour resources (730 = 24/7 for a month)
- `monthlyQuantity` — multiplier for per-unit resources (e.g., requests, GB)

#### Example PR Comment Output

## 💰 CDK Cost Estimate

**Estimated monthly impact: +$125.56/mo**

> 2 added · 1 updated · 0 removed · 3 priced · 1 without pricing data

| Stack | Resource | Type | Change | Before | After | Delta |
|-------|----------|------|--------|-------:|------:|------:|
| MyStack | Web Server | Instance (t3.micro → t3.large) | 🟡 UPDATE | $6.13 | $60.74 | +$54.61 |
| MyStack | Api Function | Function | 🟢 ADD | - | $0.83 | +$0.83 |
| MyStack | Data Bucket | Bucket | 🟢 ADD | - | $2.30 | +$2.30 |
| MyStack | Api Gateway | RestApi | 🟢 ADD | - | - | no cost data |

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
