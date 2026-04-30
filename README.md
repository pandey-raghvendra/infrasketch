# InfraSketch

![Stars](https://img.shields.io/github/stars/pandey-raghvendra/infrasketch?style=flat&color=orange)
![License](https://img.shields.io/github/license/pandey-raghvendra/infrasketch?style=flat&color=blue)
![Open Source](https://img.shields.io/badge/open%20source-forever-brightgreen?style=flat)
If InfraSketch saved you time, consider starring the repo ⭐

<img width="740" height="135" alt="image" src="https://github.com/user-attachments/assets/f77e697a-2a8a-4255-9115-2aaad1b13c17" />

InfraSketch turns infrastructure code into clean architecture diagrams in the browser — no login, no backend, no cloud credentials required.

Paste Terraform HCL, a `terraform show -json` plan, a CloudFormation template (YAML or JSON), `cdk synth` output, Pulumi TypeScript/Python, Kubernetes YAML, a Terragrunt stack, or a `docker-compose.yml` and get a visual diagram you can export as PNG, SVG, or draw.io XML in seconds.

**Live site: https://infrasketch.cloud**

---

## Quick Start

1. Open https://infrasketch.cloud
2. Paste your Terraform HCL, plan JSON, CloudFormation YAML/JSON, `cdk synth` JSON, Pulumi TypeScript/Python, Kubernetes YAML, Terragrunt `.hcl`, or `docker-compose.yml` into the editor
3. Click **Generate Diagram**
4. Export as **PNG**, **SVG**, or **draw.io XML** — or click **Share** to copy a link

No account. No credentials. Everything runs in your browser.

---

## Features

**Input formats**
- Terraform HCL (`.tf` files — paste one or many concatenated) including `module "name" {}` blocks
- Terraform plan JSON (`terraform plan -out=tfplan && terraform show -json tfplan`) — most accurate connection inference
- CloudFormation YAML or JSON — supports `!Ref`, `!GetAtt`, `!Sub` and all intrinsic function shorthand
- AWS CDK — paste `cdk synth` JSON output directly into the CDK tab
- Pulumi TypeScript (`index.ts`) and Python (`__main__.py`) — 95+ resource types across AWS, GCP, Azure
- Kubernetes YAML — multi-document manifests, 16 resource kinds, namespace grouping, selector-based connections
- Terragrunt (`terragrunt.hcl`) — paste one or multiple units separated by `# --- unit: name ---` markers
- Docker Compose YAML (`docker-compose.yml`) with full YAML spec support

**Cloud providers**
- AWS — 30+ resource types with official architecture icons
- Azure — 22 `azurerm_*` resource types with official Microsoft service icons
- GCP — 23 `google_*` resource types with official Google Cloud category icons

**Diagram**
- VPC / VNet / GCP VPC containment boxes with colour-coded borders
- Subnet grouping with nested resource placement
- Zone overlays: Internet, Messaging, Security
- Relationship arrows inferred from resource attribute references
- Scroll-wheel zoom and click-drag pan
- `+` / `⊡` / `−` zoom controls
- **Interactive editor** — click **Edit** to drag nodes to any position; connection arrows update live; **Reset Layout** restores the original auto-layout

**Module expansion**
- **ZIP upload** — zip your Terraform project root and upload it; local `source = "./modules/vpc"` blocks fully expand, rendering every resource with correct icons and relationships
- **Registry auto-fetch** — toggle *Auto-fetch registry modules* to pull public modules (e.g. `terraform-aws-modules/vpc/aws`) from the Terraform Registry and expand inline

**Export**
- PNG (2× retina scale)
- SVG (icons inlined as base64 for portability)
- draw.io / diagrams.net XML — with visual preview before download

**SVG → draw.io import**
- Upload any SVG architecture diagram; shapes become fully editable draw.io cells
- Known AWS/Azure icon filenames mapped to official `mxgraph.aws4` / `mxgraph.azure2` stencils

**Other**
- Shareable URL — **Share** button encodes editor state as a base64 URL hash; recipients land on the rendered diagram
- Resource summary table — collapsible, lists every resource with name, type, and category
- Stats bar — counts by category (VPC/Network, Compute, Database, Storage, Load Balancer)
- Built-in examples for AWS, Azure, GCP, CloudFormation, CDK, Pulumi (AWS TS, AWS Python, GCP TS), Kubernetes, multi-module Terraform, Terragrunt, serverless pipeline, Docker microservices

---

## Workflows

### Terraform HCL

Paste one or more `.tf` files (concatenated) into the **Terraform** tab and click **Generate Diagram**.

> **Tip:** HCL parsing is regex-based and doesn't evaluate variables or `for_each`. For accurate multi-file projects use the plan JSON workflow below.

### Terraform Plan JSON (recommended for accuracy)

```bash
terraform plan -out=tfplan
terraform show -json tfplan | pbcopy   # macOS — paste into InfraSketch
```

InfraSketch auto-detects the `{` prefix and uses the plan parser. This gives better connection accuracy because Terraform's `expressions[].references` are resolved even when attribute values show `"(known after apply)"`. Module resources (`module.vpc.aws_vpc.main` etc.) appear as individual nodes.

### CloudFormation

Select the **CloudFormation** tab, paste your template (YAML or JSON), and click **Generate Diagram**.

InfraSketch supports the full CloudFormation intrinsic function shorthand (`!Ref`, `!GetAtt`, `!Sub`, `!If`, `!Select`, `!Join`, `!FindInMap`, etc.) and infers:

- **VPC containment** from `VpcId: !Ref MyVPC`
- **Subnet placement** from `SubnetId`/`SubnetIds`/`Subnets` properties
- **Resource connections** from any other `Ref` or `GetAtt` reference between supported resources

**Supported CloudFormation resource types (30+):**

| Category | CloudFormation types |
|---|---|
| Networking | `AWS::EC2::VPC`, `AWS::EC2::Subnet`, `AWS::EC2::InternetGateway`, `AWS::EC2::NatGateway`, `AWS::EC2::EIP`, `AWS::EC2::RouteTable`, `AWS::EC2::TransitGateway`, `AWS::EC2::VPNGateway`, `AWS::EC2::NetworkInterface` |
| Compute | `AWS::EC2::Instance`, `AWS::EC2::LaunchTemplate`, `AWS::AutoScaling::AutoScalingGroup`, `AWS::EKS::Cluster`, `AWS::EKS::Nodegroup`, `AWS::ECS::Cluster`, `AWS::ECS::Service`, `AWS::ECS::TaskDefinition`, `AWS::Lambda::Function` |
| Data | `AWS::RDS::DBInstance`, `AWS::RDS::DBCluster`, `AWS::DynamoDB::Table`, `AWS::ElastiCache::CacheCluster`, `AWS::ElastiCache::ReplicationGroup` |
| Storage | `AWS::S3::Bucket` |
| Load balancing | `AWS::ElasticLoadBalancingV2::LoadBalancer` (ALB/NLB), `AWS::ElasticLoadBalancingV2::TargetGroup`, `AWS::ElasticLoadBalancing::LoadBalancer` |
| Security | `AWS::EC2::SecurityGroup`, `AWS::IAM::Role`, `AWS::KMS::Key`, `AWS::WAFv2::WebACL` |
| Edge / DNS | `AWS::CloudFront::Distribution`, `AWS::Route53::HostedZone`, `AWS::Route53::RecordSet` |
| Messaging | `AWS::SQS::Queue`, `AWS::SNS::Topic` |
| Containers | `AWS::ECR::Repository` |
| Observability | `AWS::CloudWatch::Alarm`, `AWS::Logs::LogGroup` |

### AWS CDK

Select the **CDK** tab, paste `cdk synth` JSON output, and click **Generate Diagram**.

```bash
cdk synth | pbcopy            # macOS — copies to clipboard
cdk synth > template.json     # or save to file, then paste
cdk synth MyStack | pbcopy    # specific stack
```

CDK compiles to CloudFormation JSON — InfraSketch reads the synthesized `Resources` object directly. CDK logical IDs (e.g. `VPCB9E5F0B4`, `EKSCluster9EE0221C`) appear as node labels. VPC containment, subnet placement, and connection arrows are all inferred from `Ref` and `Fn::GetAtt` references in the synthesized template.

All L2 constructs that generate supported L1 types are visualized: `ec2.Vpc`, `eks.Cluster`, `ecs.FargateService`, `lambda.Function`, `rds.DatabaseInstance`, `s3.Bucket`, `sqs.Queue`, `sns.Topic`, `elbv2.ApplicationLoadBalancer`, `cloudfront.Distribution`, `kms.Key`, `iam.Role`, and more.

> **CDK for Terraform (CDKTF):** Use the **Terraform** tab and paste the synthesized JSON — the plan JSON parser handles it directly.

### Pulumi

Select the **Pulumi** tab, paste your `index.ts` (TypeScript) or `__main__.py` (Python), and click **Generate Diagram**.

```typescript
// TypeScript example
import * as aws from "@pulumi/aws";

const vpc = new aws.ec2.Vpc("main", { cidrBlock: "10.0.0.0/16" });
const subnet = new aws.ec2.Subnet("public", { vpcId: vpc.id, cidrBlock: "10.0.1.0/24" });
const lb = new aws.lb.LoadBalancer("alb", { subnets: [subnet.id] });
```

```python
# Python example
import pulumi_aws as aws

vpc = aws.ec2.Vpc("main", cidr_block="10.0.0.0/16")
subnet = aws.ec2.Subnet("public", vpc_id=vpc.id, cidr_block="10.0.1.0/24")
```

InfraSketch auto-detects TypeScript vs Python from syntax. VPC containment is inferred from `vpcId: vpc.id` / `vpc_id=vpc.id` references. Connection arrows are drawn from any variable reference between resources (`vpc.id`, `cluster.endpoint`, etc.).

**Supported Pulumi providers:** `@pulumi/aws`, `@pulumi/gcp`, `@pulumi/azure-native`, `pulumi_aws`, `pulumi_gcp`, `pulumi_azure`.

### Kubernetes

Select the **Kubernetes** tab, paste your manifests (multiple documents separated by `---`), and click **Generate Diagram**.

```bash
kubectl get all -n my-namespace -o yaml | pbcopy   # macOS
helm template my-release ./my-chart | pbcopy        # Helm output
kustomize build overlays/production | pbcopy         # Kustomize output
```

InfraSketch infers topology without cluster access:

- **Ingress → Service** — from `spec.rules[].http.paths[].backend.service.name`
- **Service → Deployment** — Service `spec.selector` matched to workload `spec.selector.matchLabels`
- **Deployment → ConfigMap/Secret** — from volume mounts and `envFrom` references
- **HPA → target** — from `spec.scaleTargetRef`

Resources are grouped into namespace boundaries from `metadata.namespace`. Paste manifests from multiple namespaces at once — each gets its own labelled group.

**Supported kinds:** `Deployment`, `StatefulSet`, `DaemonSet`, `Job`, `CronJob`, `Pod`, `ReplicaSet`, `Service`, `Ingress`, `NetworkPolicy`, `ConfigMap`, `Secret`, `PersistentVolumeClaim`, `PersistentVolume`, `ServiceAccount`, `HorizontalPodAutoscaler`.

### Terragrunt

Select the **Terragrunt** tab. Paste one or more `terragrunt.hcl` files, separated by:

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

Each unit becomes a node. `dependency "name" {}` blocks become directed edges.

### Docker Compose

Select the **Docker Compose** tab, paste your `docker-compose.yml`, and click **Generate Diagram**. `depends_on` (both array and map forms) are rendered as connection arrows.

### Module Expansion — ZIP upload

1. Zip your Terraform project root (the directory containing `main.tf` and your `modules/` folder).
2. In the Terraform tab, click **Upload modules ZIP** and select the file.
3. Paste your root HCL and click **Generate Diagram**.

Module blocks with `source = "./modules/vpc"` expand inline, with resources prefixed as `module.vpc.*`.

### Module Expansion — Registry auto-fetch

Toggle **Auto-fetch registry modules** in the Terraform tab. Modules with a registry source like:

```hcl
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "5.5.1"
}
```

are fetched from the Terraform Registry and GitHub, then expanded inline. Works for any public module on `registry.terraform.io`.

### Interactive Editor

After generating a diagram, click **Edit** in the toolbar:

- **Drag** any node to reposition it — connection arrows follow in real time
- **Click background** to deselect
- **Reset Layout** restores all nodes to their original auto-layout positions
- Click **Done** to exit edit mode

### SVG → draw.io Converter

Click **SVG → draw.io** to open a file picker. Select any `.svg` file — InfraSketch's own exports or any third-party SVG diagram.

| SVG element | draw.io output |
|---|---|
| `<g class="resource-node">` | Single vertex; icon filename → AWS/Azure stencil |
| `<rect>` | Vertex with fill, stroke, corner radius preserved |
| `<circle>` / `<ellipse>` | Ellipse vertex |
| `<text>` | Standalone text cell |
| `<image>` | AWS/Azure stencil if filename matches; `data:` URI embedded; unknown → generic rect |
| `<path>` / `<line>` with `marker-end` | Floating edge with source/target points |

A preview appears in a modal before download. Open the `.drawio` file in [diagrams.net](https://app.diagrams.net) or import into Confluence, Notion, or any draw.io-compatible tool.

### Shareable URLs

Click **Share** to encode the active tab and editor content as a base64 URL hash and copy to clipboard. Opening the link auto-populates the editor and generates the diagram immediately. No server involved — everything is in the URL fragment.

---

## Supported Resources

### Pulumi (AWS)

| Category | Pulumi types |
|---|---|
| Networking | `aws.ec2.Vpc`, `aws.ec2.DefaultVpc`, `aws.ec2.Subnet`, `aws.ec2.InternetGateway`, `aws.ec2.NatGateway`, `aws.ec2.Eip`, `aws.ec2.RouteTable`, `aws.ec2.TransitGateway`, `aws.ec2.VpnGateway`, `aws.ec2.SecurityGroup`, `aws.ec2.NetworkInterface` |
| Compute | `aws.ec2.Instance`, `aws.ec2.LaunchTemplate`, `aws.autoscaling.Group`, `aws.ecs.Cluster`, `aws.ecs.Service`, `aws.ecs.TaskDefinition`, `aws.eks.Cluster`, `aws.eks.NodeGroup`, `aws.lambda_.Function`, `aws.ecr.Repository` |
| Data | `aws.rds.Instance`, `aws.rds.Cluster`, `aws.dynamodb.Table`, `aws.elasticache.Cluster`, `aws.elasticache.ReplicationGroup`, `aws.s3.Bucket`, `aws.s3.BucketV2` |
| Load balancing | `aws.lb.LoadBalancer`, `aws.alb.LoadBalancer`, `aws.lb.TargetGroup`, `aws.alb.TargetGroup` |
| Messaging | `aws.sqs.Queue`, `aws.sns.Topic` |
| Security | `aws.iam.Role`, `aws.kms.Key`, `aws.wafv2.WebAcl` |
| Edge / DNS | `aws.cloudfront.Distribution`, `aws.route53.Zone`, `aws.route53.Record` |
| Observability | `aws.cloudwatch.MetricAlarm`, `aws.cloudwatch.LogGroup` |

Pulumi GCP and Azure resources mirror the Terraform GCP/Azure tables above using `gcp.*` and `azure.*` prefixes.

### Kubernetes

| Kind | Category |
|---|---|
| `Deployment`, `StatefulSet`, `DaemonSet`, `Job`, `CronJob`, `Pod`, `ReplicaSet` | Workloads |
| `Service`, `Ingress`, `NetworkPolicy` | Networking |
| `ConfigMap`, `Secret` | Config |
| `PersistentVolumeClaim`, `PersistentVolume` | Storage |
| `ServiceAccount` | Security |
| `HorizontalPodAutoscaler` | Autoscaling |

### AWS

| Category | Terraform types |
|---|---|
| Networking | `aws_vpc`, `aws_default_vpc`, `aws_subnet`, `aws_internet_gateway`, `aws_nat_gateway`, `aws_eip`, `aws_route_table`, `aws_transit_gateway`, `aws_transit_gateway_attachment`, `aws_vpn_gateway`, `aws_vpn_connection`, `aws_customer_gateway`, `aws_network_interface` |
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

---

## Limitations

| Limitation | Workaround |
|---|---|
| HCL parser doesn't evaluate variables, `count`, `for_each`, locals, or dynamic blocks | Use **plan JSON** workflow — `terraform show -json` resolves everything |
| Cross-file HCL references not resolved | Concatenate all `.tf` files into one paste, or use plan JSON |
| Module ZIP only resolves relative (`./`) source paths | `git::` and `http` module sources need manual extraction |
| Registry auto-fetch needs network + CORS from Terraform Registry / GitHub | Private or rate-limited modules fall back to opaque module nodes |
| Terragrunt: unit names inferred from `dependency "alias"`, not actual directory | Alias names must match intended unit names |
| Plan JSON doesn't traverse nested `module_calls` for cross-module connections | Flatten modules or use ZIP expansion |

---

## GitHub Action

Add architecture diagram links to every PR that touches infrastructure code. No secrets needed — `GITHUB_TOKEN` is automatic.

```yaml
# .github/workflows/infrasketch.yml
name: Architecture Diagram

on:
  pull_request:
    types: [opened, synchronize, reopened]
    paths:
      - '**/*.tf'
      - '**/*.tfvars'
      - '**/docker-compose*.yml'
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

The action detects changed IaC files, auto-identifies the format (Terraform, Pulumi, Kubernetes, CloudFormation, CDK, Docker Compose), generates shareable InfraSketch URLs, and posts (or updates) a PR comment. Files over 200 KB are flagged but skipped.

**Inputs**

| Input | Default | Description |
|---|---|---|
| `github-token` | `${{ github.token }}` | Token with `pull-requests: write` |
| `paths` | `**/*.tf,**/docker-compose*.yml,...` | Comma-separated glob patterns to watch |

---

## Run Locally

No build step required. Serve the folder over HTTP so browser ES module loading and icon inlining work correctly:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

Or with Node:

```bash
npx serve .
```

---

## Tests

```bash
npm install
npm test
```

The suite covers:

- **Parser unit tests** — Terraform HCL resource detection, VPC/subnet containment, ALB/NLB classification, connection inference, `module "name" {}` block parsing, module output references, Azure `azurerm_*` categories, Terraform plan JSON (module resource inclusion, delete skipping, nested block expressions, vpcOf/subnetOf/connections), Terragrunt unit parsing and dependency edges, Docker Compose `depends_on` in array and map forms
- **Exporter unit tests** — draw.io XML structure, cell IDs, edge generation, XML escaping, geometry rounding
- **Visual regression snapshots** — draw.io XML output for canonical inputs is snapshot-tested; run `npx vitest run -u` to update baselines after an intentional layout change

---

## Project Structure

```text
.
├── index.html              # Main app
├── js/
│   ├── parser.js           # Terraform HCL, plan JSON, CloudFormation, CDK, Pulumi, Kubernetes, Terragrunt, Docker Compose parsers
│   ├── layout.js           # Zone layout and metrics
│   ├── renderer.js         # SVG diagram renderer
│   ├── editor.js           # Interactive node drag editor
│   ├── exporters.js        # PNG / SVG / draw.io export
│   ├── svg-to-drawio.js    # SVG → draw.io XML converter
│   ├── constants.js        # Resource categories, icon paths, layout config
│   └── main.js             # UI bootstrap, zoom controller, share URL
├── lib/
│   └── js-yaml.min.js      # Vendored YAML parser (UMD build, no build step needed)
├── tests/
│   ├── parser.test.js      # Parser unit tests
│   ├── exporters.test.js
│   ├── visual.test.js      # draw.io snapshot regression tests
│   └── setup.js
├── icons/                  # AWS + Azure SVG icons
├── gcp_icons/              # Official Google Cloud category icons
├── azure_icons/            # Source Microsoft Azure icon pack
├── assets/                 # Brand assets
├── blog/                   # Static blog pages
└── LICENSE                 # AGPL-3.0
```

---

## Deployment

Static hosting — GitHub Pages, Netlify, Vercel, Cloudflare Pages, or any plain HTTP server. `node_modules/` is gitignored. The only runtime dependency (`js-yaml`) is vendored as `lib/js-yaml.min.js`.

---

## Contributing

Issues and pull requests are welcome. When reporting a parser bug, include a small sanitized Terraform snippet or plan JSON excerpt that reproduces the problem.

---

## License

AGPL-3.0 — see [LICENSE](LICENSE).
