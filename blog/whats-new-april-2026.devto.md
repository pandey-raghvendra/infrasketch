---
title: "What's New in InfraSketch — April 2026: Interactive Editor, GCP Support & More"
published: true
description: "Interactive drag-and-drop diagram editor, full GCP support (23 resource types), new AWS networking resources, data zone visualization, toast notifications, and UI polish — all shipped this month."
tags: terraform, devops, opensource, cloudinfrastructure
canonical_url: https://infrasketch.cloud/blog/whats-new-april-2026.html
cover_image: https://infrasketch.cloud/assets/og-image.png
---

This is a big update for [InfraSketch](https://infrasketch.cloud) — the free, open-source, browser-based tool that generates architecture diagrams from Terraform HCL, plan JSON, Terragrunt, and docker-compose.yml.

Here's everything that shipped this month.

---

## Interactive Diagram Editor

The most requested feature since launch.

After generating a diagram, click **Edit** in the toolbar. In edit mode you can drag any node to reposition it — connection arrows update live as you drag, following both endpoints in real time. Click **Reset Layout** to restore the original auto-layout at any point.

A few details worth knowing:

- Works correctly at any zoom level — the coordinate math accounts for the current scale and pan offset
- In edit mode, pan is disabled on nodes (so you can drag them) but still works on empty canvas areas
- Exported PNG, SVG, and draw.io XML all reflect your repositioned layout

---

## Full GCP Support — 23 Resource Types

InfraSketch now supports Google Cloud Terraform resources across all major categories, with official Google Cloud category icons:

| Category | Terraform types |
|---|---|
| Networking | `google_compute_network`, `google_compute_subnetwork`, `google_compute_firewall`, `google_compute_router`, `google_compute_address` |
| Compute | `google_compute_instance`, `google_compute_instance_group`, `google_container_cluster`, `google_container_node_pool` |
| Serverless | `google_cloud_run_v2_service`, `google_cloudfunctions2_function` |
| Data | `google_sql_database_instance`, `google_bigquery_dataset`, `google_spanner_instance`, `google_bigtable_instance`, `google_redis_instance` |
| Storage | `google_storage_bucket` |
| Security | `google_kms_key_ring`, `google_secret_manager_secret`, `google_service_account` |
| Messaging | `google_pubsub_topic`, `google_pubsub_subscription` |
| Observability | `google_monitoring_alert_policy`, `google_logging_metric` |

GCP resources follow the same layout logic as AWS and Azure: VPC networks become containment boxes, Pub/Sub lands in the Messaging zone, security resources cluster in the Security zone.

---

## New AWS Networking Resources

Four resource types that commonly appear in real-world Terraform configs were previously silently dropped from diagrams. They're now supported:

**Route Tables** — `aws_route_table`, `aws_route_table_association`

**Transit Gateway** — `aws_transit_gateway`, `aws_transit_gateway_attachment`, `aws_transit_gateway_vpc_attachment`

**VPN Gateway** — `aws_vpn_gateway`, `aws_vpn_connection`, `aws_customer_gateway`

**Network Interfaces** — `aws_network_interface`, `aws_network_interface_attachment`

If you've been pasting real production configs and wondering why certain networking resources didn't appear — this is the fix.

---

## Data Zone Visualization

Database and storage resources — RDS, DynamoDB, ElastiCache, S3, Cloud SQL, BigQuery, and all the others — now render inside a labelled **DATA** zone box.

Previously these resources appeared in the diagram without any visual grouping, making it hard to distinguish the data tier from compute at a glance. The zone uses the same dashed-border pattern as the existing Internet, Messaging, and Security zones.

---

## Toast Notifications

Every error and confirmation in InfraSketch previously used the browser's built-in `alert()` dialog — a blocking modal that interrupts your flow.

All nine of those alerts are replaced with in-page toast notifications that appear at the bottom of the screen. They dismiss automatically after a few seconds, or on click. Parse errors now give specific guidance — if you paste `terraform plan` text output instead of JSON, you'll see:

> *"Looks like terraform plan text output — use `terraform show -json tfplan` instead."*

…rather than the generic "no resources found."

---

## UI Polish

A set of smaller visual improvements:

- **Generate button gradient** — flat green → teal-to-blue gradient with a stronger glow on hover
- **Node hover animation** — hovering a resource node scales it up slightly with a green drop shadow
- **Code editor focus indicator** — green left border when the textarea is focused
- **Diagram panel accent border** — subtle green top border distinguishes the diagram panel from the editor panel
- **Export toolbar separator** — thin vertical divider separates Share/Edit from PNG/SVG/draw.io buttons
- **Edit button default state** — no longer shows a permanent accent border before a diagram is generated
- **Feature card hover** — homepage cards now pick up a subtle green background tint on hover

---

## What's Next

- **Keyboard shortcuts** — `E` for edit mode, `R` for reset layout, `Escape` to deselect
- **Snap-to-grid** — hold Shift while dragging to snap to a 16px grid
- **Multi-select** — Shift-click to move multiple nodes as a group
- **GCP zone grouping** — region/zone containment boxes for GCP
- **CloudFormation support** — parsing `.yaml` CloudFormation stacks

---

InfraSketch is fully open source under AGPL-3.0. No account required, no backend, everything runs in your browser.

**→ [Try it at infrasketch.cloud](https://infrasketch.cloud)**  
**→ [GitHub](https://github.com/pandey-raghvendra/infrasketch)**

If you have a resource type that's missing from your diagrams or a workflow that doesn't work as expected, open an issue — real-world Terraform configs are the best test cases.
