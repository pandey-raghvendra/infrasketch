# infrasketch CLI

Instantly visualise Terraform, Kubernetes, Pulumi, CloudFormation and more — right from your terminal.

```bash
npx infrasketch .
```

Opens an interactive architecture diagram in your browser. No login. No upload. Everything runs locally in the browser.

## Install

```bash
# Run without installing (recommended)
npx infrasketch .

# Or install globally
npm install -g infrasketch
```

Requires Node.js 18+.

## Usage

```bash
infrasketch <target> [options]
```

### Targets

| Target | What it does |
|--------|-------------|
| `.` | Scan current directory for IaC files |
| `main.tf` | Single file |
| `./k8s/` | Scan directory recursively |
| `https://raw.github…` | Remote URL — browser fetches, nothing uploaded |

### Options

| Flag | Description |
|------|-------------|
| `--type <format>` | Override auto-detection |
| `--no-open` | Print URL only, skip opening browser (CI-friendly) |
| `--version` | Print version |
| `--help` | Print help |

### Supported formats

`terraform` · `kubernetes` · `cloudformation` · `cdk` · `pulumi` · `docker` · `terragrunt` · `bicep`

Auto-detected from file extension and content. Pass `--type` to override.

## Examples

```bash
# Visualise current Terraform project
npx infrasketch .

# Single Kubernetes manifest
npx infrasketch deployment.yaml

# All manifests in a folder
npx infrasketch ./k8s/

# Remote GitHub raw URL
npx infrasketch https://raw.githubusercontent.com/org/repo/main/main.tf

# CI — get diagram URL without opening browser
npx infrasketch main.tf --no-open

# Force format
npx infrasketch stack.json --type cloudformation
```

## CI / GitHub Actions

```yaml
- name: Generate diagram URL
  run: |
    URL=$(npx infrasketch main.tf --no-open | grep 'https://' | tr -d ' ')
    echo "Diagram: $URL"
```

Or use the dedicated [InfraSketch GitHub Action](https://github.com/pandey-raghvendra/infrasketch) to post diagram links on every IaC pull request automatically.

## Embed anywhere

After opening your diagram, click **`</> Embed`** to get a one-line snippet:

```html
<!-- iframe (works everywhere) -->
<iframe src="https://infrasketch.cloud/embed.html#..." width="100%" height="520"
  style="border:none;border-radius:8px" allowfullscreen></iframe>

<!-- or the web component (auto-fetches from a URL) -->
<script src="https://infrasketch.cloud/embed.js"></script>
<infra-sketch src="https://raw.githubusercontent.com/org/repo/main/main.tf"></infra-sketch>
```

## Privacy

- No data is sent to any server
- IaC code is encoded in the URL fragment (never leaves your browser)
- Remote URL mode: your browser fetches the file directly — InfraSketch never touches it

## Links

- **Web app**: [infrasketch.cloud](https://infrasketch.cloud)
- **GitHub**: [pandey-raghvendra/infrasketch](https://github.com/pandey-raghvendra/infrasketch)
- **Issues**: [github.com/pandey-raghvendra/infrasketch/issues](https://github.com/pandey-raghvendra/infrasketch/issues)

## License

MIT
