# InfraSketch

![Stars](https://img.shields.io/github/stars/pandey-raghvendra/infrasketch?style=flat&color=orange)
![License](https://img.shields.io/github/license/pandey-raghvendra/infrasketch?style=flat&color=blue)
![Open Source](https://img.shields.io/badge/open%20source-forever-brightgreen?style=flat)
[![GitHub Marketplace](https://img.shields.io/badge/GitHub%20Marketplace-InfraSketch%20Action-blue?logo=github&style=flat)](https://github.com/marketplace/actions/infrasketch-architecture-diagram)

> If InfraSketch saved you time, consider starring the repo ⭐

<img width="740" height="135" alt="InfraSketch — paste IaC, get architecture diagram" src="https://github.com/user-attachments/assets/f77e697a-2a8a-4255-9115-2aaad1b13c17" />

**Paste Terraform, Bicep, Pulumi, Kubernetes, CloudFormation, CDK, Terragrunt, or Docker Compose → get a clean architecture diagram in seconds. Free, no login, 100% browser.**

**Live: https://infrasketch.cloud**

---

## Quick Start

1. Open **https://infrasketch.cloud**
2. Paste any IaC code — format is auto-detected
3. Click **Generate Diagram**
4. Export as **PNG**, **SVG**, **draw.io XML**, or **Mermaid** — or **Share** to copy a link

---

## What it does

| Feature | Details |
|---------|---------|
| **8 IaC formats** | Terraform HCL, Terraform plan JSON, CloudFormation, CDK, Pulumi (TS + Python), Kubernetes, Terragrunt, Docker Compose |
| **3 cloud providers** | AWS (30+ types), Azure (40+ types), GCP (23+ types) with official icons |
| **VPC containment** | Resources drawn inside VPC/VNet/subnet boundaries with colour-coded borders |
| **Connection arrows** | Inferred from HCL references, `dependsOn`, `!Ref`, Pulumi variable refs |
| **Module expansion** | ZIP upload expands local modules inline; registry auto-fetch for public TF modules |
| **Interactive editor** | Drag nodes to reposition; arrows update live; Reset Layout restores auto-layout |
| **🛡 Security overlay** | Paste `checkov -d . -o json` output → failing resources get red borders + badge |
| **💰 Cost overlay** | Paste `infracost breakdown --format json` → colour-coded monthly cost per node |
| **Export** | PNG (2× retina), SVG (icons inlined), draw.io XML, Mermaid, shareable URL |
| **SVG → draw.io** | Upload any SVG; AWS/Azure icons mapped to native draw.io stencils |
| **100% private** | No server, no credentials, no telemetry — everything runs in your browser |

---

## GitHub Action

[![Marketplace](https://img.shields.io/badge/GitHub%20Marketplace-InfraSketch%20Architecture%20Diagram-blue?logo=github)](https://github.com/marketplace/actions/infrasketch-architecture-diagram)

Post architecture diagram links on every IaC PR automatically — free, no secrets needed.

```yaml
# .github/workflows/infrasketch.yml
name: Architecture Diagram
on:
  pull_request:
    types: [opened, synchronize, reopened]
    paths: ['**/*.tf', '**/*.bicep', '**/terragrunt.hcl', '**/*.yaml', '**/*.yml', '**/__main__.py', '**/index.ts']
jobs:
  diagram:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
      - uses: pandey-raghvendra/infrasketch@v4
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

Detects changed IaC files, identifies format, generates shareable diagram URLs, posts (or updates) a PR comment.

---

## Security & Cost overlays

**Checkov** — highlight misconfigurations directly on the diagram:
```bash
checkov -d . -o json > checkov.json
# Click 🛡 Security in the export bar → paste output
```

**Infracost** — show monthly cost per resource:
```bash
infracost breakdown --path . --format json > infracost.json
# Click 💰 Cost in the export bar → paste output
```

Cost tiers: grey (free) → green (<$10) → amber ($10–$100) → orange ($100–$500) → red (>$500/mo)

---

## Terraform workflows

```bash
# HCL — paste one or more .tf files concatenated
# Plan JSON — most accurate (resolves count, for_each, modules)
terraform plan -out=tfplan && terraform show -json tfplan | pbcopy

# CDK
cdk synth | pbcopy

# Kubernetes
kubectl get all -n my-namespace -o yaml | pbcopy
helm template my-release ./my-chart | pbcopy
```

---

## Limitations

| Issue | Workaround |
|-------|-----------|
| HCL doesn't evaluate `count`, `for_each`, variables | Use plan JSON (`terraform show -json`) |
| Cross-file references not resolved from HCL | Concatenate `.tf` files or use plan JSON |
| Module ZIP resolves only relative (`./`) paths | `git::` / `http` sources need manual extraction |
| Registry auto-fetch needs network + CORS | Private modules fall back to opaque nodes |

---

## Run locally

```bash
python3 -m http.server 8000   # open http://localhost:8000
# or
npx serve .
```

No build step. The only runtime dependency (`js-yaml`) is vendored in `lib/`.

## Tests

```bash
npm install && npm test
```

Covers parser unit tests (all 8 formats), exporter tests, and draw.io XML visual regression snapshots.

---

## Contributing

Issues and PRs welcome. For parser bugs, include a minimal sanitized IaC snippet that reproduces the problem.

## License

AGPL-3.0 — see [LICENSE](LICENSE).
