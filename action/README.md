# InfraSketch GitHub Action

**Automatically post architecture diagram links on every PR that changes infrastructure code.**

When a contributor opens a PR that modifies `.tf`, `.bicep`, `.yaml`, or other IaC files, InfraSketch posts a comment with instant diagram links — one per file, no login required, diagrams open directly in the browser.

## Example PR comment

> ## 🗺️ InfraSketch — Architecture Diagrams
>
> Found **2 infrastructure files** in this PR. Click a link to see the architecture diagram instantly — no login required.
>
> | File | Format | Status | Diagram |
> |------|--------|--------|---------|
> | `infra/main.tf` | Terraform | ✏️ modified | [**View diagram →**](https://infrasketch.cloud) |
> | `k8s/deployment.yaml` | Kubernetes | 🆕 added | [**View diagram →**](https://infrasketch.cloud) |

## Setup — 2 minutes

**Step 1:** Copy this workflow file into your repo at `.github/workflows/infrasketch.yml`:

```yaml
name: Architecture Diagram

on:
  pull_request:
    types: [opened, synchronize, reopened]
    paths:
      - '**/*.tf'
      - '**/*.tfvars'
      - '**/*.bicep'
      - '**/terragrunt.hcl'
      - '**/docker-compose*.yml'
      - '**/docker-compose*.yaml'
      - '**/__main__.py'
      - '**/index.ts'
      - '**/*.yaml'
      - '**/*.yml'

jobs:
  diagram:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
    steps:
      - uses: actions/checkout@v4

      - uses: pandey-raghvendra/infrasketch@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

**Step 2:** Open a PR that changes a `.tf`, `.bicep`, Kubernetes YAML, or other IaC file.

**Step 3:** InfraSketch posts a comment automatically. No secrets, no API keys, no setup beyond the workflow file.

## Supported formats

| Format | File patterns |
|--------|--------------|
| Terraform | `*.tf`, `*.tfvars` |
| Terragrunt | `terragrunt.hcl` |
| Bicep / ARM | `*.bicep`, ARM JSON templates |
| Kubernetes | `*.yaml` / `*.yml` with `apiVersion:` + `kind:` |
| CloudFormation | YAML/JSON with `AWSTemplateFormatVersion` |
| CDK (synth output) | JSON with `Resources` key |
| Pulumi | `__main__.py`, `index.ts` with `@pulumi/` imports |
| Docker Compose | `docker-compose*.yml`, `compose.yml` |

## How it works

1. On PR open/update, the action reads changed files from the GitHub API.
2. Each IaC file is detected by extension and content heuristics.
3. The file content is base64-encoded into an InfraSketch URL.
4. Clicking the link opens [infrasketch.cloud](https://infrasketch.cloud) with the diagram pre-loaded — entirely in the browser, no server involved.

**Privacy:** File contents are encoded into the URL hash (client-side only). Nothing is sent to any InfraSketch server. InfraSketch is a static site with zero backend.

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `github-token` | No | `${{ github.token }}` | GitHub token with `pull-requests: write` permission. The automatic token works. |

## Requirements

- GitHub Actions runner with Node.js 20+ (all `ubuntu-latest` runners qualify)
- `permissions: pull-requests: write` on the job (see example above)

## Troubleshooting

**Comment not appearing:** Check that `permissions: pull-requests: write` is set on the job, not just the workflow.

**"Not a pull request — skipping":** The action only runs on `pull_request` events. Ensure your `on:` trigger includes `pull_request`.

**File detected but no diagram link:** The file may exceed the 200 KB size limit. Large Terraform modules can be split across files — paste just the relevant module into [infrasketch.cloud](https://infrasketch.cloud) manually.

## License

MIT — see [repo root](https://github.com/pandey-raghvendra/infrasketch).
