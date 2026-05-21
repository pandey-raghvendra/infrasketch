# InfraSketch

![Stars](https://img.shields.io/github/stars/pandey-raghvendra/infrasketch?style=flat&color=orange)
![License](https://img.shields.io/github/license/pandey-raghvendra/infrasketch?style=flat&color=blue)
![Open Source](https://img.shields.io/badge/open%20source-forever-brightgreen?style=flat)
[![npm](https://img.shields.io/npm/v/infrasketch?style=flat&color=cb3837&logo=npm)](https://www.npmjs.com/package/infrasketch)
[![GitHub Marketplace](https://img.shields.io/badge/GitHub%20Marketplace-InfraSketch%20Action-blue?logo=github&style=flat)](https://github.com/marketplace/actions/infrasketch-architecture-diagram)

> If InfraSketch saved you time, consider starring the repo ⭐

<img width="740" height="135" alt="InfraSketch — paste IaC, get architecture diagram" src="https://github.com/user-attachments/assets/f77e697a-2a8a-4255-9115-2aaad1b13c17" />

**Paste Terraform, Bicep, Pulumi, Kubernetes, CloudFormation, CDK, Terragrunt, or Docker Compose → get a clean architecture diagram in seconds. Free, no login, 100% browser.**

**Live: https://infrasketch.cloud**

---

## Quick Start

**Browser:**
1. Open **https://infrasketch.cloud**
2. Paste any IaC code — format is auto-detected
3. Click **Generate Diagram**
4. Export as **PNG**, **SVG**, **draw.io XML**, or **Mermaid** — or **Share** to copy a link

**Terminal (CLI):**
```bash
npx infrasketch .                   # scan current directory
npx infrasketch main.tf             # single file
npx infrasketch ./k8s/              # kubernetes manifests folder
npx infrasketch main.tf --no-open  # CI: print URL, skip browser
```

**Embed on any page:**
```html
<!-- Load once -->
<script src="https://infrasketch.cloud/embed.js"></script>

<!-- Point at a public IaC file URL -->
<infra-sketch src="https://raw.githubusercontent.com/org/repo/main/main.tf"></infra-sketch>

<!-- Or paste code inline -->
<infra-sketch type="terraform" height="480">
resource "aws_vpc" "main" { cidr_block = "10.0.0.0/16" }
</infra-sketch>
```

---

## What it does

| Feature | Details |
|---------|---------|
| **8 IaC formats** | Terraform HCL, Terraform plan JSON, CloudFormation, CDK, Pulumi (TS + Python), Kubernetes, Terragrunt, Docker Compose |
| **3 cloud providers** | AWS (30+ types), Azure (40+ types), GCP (23+ types) with official icons |
| **VPC containment** | Resources drawn inside VPC/VNet/subnet boundaries with colour-coded borders |
| **Connection arrows** | Inferred from HCL references, `dependsOn`, `!Ref`, Pulumi variable refs |
| **⚡ Blast radius** | Click any node → direct downstream (red), indirect downstream (orange), upstream deps (blue); everything else dims; side panel lists every affected service with counts |
| **📦 Module grouping** | Terraform plan JSON auto-detects `module.X.*` addresses → labeled bounding boxes per module; click `[−]` to collapse a group to a single summary card |
| **Plan change badges** | TF plan JSON annotates each node with `+` (create), `~` (update), `↺` (replace), `×` (delete) badges |
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

## MCP Server (Claude Code / Cursor / Windsurf)

[![npm](https://img.shields.io/npm/v/infrasketch-mcp?style=flat&color=cb3837&logo=npm&label=infrasketch-mcp)](https://www.npmjs.com/package/infrasketch-mcp)

Generate architecture diagrams without leaving your editor.

**Claude Code — add once:**
```bash
claude mcp add infrasketch -- npx infrasketch-mcp
```

**Cursor / Windsurf — add to `.cursor/mcp.json` or `mcp.json`:**
```json
{
  "mcpServers": {
    "infrasketch": {
      "command": "npx",
      "args": ["infrasketch-mcp"]
    }
  }
}
```

Then ask your AI: *"Generate a diagram for this Terraform code"* → Claude calls `generate_diagram` and returns a shareable URL + iframe + web component snippet inline in chat.

Tools exposed: `generate_diagram` · `detect_iac_format`

See [`mcp/README.md`](mcp/README.md) for full documentation.

---

## CLI

[![npm](https://img.shields.io/npm/v/infrasketch?style=flat&color=cb3837&logo=npm)](https://www.npmjs.com/package/infrasketch)

Visualise any IaC repo from your terminal — no install needed:

```bash
npx infrasketch .
```

Scans for `.tf`, `.yaml`, `.yml`, `.bicep`, `.json`, `.ts`, `.py` files, auto-detects the format, encodes to a URL, and opens a live diagram in your browser. Nothing is uploaded.

```bash
# Single file
npx infrasketch main.tf

# Kubernetes manifests
npx infrasketch ./k8s/

# Remote GitHub raw URL (browser fetches — no upload)
npx infrasketch https://raw.githubusercontent.com/org/repo/main/main.tf

# CI — print URL without opening browser
npx infrasketch main.tf --no-open

# Override format detection
npx infrasketch stack.json --type cloudformation
```

Install globally: `npm install -g infrasketch`

See [`cli/README.md`](cli/README.md) for full documentation.

---

## Embed web component

Drop a live diagram on any blog, docs site, or GitHub Pages:

```html
<!-- Add once to your <head> -->
<script src="https://infrasketch.cloud/embed.js"></script>

<!-- Embed by URL (auto-fetches your IaC file) -->
<infra-sketch
  src="https://raw.githubusercontent.com/org/repo/main/main.tf"
  height="500"
></infra-sketch>

<!-- Or inline code -->
<infra-sketch type="kubernetes" height="480">
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app
</infra-sketch>
```

Attributes: `src` · `type` · `height` · `width`

Or use the **`</> Embed`** button in the app to get an `<iframe>` or `<infra-sketch>` snippet for the current diagram.

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
# Plan JSON — most accurate: resolves count, for_each, module addresses
# module.X.* addresses get grouped into labeled boxes + collapse/expand
# + change badges (create/update/replace/delete) appear on each node
terraform plan -out=tfplan && terraform show -json tfplan | pbcopy

# CDK
cdk synth | pbcopy

# Kubernetes
kubectl get all -n my-namespace -o yaml | pbcopy
helm template my-release ./my-chart | pbcopy
```

---

## Blast radius workflow

1. Generate a diagram from any IaC format
2. Click any resource node → blast radius mode activates
3. **Red** = services directly broken if this resource changes
4. **Orange** = indirectly affected (2+ hops downstream)
5. **Blue** = what this resource depends on (upstream)
6. Side panel lists every affected resource — click any to pivot and re-analyze from there
7. Press `Esc` or click the selected node again to exit

Works best with Terraform plan JSON — connections are inferred from the `configuration.root_module` expression references.

---

## Limitations

| Issue | Workaround |
|-------|-----------|
| HCL doesn't evaluate `count`, `for_each`, variables | Use plan JSON (`terraform show -json`) |
| Cross-file references not resolved from HCL | Concatenate `.tf` files or use plan JSON |
| Module grouping only works with plan JSON | HCL `module {}` blocks render as single opaque nodes; plan JSON shows full `module.X.*` addresses |
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

## Guides & blog posts

| Post | Topic |
|------|-------|
| [GitHub Action: Auto-Diagram IaC PRs](https://infrasketch.cloud/blog/github-action-terraform-diagram.html) | CI/CD setup, monorepo, 2-min walkthrough |
| [Visualize Checkov Results on Diagrams](https://infrasketch.cloud/blog/checkov-diagram-visualization.html) | Security overlay, check IDs, export |
| [Visualize Infracost on Diagrams](https://infrasketch.cloud/blog/infracost-diagram-visualization.html) | Cost overlay, colour tiers, CI workflow |
| [Terraform Diagram Generator](https://infrasketch.cloud/blog/terraform-diagram-generator.html) | HCL patterns, VPC, reference arrows |
| [Terraform Visualization Best Practices](https://infrasketch.cloud/blog/terraform-visualization-best-practices.html) | 5 approaches compared |
| [How to Create AWS Architecture Diagrams](https://infrasketch.cloud/blog/how-to-create-aws-architecture-diagrams.html) | Tool comparison, 2026 guide |

---

## Contributing

Issues and PRs welcome. For parser bugs, include a minimal sanitized IaC snippet that reproduces the problem.

## License

AGPL-3.0 — see [LICENSE](LICENSE).
