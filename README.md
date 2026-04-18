# InfraSketch

InfraSketch turns infrastructure code into clean architecture diagrams in the browser.

Paste Terraform HCL or a `docker-compose.yml`, generate a visual diagram, then export it as PNG, SVG, or draw.io XML. The tool is free, open source, and designed for quick architecture reviews, documentation, and README diagrams without connecting to a cloud account.

Live site: https://infrasketch.cloud

## Why InfraSketch?

Infrastructure as code already describes the system, but it is not always easy to scan during reviews, onboarding, or incident discussions. InfraSketch gives you a quick visual layer over that code:

- No cloud credentials required
- No signup or backend processing
- Runs as a static site
- Uses AWS-style architecture icons
- Groups VPCs, subnets, security resources, messaging resources, and application resources
- Exports diagrams for docs, slides, and diagrams.net editing

## Features

- Terraform HCL resource detection for common AWS services
- Docker Compose parsing via **js-yaml** (full YAML spec support)
- VPC and subnet containment layout
- Relationship detection from resource references
- Client-side SVG rendering
- PNG export
- SVG export
- draw.io / diagrams.net XML export
- Multiple built-in examples: production AWS stack, multi-module Terraform, serverless pipeline, and microservices Docker Compose
- Responsive mobile navigation
- Static marketing, legal, and blog pages for GitHub Pages hosting

## Supported AWS Resources

InfraSketch currently recognizes these Terraform resource families:

- Networking: VPC, subnet, internet gateway, NAT gateway, elastic IP
- Compute: EC2, launch template, Auto Scaling group, EKS, ECS, Lambda, ECR
- Data: RDS, DynamoDB, ElastiCache
- Storage: S3
- Load balancing: ALB, NLB, target groups
- Security and identity: security groups, IAM roles, KMS, WAF
- Edge and DNS: CloudFront, Route 53
- Messaging and observability: SQS, SNS, CloudWatch

CloudFormation, Kubernetes manifests, Azure, and GCP are roadmap items rather than complete features today.

## How It Works

1. The browser reads the pasted infrastructure text.
2. JavaScript parses known resource declarations and references.
3. Resources are classified into visual groups such as network, compute, database, storage, security, and messaging.
4. The layout engine places resources into a generated SVG diagram.
5. Export buttons serialize the current diagram to PNG, SVG, or draw.io XML.

The HTML shell lives in `index.html`. The parser, layout, renderer, export logic, and app bootstrap live in `js/`. Brand assets live in `assets/`, architecture icon assets in `icons/`, and vendored third-party scripts in `lib/`.

## Project Structure

```text
.
|-- index.html          # Main InfraSketch app
|-- js/                 # Parser, layout, renderer, and export modules
|-- lib/                # Vendored third-party scripts (js-yaml)
|-- tests/              # Vitest unit and visual regression tests
|-- assets/             # Brand logo assets
|-- icons/              # Architecture icon SVG assets
|-- blog/               # Static blog pages
|-- about.html          # About page
|-- contact.html        # Contact page
|-- privacy.html        # Privacy policy
|-- terms.html          # Terms of use
|-- sitemap.xml         # Search engine sitemap
|-- package.json        # npm scripts and dependencies (dev/test only)
|-- vitest.config.js    # Test runner configuration
|-- CNAME               # GitHub Pages custom domain
`-- LICENSE             # MIT license
```

## Run Locally

Because InfraSketch is a static site, there is no build step. The app uses JavaScript modules, so serve the folder locally instead of opening `index.html` from the filesystem:

```bash
python3 -m http.server 8000
```

Then visit:

```text
http://localhost:8000
```

## Tests

Install dependencies once, then run the test suite:

```bash
npm install
npm test
```

The suite covers:

- **Parser unit tests** — Terraform resource detection, VPC/subnet containment, ALB vs NLB classification, connection inference, and Docker Compose `depends_on` in both array and map (condition) forms.
- **Exporter unit tests** — draw.io XML structure, cell IDs, edge generation, XML escaping, and geometry rounding.
- **Visual regression snapshots** — draw.io XML output for several canonical inputs is snapshot-tested. Run `npx vitest run -u` to update baselines after an intentional layout change.

## Deployment

This repository is ready for static hosting. It can be deployed with GitHub Pages, Netlify, Vercel, Cloudflare Pages, or any plain static web server.

For GitHub Pages with the included `CNAME`, configure the repository pages settings to publish from the branch and folder that contain `index.html`.

`node_modules/` is excluded from the repository via `.gitignore`. The only runtime dependency (`js-yaml`) is vendored as `lib/js-yaml.min.js` so the app works without any build step.

## Current Limitations

InfraSketch is intentionally lightweight, but that also means the Terraform parser is not a full HCL engine.

- Terraform parsing is regex-based and does not evaluate modules, variables, `count`, `for_each`, locals, or dynamic blocks. The multi-file and multi-module examples show how to work around this by pasting concatenated resource blocks.
- Relationships are inferred from simple resource references and may miss complex expressions.
- Local development should use a small static server because browser module loading and icon inlining are more reliable over HTTP than `file://`.

## Contributing

Issues and pull requests are welcome. Good contributions include:

- New supported AWS resource types
- Better parsing for Terraform relationships
- Layout and export fixes
- Accessibility improvements
- Documentation and examples

When reporting a parser issue, include a small sanitized Terraform or Compose snippet that reproduces the problem.

## License

InfraSketch is released under the MIT License. See [LICENSE](LICENSE).
