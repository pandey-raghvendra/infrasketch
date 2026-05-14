# infrasketch-mcp

MCP server for [InfraSketch](https://infrasketch.cloud) — generate IaC architecture diagram URLs directly from Claude Code, Cursor, Windsurf, or any MCP-compatible AI editor.

## What it does

Exposes two MCP tools:

| Tool | Description |
|------|-------------|
| `generate_diagram` | Takes IaC code → returns a shareable diagram URL + embed snippets |
| `detect_iac_format` | Detects the format of an IaC code snippet |

Supports: **Terraform · OpenTofu · Kubernetes · Pulumi · CloudFormation · CDK · Bicep/ARM · Terragrunt · Docker Compose**

Nothing is uploaded. The diagram URL encodes your code in the URL fragment — fully client-side.

## Setup

### Claude Code

Add to `.claude/settings.json` in your project (or `~/.claude/settings.json` globally):

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

Or run once:
```bash
claude mcp add infrasketch -- npx infrasketch-mcp
```

### Cursor

Add to `.cursor/mcp.json`:

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

### Windsurf / other MCP clients

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

## Usage

Once configured, ask your AI assistant:

```
Generate a diagram for my Terraform code
Visualize this Kubernetes manifest
What format is this IaC file?
Create an architecture diagram and give me the embed code
```

The `generate_diagram` tool returns:
- **Interactive diagram URL** — open in browser for drag-drop editing, export
- **iframe embed snippet** — paste into any webpage
- **Web component snippet** — `<infra-sketch>` for docs/blogs

## Example output

```
## InfraSketch Diagram

**Format:** Terraform / OpenTofu
**Size:** 42 lines · 1.2 KB

### Interactive diagram
https://infrasketch.cloud/#eyJ0eXBlIjoidGVycmFmb3JtIiwiY29kZSI6...

### Embed (iframe)
<iframe src="https://infrasketch.cloud/embed.html#..." ...></iframe>

### Embed (web component)
<script src="https://infrasketch.cloud/embed.js"></script>
<infra-sketch type="terraform" height="520">...</infra-sketch>
```

## Install options

```bash
# Use without installing (recommended)
npx infrasketch-mcp

# Install globally
npm install -g infrasketch-mcp
```

Requires Node.js 18+.

## Privacy

- Your IaC code is **never uploaded** to any server
- The diagram URL encodes code in the URL fragment (client-side only)
- InfraSketch has no backend — everything renders in the browser

## Links

- **Web app**: [infrasketch.cloud](https://infrasketch.cloud)
- **CLI**: [npmjs.com/package/infrasketch](https://www.npmjs.com/package/infrasketch)
- **GitHub**: [pandey-raghvendra/infrasketch](https://github.com/pandey-raghvendra/infrasketch)

## License

MIT
