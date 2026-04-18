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
- Docker Compose service detection
- VPC and subnet containment layout
- Relationship detection from resource references
- Client-side SVG rendering
- PNG export
- SVG export
- draw.io / diagrams.net XML export
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

All of the app logic lives in `index.html` today. The icon assets live in `icons/`.

## Project Structure

```text
.
|-- index.html          # Main InfraSketch app
|-- icons/              # Architecture icon SVG assets
|-- blog/               # Static blog pages
|-- about.html          # About page
|-- contact.html        # Contact page
|-- privacy.html        # Privacy policy
|-- terms.html          # Terms of use
|-- sitemap.xml         # Search engine sitemap
|-- CNAME               # GitHub Pages custom domain
`-- LICENSE             # MIT license
```

## Run Locally

Because InfraSketch is a static site, there is no build step.

Open `index.html` directly in a browser, or serve the folder locally:

```bash
python3 -m http.server 8000
```

Then visit:

```text
http://localhost:8000
```

## Deployment

This repository is ready for static hosting. It can be deployed with GitHub Pages, Netlify, Vercel, Cloudflare Pages, or any plain static web server.

For GitHub Pages with the included `CNAME`, configure the repository pages settings to publish from the branch and folder that contain `index.html`.

## Current Limitations

InfraSketch is intentionally lightweight, but that also means the parser is not a full Terraform, YAML, or CloudFormation engine yet.

- Terraform parsing is regex-based and does not evaluate modules, variables, `count`, `for_each`, locals, or dynamic blocks.
- Relationships are inferred from simple resource references and may miss complex expressions.
- Docker Compose support is basic and should be upgraded to a real YAML parser for production-grade accuracy.
- The main app is currently a single HTML file, which is convenient for static hosting but harder to test as the codebase grows.
- Exported SVG files reference icon assets by path, so fully standalone SVG export should inline or embed icons in a future improvement.

## Suggested Next Improvements

- Split parser, layout, renderer, and export code into separate JavaScript modules.
- Add unit tests for Terraform parsing, Docker Compose parsing, and draw.io XML generation.
- Use stable resource IDs based on Terraform addresses such as `aws_instance.web` instead of local names alone.
- Replace the Docker Compose regex parser with a YAML parser.
- Escape all user-controlled labels before inserting generated SVG markup.
- Add a small visual regression suite for sample diagrams.
- Add a real mobile navigation menu instead of hiding navigation links.
- Make privacy and analytics messaging consistent across the app and policy pages.

## Contributing

Issues and pull requests are welcome. Good contributions include:

- New supported AWS resource types
- Better parsing for Terraform relationships
- Docker Compose parser improvements
- Layout and export fixes
- Accessibility improvements
- Documentation and examples

When reporting a parser issue, include a small sanitized Terraform or Compose snippet that reproduces the problem.

## License

InfraSketch is released under the MIT License. See [LICENSE](LICENSE).
