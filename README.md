# InfraSketch

![Stars](https://img.shields.io/github/stars/pandey-raghvendra/infrasketch?style=flat&color=orange)
![License](https://img.shields.io/github/license/pandey-raghvendra/infrasketch?style=flat&color=blue)
![Open Source](https://img.shields.io/badge/open%20source-forever-brightgreen?style=flat)

InfraSketch turns infrastructure code into clean architecture diagrams in the browser — no login, no backend, no cloud credentials required.

Paste Terraform HCL, a `terraform show -json` plan, a Terragrunt stack, or a `docker-compose.yml` and get a visual diagram you can export as PNG, SVG, or draw.io XML in seconds.

Live site: https://infrasketch.cloud

## Features

**Input formats**
- Terraform HCL (`.tf` files, paste one or many concatenated) — includes `module "name" {}` blocks
- Terraform plan JSON (`terraform plan -out=tfplan && terraform show -json tfplan`) — includes module resources
- Terragrunt (`terragrunt.hcl`) — paste one or multiple units separated by `# --- unit: name ---` markers
- Docker Compose YAML (`docker-compose.yml`), parsed with full YAML spec support via **js-yaml**

**Full module expansion**
- **ZIP upload** — zip your Terraform project directory and upload it; local `module "name" { source = "./modules/vpc" }` blocks are fully expanded, rendering every resource inside the module with correct icons and relationships
- **Registry auto-fetch** — toggle *Auto-fetch registry modules* to pull public modules (e.g. `terraform-aws-modules/vpc/aws`, `Azure/compute/azurerm`) from the Terraform Registry and expand their resources inline — no credentials needed

**Cloud providers**
- AWS — 30+ resource types with official architecture icons
- Azure — 22 `azurerm_*` resource types with official Microsoft service icons
- GCP — 23 `google_*` resource types with Google Cloud branded icons

**Diagram**
- VPC / VNet and subnet containment boxes with colour-coded borders
- Zone overlays: Internet, Messaging, Security
- Relationship arrows inferred from resource attribute references
- Scroll-wheel zoom and click-drag pan
- `+` / `⊡` / `−` zoom controls

**Export**
- PNG (2× retina scale)
- SVG (icons inlined as base64 for portability)
- draw.io / diagrams.net XML — with visual preview before download

**SVG → draw.io import**
- Upload any SVG architecture diagram — a visual preview appears before download
- Shapes are fully editable in draw.io — not embedded as an image
- Known AWS/Azure icons (matched by filename stem) are mapped to official `mxgraph.aws4` / `mxgraph.azure2` stencils
- Unknown icons: `data:` URIs are embedded as image cells; relative file paths fall back to a generic labelled rectangle

**Other**
- Shareable URL — click **Share** to encode the current editor state as a base64 URL hash and copy the link to clipboard; recipients land directly on the rendered diagram
- Resource summary table — collapsible table below the diagram listing every resource with name, type, and category
- Stats bar — counts by category (VPC/Network, Compute, Database, Storage, Load Balancer)
- Built-in examples for AWS, Azure, multi-module Terraform, Terragrunt stacks, serverless pipeline, and Docker microservices
- Responsive mobile navigation

## Supported Resources

### AWS

| Category | Terraform types |
|---|---|
| Networking | `aws_vpc`, `aws_default_vpc`, `aws_subnet`, `aws_internet_gateway`, `aws_nat_gateway`, `aws_eip` |
| Compute | `aws_instance`, `aws_launch_template`, `aws_autoscaling_group`, `aws_eks_cluster`, `aws_ecs_cluster`, `aws_ecs_service`, `aws_lambda_function`, `aws_ecr_repository` |
| Data | `aws_db_instance`, `aws_rds_cluster`, `aws_dynamodb_table`, `aws_elasticache_cluster`, `aws_elasticache_replication_group` |
| Storage | `aws_s3_bucket` |
| Load balancing | `aws_lb`, `aws_alb`, `aws_lb_target_group` |
| Security | `aws_security_group`, `aws_iam_role`, `aws_kms_key`, `aws_wafv2_web_acl` |
| Edge / DNS | `aws_cloudfront_distribution`, `aws_route53_record`, `aws_route53_zone` |
| Messaging | `aws_sqs_queue`, `aws_sns_topic` |
| Observability | `aws_cloudwatch_metric_alarm`, `aws_cloudwatch_log_group` |

### Azure

| Category | Terraform types |
|---|---|
| Networking | `azurerm_virtual_network`, `azurerm_subnet`, `azurerm_network_security_group`, `azurerm_application_gateway`, `azurerm_lb`, `azurerm_frontdoor`, `azurerm_traffic_manager_profile` |
| Compute | `azurerm_virtual_machine`, `azurerm_virtual_machine_scale_set`, `azurerm_kubernetes_cluster`, `azurerm_container_group`, `azurerm_linux_function_app`, `azurerm_windows_function_app`, `azurerm_linux_web_app`, `azurerm_windows_web_app` |
| Data | `azurerm_mssql_server`, `azurerm_cosmosdb_account`, `azurerm_postgresql_flexible_server`, `azurerm_redis_cache`, `azurerm_storage_account` |
| Messaging | `azurerm_servicebus_namespace`, `azurerm_eventhub_namespace` |
| Security | `azurerm_key_vault` |
| Observability | `azurerm_monitor_action_group`, `azurerm_application_insights` |
| DNS | `azurerm_dns_zone` |

### GCP

| Category | Terraform types |
|---|---|
| Networking | `google_compute_network`, `google_compute_subnetwork`, `google_compute_firewall`, `google_compute_router`, `google_compute_address`, `google_compute_global_address` |
| Compute | `google_compute_instance`, `google_compute_instance_group`, `google_compute_instance_template`, `google_compute_autoscaler`, `google_container_cluster`, `google_container_node_pool` |
| Serverless | `google_cloud_run_service`, `google_cloud_run_v2_service`, `google_cloudfunctions_function`, `google_cloudfunctions2_function` |
| Data | `google_sql_database_instance`, `google_bigquery_dataset`, `google_spanner_instance`, `google_bigtable_instance`, `google_firestore_document`, `google_redis_instance`, `google_memcache_instance` |
| Storage | `google_storage_bucket` |
| Load Balancing | `google_compute_global_forwarding_rule`, `google_compute_forwarding_rule`, `google_compute_backend_service`, `google_compute_url_map` |
| Security | `google_kms_key_ring`, `google_kms_crypto_key`, `google_secret_manager_secret`, `google_service_account` |
| Messaging | `google_pubsub_topic`, `google_pubsub_subscription` |
| DNS | `google_dns_managed_zone` |
| Observability | `google_monitoring_alert_policy`, `google_logging_metric`, `google_logging_project_sink` |

## How It Works

1. The browser reads the pasted infrastructure text.
2. The parser classifies each resource into a category and extracts containment (`vpc_id`, `virtual_network_name`, `subnet_id`, `vnet_subnet_id`) and connection references.
3. For Terraform plan JSON the parser reads `resource_changes[].change.after` for resource data and `configuration.root_module.resources[].expressions[].references` for relationships — so connections are resolved even when `after` values show `"(known after apply)"`.
4. The layout engine positions resources into zones and builds container boxes for VPCs and subnets.
5. The SVG renderer draws the diagram into a `<g class="zoom-layer">` wrapper so zoom and pan work without affecting exports.
6. Export buttons serialize the current SVG DOM (icons inlined) or generate draw.io XML from the parsed model.

## Project Structure

```text
.
├── index.html          # Main app
├── js/
│   ├── parser.js       # Terraform HCL, plan JSON, Terragrunt, and Docker Compose parsers
│   ├── layout.js       # Zone layout and metrics
│   ├── renderer.js     # SVG diagram renderer
│   ├── exporters.js    # PNG / SVG / draw.io export
│   ├── svg-to-drawio.js# SVG → draw.io XML converter
│   ├── constants.js    # Resource categories, icon paths, layout config
│   └── main.js         # UI bootstrap, zoom controller, share URL
├── lib/
│   └── js-yaml.min.js  # Vendored YAML parser (UMD build, no build step needed)
├── tests/
│   ├── parser.test.js  # Parser unit tests (60 tests)
│   ├── exporters.test.js
│   ├── visual.test.js  # draw.io snapshot regression tests
│   └── setup.js
├── icons/              # AWS + Azure SVG icons
├── assets/             # Brand assets
├── azure_icons/        # Source Microsoft Azure icon pack
├── blog/               # Static blog pages
├── about.html
├── contact.html
├── privacy.html
├── terms.html
├── sitemap.xml
├── package.json
├── vitest.config.js
├── CNAME
└── LICENSE
```

## Terraform Plan JSON Workflow

```bash
terraform plan -out=tfplan
terraform show -json tfplan
```

Copy the JSON output and paste it directly into the **Terraform** tab. InfraSketch auto-detects the `{` prefix and switches to the plan parser. This approach has better connection accuracy than pasting HCL because Terraform's `expressions[].references` arrays contain resolved resource addresses even when attribute values are `"(known after apply)"`.

Module resources (`module.vpc.aws_vpc.main` etc.) are now included — each appears as an independent node with its real resource type and icon.

## Terragrunt Workflow

Select the **Terragrunt** tab and paste the content of one or more `terragrunt.hcl` files. Separate multiple units with a comment marker:

```
# --- unit: vpc ---
terraform {
  source = "git::https://github.com/myorg/tf-modules//vpc?ref=v2.0.0"
}

# --- unit: app ---
terraform {
  source = "git::https://github.com/myorg/tf-modules//ecs-service?ref=v2.0.0"
}

dependency "vpc" {
  config_path = "../vpc"
}
```

Each unit becomes a node. `dependency "name" {}` blocks become directed edges — InfraSketch automatically adds any dependency units not listed as explicit `# --- unit: ---` sections.

## Module Expansion

InfraSketch can fully expand Terraform `module "name" {}` blocks to show every resource inside the module with correct icons and relationships.

### ZIP upload (local modules)

1. Zip your Terraform project root (the directory containing `main.tf` and your `modules/` folder).
2. In the Terraform tab, click **Upload modules ZIP** and select the file.
3. Paste your root HCL (or the file is already in the ZIP) and click **Generate Diagram**.

Module blocks with `source = "./modules/vpc"` are resolved against the ZIP, their resources prefixed as `module.vpc.*`, and rendered inline.

### Registry auto-fetch (public modules)

Toggle **Auto-fetch registry modules** in the Terraform tab. When a module block has a registry source like:

```hcl
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "5.5.1"
}
```

InfraSketch queries the Terraform Registry API and fetches the module's root `.tf` files from GitHub, then expands the resources inline. Works for any public module on `registry.terraform.io`.

## SVG → draw.io Converter

Click **SVG → draw.io** in the diagram panel toolbar to open a file picker. Select any `.svg` file — InfraSketch's own exports or third-party SVG diagrams.

**What gets converted**

| SVG element | draw.io output |
|---|---|
| `<g class="resource-node">` | Single vertex cell; icon detected via filename → AWS/Azure stencil |
| `<rect>` | Vertex with fill, stroke, and corner radius preserved |
| `<circle>` / `<ellipse>` | Ellipse vertex |
| `<text>` | Standalone text cell with font size preserved |
| `<image>` | AWS/Azure stencil if filename matches; `data:` URI embedded; unknown path → generic rect |
| `<path>` / `<line>` with `marker-end` | Floating edge with source/target points |

**Unknown icon fallback**

| Icon href | Behaviour |
|---|---|
| Matches known filename stem (e.g. `ec2`, `az-aks`) | Mapped to official `mxgraph.*` stencil — fully scalable |
| `data:image/svg+xml;base64,...` | Embedded as `shape=image` cell — visible, not editable as stencil |
| Relative file path (e.g. `icons/custom.svg`) | Generic rounded rectangle with label text |

A visual preview of the diagram appears in a modal before any file is downloaded. Click **Download .drawio** in the modal to save the file. Open it in [draw.io](https://app.diagrams.net) or import into Confluence, Notion, or any draw.io-compatible tool.

## Shareable URLs

Click the **Share** button (top-right of the diagram panel) to encode the active tab and editor content as a base64 URL hash and copy the link to clipboard. Opening the link auto-populates the editor and generates the diagram immediately. No server involved — everything is in the URL fragment.

## Run Locally

No build step required. Serve the folder over HTTP so browser module loading and icon inlining work correctly:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Tests

```bash
npm install
npm test
```

The suite covers:

- **Parser unit tests** — Terraform HCL resource detection, VPC/subnet containment, ALB/NLB classification, connection inference, `module "name" {}` block parsing, module output references, Azure `azurerm_*` categories, Terraform plan JSON (module resource inclusion, delete skipping, nested block expressions, vpcOf/subnetOf/connections), Terragrunt unit parsing and dependency edges, Docker Compose `depends_on` in array and map forms.
- **Exporter unit tests** — draw.io XML structure, cell IDs, edge generation, XML escaping, geometry rounding.
- **Visual regression snapshots** — draw.io XML output for canonical inputs is snapshot-tested. Run `npx vitest run -u` to update baselines after an intentional layout change.

## Deployment

Static hosting — GitHub Pages, Netlify, Vercel, Cloudflare Pages, or any plain HTTP server. `node_modules/` is gitignored. The only runtime dependency (`js-yaml`) is vendored as `lib/js-yaml.min.js`.

## Limitations

- The HCL parser is regex-based and does not evaluate variables, `count`, `for_each`, locals, dynamic blocks, or cross-file references. Use the plan JSON workflow for accurate multi-file results.
- Module expansion via ZIP resolves only relative (`./`) source paths. `git::` and `http` sources are not resolved from ZIP.
- Registry auto-fetch requires network access and CORS support from the Terraform Registry and GitHub APIs. Rate-limited or private modules will fall back to opaque module nodes.
- Terragrunt: dependency unit names are inferred from `dependency "alias"` block names; the actual unit directory is not resolved.
- The plan JSON parser does not traverse nested `module_calls` configuration for cross-module connection inference.

## Contributing

Issues and pull requests are welcome. When reporting a parser bug, include a small sanitized Terraform snippet or plan JSON excerpt that reproduces the problem.

## License

AGPL-3.0 — see [LICENSE](LICENSE).
