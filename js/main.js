import { exportPng, exportSvg, generateDrawioXml } from './exporters.js';
import { svgToDrawio } from './svg-to-drawio.js';
import { computeStats } from './layout.js';
import { parseDockerCompose, parseTerraform, parseTerraformPlan, parseTerragrunt } from './parser.js';
import { buildVirtualFS, expandModules } from './moduleResolver.js';
import { renderDiagram } from './renderer.js';

let currentVirtualFS = null;
let autoFetchRegistry = false;

const SAMPLE_TERRAFORM = `# Production AWS Infrastructure
resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
}

resource "aws_internet_gateway" "gw" {
  vpc_id = aws_vpc.main.id
}

resource "aws_cloudfront_distribution" "cdn" {
  enabled = true
  origin { domain_name = aws_lb.frontend.dns_name }
}

resource "aws_route53_zone" "main" {
  name = "example.com"
}

resource "aws_subnet" "public" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.1.0/24"
  availability_zone = "us-east-1a"
  map_public_ip_on_launch = true
}

resource "aws_subnet" "private" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.10.0/24"
  availability_zone = "us-east-1a"
}

resource "aws_subnet" "data" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.20.0/24"
  availability_zone = "us-east-1a"
}

resource "aws_nat_gateway" "main" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public.id
}

resource "aws_eip" "nat" {
  domain = "vpc"
}

resource "aws_lb" "frontend" {
  name               = "prod-alb"
  load_balancer_type = "application"
  subnets            = [aws_subnet.public.id]
}

resource "aws_lb" "internal" {
  name               = "prod-nlb"
  load_balancer_type = "network"
  subnets            = [aws_subnet.private.id]
}

resource "aws_lb_target_group" "app" {
  name     = "app-tg"
  port     = 80
  vpc_id   = aws_vpc.main.id
}

resource "aws_security_group" "web" {
  name   = "web-sg"
  vpc_id = aws_vpc.main.id
}

resource "aws_security_group" "db" {
  name   = "db-sg"
  vpc_id = aws_vpc.main.id
}

resource "aws_eks_cluster" "main" {
  name     = "prod-cluster"
  role_arn = aws_iam_role.eks.arn
  vpc_config {
    subnet_ids = [aws_subnet.private.id]
  }
}

resource "aws_eks_node_group" "workers" {
  cluster_name = aws_eks_cluster.main.name
  node_role_arn = aws_iam_role.node.arn
  subnet_ids   = [aws_subnet.private.id]
}

resource "aws_lambda_function" "processor" {
  function_name = "order-processor"
  runtime       = "nodejs18.x"
  subnet_id     = aws_subnet.private.id
}

resource "aws_db_instance" "postgres" {
  identifier     = "prod-db"
  engine         = "postgres"
  subnet_id      = aws_subnet.data.id
}

resource "aws_elasticache_cluster" "redis" {
  cluster_id = "prod-redis"
  subnet_id  = aws_subnet.data.id
}

resource "aws_s3_bucket" "assets" {
  bucket = "prod-static-assets"
}

resource "aws_sqs_queue" "events" {
  name = "event-queue"
}

resource "aws_sns_topic" "alerts" {
  name = "infra-alerts"
}

resource "aws_iam_role" "eks" {
  name = "eks-cluster-role"
}

resource "aws_iam_role" "node" {
  name = "eks-node-role"
}

resource "aws_cloudwatch_log_group" "app" {
  name = "/eks/app"
}

resource "aws_kms_key" "secrets" {
  description = "Secrets encryption"
}
`;

const SAMPLE_DOCKER_COMPOSE = `services:
  web:
    image: nginx:alpine
    ports:
      - "8080:80"
    depends_on:
      - api

  api:
    image: node:20-alpine
    command: npm start
    environment:
      DATABASE_URL: postgres://app:secret@db:5432/app
      REDIS_URL: redis://cache:6379
    depends_on:
      db:
        condition: service_started
      cache:
        condition: service_started

  worker:
    image: node:20-alpine
    command: npm run worker
    depends_on:
      - api
      - cache

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: app
      POSTGRES_USER: app
      POSTGRES_PASSWORD: secret

  cache:
    image: redis:7-alpine
`;

// ── Complex example: Terraform modules (flattened for the parser) ─────────────
const SAMPLE_TERRAFORM_MODULES = `# Multi-module Terraform: VPC module + EKS module + RDS module
# (Resources shown as they would appear after module expansion)

# ── networking/main.tf ──────────────────────────────────────────────────────
resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true
}

resource "aws_internet_gateway" "gw" {
  vpc_id = aws_vpc.main.id
}

resource "aws_subnet" "public_a" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = "10.0.1.0/24"
  availability_zone       = "us-east-1a"
  map_public_ip_on_launch = true
}

resource "aws_subnet" "public_b" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = "10.0.2.0/24"
  availability_zone       = "us-east-1b"
  map_public_ip_on_launch = true
}

resource "aws_subnet" "private_a" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.10.0/24"
  availability_zone = "us-east-1a"
}

resource "aws_subnet" "private_b" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.11.0/24"
  availability_zone = "us-east-1b"
}

resource "aws_subnet" "data_a" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.20.0/24"
  availability_zone = "us-east-1a"
}

resource "aws_eip" "nat_a" { domain = "vpc" }
resource "aws_eip" "nat_b" { domain = "vpc" }

resource "aws_nat_gateway" "nat_a" {
  allocation_id = aws_eip.nat_a.id
  subnet_id     = aws_subnet.public_a.id
}

resource "aws_nat_gateway" "nat_b" {
  allocation_id = aws_eip.nat_b.id
  subnet_id     = aws_subnet.public_b.id
}

resource "aws_wafv2_web_acl" "main" {
  name  = "prod-waf"
  scope = "REGIONAL"
}

# ── compute/main.tf ─────────────────────────────────────────────────────────
resource "aws_lb" "frontend" {
  name               = "prod-alb"
  load_balancer_type = "application"
  subnets            = [aws_subnet.public_a.id, aws_subnet.public_b.id]
}

resource "aws_lb_target_group" "app" {
  name   = "app-tg"
  port   = 8080
  vpc_id = aws_vpc.main.id
}

resource "aws_security_group" "alb" {
  name   = "alb-sg"
  vpc_id = aws_vpc.main.id
}

resource "aws_security_group" "app" {
  name   = "app-sg"
  vpc_id = aws_vpc.main.id
}

resource "aws_security_group" "db" {
  name   = "db-sg"
  vpc_id = aws_vpc.main.id
}

resource "aws_eks_cluster" "main" {
  name     = "prod-cluster"
  role_arn = aws_iam_role.eks_cluster.arn
  vpc_config {
    subnet_ids         = [aws_subnet.private_a.id, aws_subnet.private_b.id]
    security_group_ids = [aws_security_group.app.id]
  }
}

resource "aws_eks_node_group" "system" {
  cluster_name   = aws_eks_cluster.main.name
  node_role_arn  = aws_iam_role.eks_nodes.arn
  subnet_ids     = [aws_subnet.private_a.id]
}

resource "aws_iam_role" "eks_cluster" { name = "eks-cluster-role" }
resource "aws_iam_role" "eks_nodes"   { name = "eks-nodes-role" }

resource "aws_ecr_repository" "app" { name = "prod/app" }

# ── data/main.tf ─────────────────────────────────────────────────────────────
resource "aws_db_instance" "postgres" {
  identifier     = "prod-db"
  engine         = "postgres"
  instance_class = "db.t3.medium"
  subnet_id      = aws_subnet.data_a.id
}

resource "aws_elasticache_replication_group" "redis" {
  replication_group_id = "prod-redis"
  node_type            = "cache.t3.micro"
  subnet_id            = aws_subnet.data_a.id
}

resource "aws_s3_bucket" "assets"  { bucket = "prod-static-assets" }
resource "aws_s3_bucket" "backups" { bucket = "prod-db-backups" }

# ── messaging/main.tf ────────────────────────────────────────────────────────
resource "aws_sqs_queue" "jobs"        { name = "job-queue" }
resource "aws_sqs_queue" "jobs_dlq"    { name = "job-queue-dlq" }
resource "aws_sns_topic" "alerts"      { name = "infra-alerts" }
resource "aws_sns_topic" "deployments" { name = "deploy-events" }

resource "aws_lambda_function" "worker" {
  function_name = "job-worker"
  runtime       = "nodejs20.x"
  subnet_id     = aws_subnet.private_a.id
}

resource "aws_kms_key" "secrets" { description = "Secrets Manager encryption" }

# ── observability/main.tf ────────────────────────────────────────────────────
resource "aws_cloudfront_distribution" "cdn" {
  enabled     = true
  origin { domain_name = aws_lb.frontend.dns_name }
}

resource "aws_route53_zone" "main" { name = "example.com" }

resource "aws_cloudwatch_log_group" "eks"    { name = "/aws/eks/prod-cluster/cluster" }
resource "aws_cloudwatch_log_group" "lambda" { name = "/aws/lambda/job-worker" }
resource "aws_cloudwatch_metric_alarm" "db_cpu" {
  alarm_name = "rds-cpu-high"
}
`;

// ── Complex example: multi-file serverless workflow ───────────────────────────
const SAMPLE_TERRAFORM_SERVERLESS = `# Serverless event-driven pipeline
# Combines: api.tf + processing.tf + storage.tf + iam.tf

# ── api.tf ───────────────────────────────────────────────────────────────────
resource "aws_cloudfront_distribution" "api_cdn" {
  enabled = true
  origin { domain_name = aws_lb.api.dns_name }
}

resource "aws_wafv2_web_acl" "api" {
  name  = "api-waf"
  scope = "REGIONAL"
}

resource "aws_route53_zone" "api" { name = "api.example.com" }

resource "aws_lb" "api" {
  name               = "api-alb"
  load_balancer_type = "application"
  subnets            = [aws_subnet.public.id]
}

resource "aws_lb_target_group" "api" {
  name   = "api-tg"
  port   = 443
  vpc_id = aws_vpc.main.id
}

resource "aws_vpc" "main"    { cidr_block = "10.0.0.0/16" }
resource "aws_subnet" "public"  { vpc_id = aws_vpc.main.id  cidr_block = "10.0.1.0/24" }
resource "aws_subnet" "private" { vpc_id = aws_vpc.main.id  cidr_block = "10.0.2.0/24" }
resource "aws_internet_gateway" "gw" { vpc_id = aws_vpc.main.id }

# ── processing.tf ────────────────────────────────────────────────────────────
resource "aws_sqs_queue" "ingest"   { name = "ingest-queue" }
resource "aws_sqs_queue" "enrich"   { name = "enrich-queue" }
resource "aws_sqs_queue" "failed"   { name = "dead-letter-queue" }
resource "aws_sns_topic" "results"  { name = "result-events" }
resource "aws_sns_topic" "alerts"   { name = "pipeline-alerts" }

resource "aws_lambda_function" "ingest" {
  function_name = "ingest-handler"
  runtime       = "python3.11"
  subnet_id     = aws_subnet.private.id
  role          = aws_iam_role.lambda_exec.arn
}

resource "aws_lambda_function" "enrich" {
  function_name = "enrich-handler"
  runtime       = "python3.11"
  subnet_id     = aws_subnet.private.id
  role          = aws_iam_role.lambda_exec.arn
}

resource "aws_lambda_function" "notify" {
  function_name = "notify-handler"
  runtime       = "python3.11"
  subnet_id     = aws_subnet.private.id
  role          = aws_iam_role.lambda_exec.arn
}

# ── storage.tf ───────────────────────────────────────────────────────────────
resource "aws_dynamodb_table" "events" {
  name     = "pipeline-events"
  hash_key = "event_id"
}

resource "aws_s3_bucket" "raw"       { bucket = "pipeline-raw-data" }
resource "aws_s3_bucket" "processed" { bucket = "pipeline-processed" }
resource "aws_elasticache_cluster" "session" { cluster_id = "session-cache" }

# ── iam.tf ───────────────────────────────────────────────────────────────────
resource "aws_iam_role" "lambda_exec" { name = "lambda-exec-role" }
resource "aws_kms_key" "pipeline"     { description = "Pipeline data encryption" }
resource "aws_security_group" "lambda" { vpc_id = aws_vpc.main.id }
resource "aws_cloudwatch_log_group" "pipeline" { name = "/aws/lambda/pipeline" }
`;

// ── Complex Docker example: microservices platform ─────────────────────────
const SAMPLE_DOCKER_MICROSERVICES = `services:
  # API Gateway / Reverse Proxy
  gateway:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    depends_on:
      - auth
      - api

  # Auth service
  auth:
    image: node:20-alpine
    command: npm start
    environment:
      DB_URL: postgres://auth:secret@auth-db:5432/auth
      REDIS_URL: redis://session-cache:6379
      JWT_SECRET: changeme
    depends_on:
      auth-db:
        condition: service_healthy
      session-cache:
        condition: service_started

  # Core API
  api:
    image: node:20-alpine
    command: npm start
    environment:
      DB_URL: postgres://app:secret@app-db:5432/app
      QUEUE_URL: amqp://mq:5672
    depends_on:
      app-db:
        condition: service_healthy
      mq:
        condition: service_started
      auth:
        condition: service_started

  # Background worker
  worker:
    image: node:20-alpine
    command: npm run worker
    depends_on:
      - mq
      - app-db

  # Auth database
  auth-db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: auth
      POSTGRES_USER: auth
      POSTGRES_PASSWORD: secret

  # Application database
  app-db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: app
      POSTGRES_USER: app
      POSTGRES_PASSWORD: secret

  # Session cache
  session-cache:
    image: redis:7-alpine

  # Message broker
  mq:
    image: rabbitmq:3-management-alpine
    ports:
      - "15672:15672"

  # Search engine
  search:
    image: elasticsearch:8.11.0
    depends_on:
      - app-db
`;

// ── Azure sample ──────────────────────────────────────────────────────────────
const SAMPLE_TERRAFORM_AZURE = `# Production Azure Infrastructure
resource "azurerm_virtual_network" "main" {
  name                = "prod-vnet"
  resource_group_name = "prod-rg"
  location            = "eastus"
  address_space       = ["10.0.0.0/16"]
}

resource "azurerm_subnet" "public" {
  name                 = "public"
  resource_group_name  = "prod-rg"
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = ["10.0.1.0/24"]
}

resource "azurerm_subnet" "private" {
  name                 = "private"
  resource_group_name  = "prod-rg"
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = ["10.0.2.0/24"]
}

resource "azurerm_subnet" "data" {
  name                 = "data"
  resource_group_name  = "prod-rg"
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = ["10.0.3.0/24"]
}

resource "azurerm_cdn_frontdoor_profile" "main" {
  name                = "prod-frontdoor"
  resource_group_name = "prod-rg"
  sku_name            = "Standard_AzureFrontDoor"
}

resource "azurerm_dns_zone" "main" {
  name                = "example.com"
  resource_group_name = "prod-rg"
}

resource "azurerm_application_gateway" "main" {
  name                = "prod-appgw"
  resource_group_name = "prod-rg"
  location            = "eastus"
  gateway_ip_configuration {
    name      = "appgw-ip-config"
    subnet_id = azurerm_subnet.public.id
  }
}

resource "azurerm_kubernetes_cluster" "main" {
  name                = "prod-aks"
  resource_group_name = "prod-rg"
  location            = "eastus"
  default_node_pool {
    name           = "default"
    node_count     = 3
    vnet_subnet_id = azurerm_subnet.private.id
  }
  identity { type = "SystemAssigned" }
}

resource "azurerm_linux_web_app" "api" {
  name                = "prod-api"
  resource_group_name = "prod-rg"
  location            = "eastus"
  subnet_id           = azurerm_subnet.private.id
}

resource "azurerm_linux_function_app" "processor" {
  name                = "prod-processor"
  resource_group_name = "prod-rg"
  location            = "eastus"
  subnet_id           = azurerm_subnet.private.id
}

resource "azurerm_mssql_server" "main" {
  name                = "prod-sql"
  resource_group_name = "prod-rg"
  location            = "eastus"
}

resource "azurerm_postgresql_flexible_server" "main" {
  name                = "prod-postgres"
  resource_group_name = "prod-rg"
  location            = "eastus"
  subnet_id           = azurerm_subnet.data.id
}

resource "azurerm_redis_cache" "main" {
  name                = "prod-redis"
  resource_group_name = "prod-rg"
  location            = "eastus"
}

resource "azurerm_storage_account" "main" {
  name                     = "prodstorage"
  resource_group_name      = "prod-rg"
  location                 = "eastus"
  account_tier             = "Standard"
  account_replication_type = "LRS"
}

resource "azurerm_servicebus_namespace" "main" {
  name                = "prod-sb"
  resource_group_name = "prod-rg"
  location            = "eastus"
}

resource "azurerm_eventhub_namespace" "main" {
  name                = "prod-eh"
  resource_group_name = "prod-rg"
  location            = "eastus"
}

resource "azurerm_network_security_group" "app" {
  name                = "app-nsg"
  resource_group_name = "prod-rg"
  location            = "eastus"
}

resource "azurerm_key_vault" "main" {
  name                = "prod-kv"
  resource_group_name = "prod-rg"
  location            = "eastus"
  sku_name            = "standard"
}

resource "azurerm_log_analytics_workspace" "main" {
  name                = "prod-logs"
  resource_group_name = "prod-rg"
  location            = "eastus"
}

resource "azurerm_application_insights" "main" {
  name                = "prod-insights"
  resource_group_name = "prod-rg"
  location            = "eastus"
  workspace_id        = azurerm_log_analytics_workspace.main.id
}
`;

const SAMPLE_TERRAGRUNT = `# --- unit: vpc ---
terraform {
  source = "git::https://github.com/myorg/tf-modules//vpc?ref=v2.1.0"
}

# --- unit: rds ---
terraform {
  source = "git::https://github.com/myorg/tf-modules//rds?ref=v2.1.0"
}

dependency "vpc" {
  config_path = "../vpc"
}

inputs = {
  vpc_id = dependency.vpc.outputs.vpc_id
}

# --- unit: eks ---
terraform {
  source = "git::https://github.com/myorg/tf-modules//eks?ref=v2.1.0"
}

dependency "vpc" {
  config_path = "../vpc"
}

inputs = {
  vpc_id = dependency.vpc.outputs.vpc_id
}

# --- unit: app ---
terraform {
  source = "git::https://github.com/myorg/tf-modules//ecs-service?ref=v2.1.0"
}

dependency "vpc" {
  config_path = "../vpc"
}

dependency "rds" {
  config_path = "../rds"
}

dependency "eks" {
  config_path = "../eks"
}

inputs = {
  vpc_id   = dependency.vpc.outputs.vpc_id
  db_url   = dependency.rds.outputs.endpoint
  cluster  = dependency.eks.outputs.cluster_name
}
`;

const SAMPLE_TERRAFORM_GCP = `# GCP Production Stack: VPC + GKE + Cloud SQL + GCS + Pub/Sub + Cloud Run
resource "google_compute_network" "main" {
  name                    = "prod-vpc"
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "gke" {
  name          = "gke-subnet"
  network       = google_compute_network.main.id
  ip_cidr_range = "10.0.1.0/24"
}

resource "google_compute_subnetwork" "services" {
  name          = "services-subnet"
  network       = google_compute_network.main.id
  ip_cidr_range = "10.0.2.0/24"
}

resource "google_compute_firewall" "allow_internal" {
  name    = "allow-internal"
  network = google_compute_network.main.id
}

resource "google_container_cluster" "primary" {
  name       = "prod-gke"
  subnetwork = google_compute_subnetwork.gke.id
  network    = google_compute_network.main.id
}

resource "google_container_node_pool" "primary_nodes" {
  name    = "primary-pool"
  cluster = google_container_cluster.primary.id
}

resource "google_cloud_run_v2_service" "api" {
  name = "api-service"
}

resource "google_cloudfunctions2_function" "processor" {
  name = "event-processor"
}

resource "google_sql_database_instance" "postgres" {
  name             = "prod-postgres"
  database_version = "POSTGRES_15"
}

resource "google_redis_instance" "cache" {
  name           = "prod-cache"
  memory_size_gb = 4
}

resource "google_storage_bucket" "assets" {
  name = "prod-assets"
}

resource "google_bigquery_dataset" "analytics" {
  dataset_id = "analytics"
}

resource "google_pubsub_topic" "events" {
  name = "events-topic"
}

resource "google_pubsub_subscription" "events_sub" {
  name  = "events-sub"
  topic = google_pubsub_topic.events.id
}

resource "google_secret_manager_secret" "db_password" {
  secret_id = "db-password"
}

resource "google_kms_key_ring" "main" {
  name = "prod-keyring"
}

resource "google_dns_managed_zone" "public" {
  name     = "prod-zone"
  dns_name = "example.com."
}

resource "google_monitoring_alert_policy" "high_latency" {
  display_name = "High Latency"
}

resource "google_service_account" "gke_sa" {
  account_id = "gke-workload"
}
`;

const EXTRA_SAMPLES = {
    terraform: {
        basic: { label: 'Production AWS stack', code: SAMPLE_TERRAFORM },
        azure: { label: 'Production Azure stack (VNet + AKS + SQL + messaging)', code: SAMPLE_TERRAFORM_AZURE },
        gcp: { label: 'Production GCP stack (VPC + GKE + SQL + Pub/Sub)', code: SAMPLE_TERRAFORM_GCP },
        modules: { label: 'Multi-module AWS (VPC + EKS + RDS + serverless)', code: SAMPLE_TERRAFORM_MODULES },
        serverless: { label: 'AWS serverless pipeline (multi-file)', code: SAMPLE_TERRAFORM_SERVERLESS },
    },
    docker: {
        basic: { label: 'Web app (nginx + API + DB + cache)', code: SAMPLE_DOCKER_COMPOSE },
        microservices: { label: 'Microservices platform (9 services)', code: SAMPLE_DOCKER_MICROSERVICES },
    },
    terragrunt: {
        basic: { label: 'Multi-unit stack (VPC + RDS + EKS + app)', code: SAMPLE_TERRAGRUNT },
    },
};

const PLACEHOLDERS = {
    terraform: `# Paste Terraform HCL  — or  terraform show -json tfplan output

resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
}

resource "aws_subnet" "public" {
  vpc_id     = aws_vpc.main.id
  cidr_block = "10.0.1.0/24"
}

resource "aws_instance" "web" {
  ami           = "ami-0c55b159cbfafe1f0"
  instance_type = "t3.medium"
  subnet_id     = aws_subnet.public.id
}`,
    docker: `# Paste your docker-compose.yml here...

services:
  web:
    image: nginx:alpine
    ports:
      - "8080:80"
    depends_on:
      - api

  api:
    image: node:20-alpine
    depends_on:
      - db

  db:
    image: postgres:16-alpine`,
    terragrunt: `# Paste terragrunt.hcl content — separate multiple units with:
# --- unit: name ---

# --- unit: vpc ---
terraform {
  source = "git::https://github.com/myorg/tf-modules//vpc"
}

# --- unit: app ---
terraform {
  source = "git::https://github.com/myorg/tf-modules//ecs-service"
}

dependency "vpc" {
  config_path = "../vpc"
}`,
};

const codeInput = document.getElementById('code-input');
const generateButton = document.getElementById('btn-generate');
const exampleSelect = document.getElementById('example-select');
const btnLoadSample = document.getElementById('btn-load-sample');
const placeholder = document.getElementById('placeholder');
const loading = document.getElementById('loading');
const diagramSvg = document.getElementById('diagram-svg');
const statsBar = document.getElementById('stats-bar');
const shareButton = document.getElementById('btn-share');
const zoomControls = document.getElementById('zoom-controls');
const resourceTablePanel = document.getElementById('resource-table-panel');
const resourceTableBody = document.getElementById('resource-table-body');
const toggleTableButton = document.getElementById('btn-toggle-table');
let lastParsed = null;
let tableOpen = false;

// ── Zoom controller ──────────────────────────────────────────────────────────

const zoomState = { scale: 1, tx: 0, ty: 0 };

function applyZoom() {
    const layer = diagramSvg.querySelector('.zoom-layer');
    if (layer) layer.setAttribute('transform', `translate(${zoomState.tx},${zoomState.ty}) scale(${zoomState.scale})`);
}

function resetZoom() {
    zoomState.scale = 1;
    zoomState.tx = 0;
    zoomState.ty = 0;
    applyZoom();
}

function stepZoom(factor) {
    const vb = diagramSvg.viewBox.baseVal;
    const cx = vb.width / 2;
    const cy = vb.height / 2;
    const newScale = Math.min(Math.max(zoomState.scale * factor, 0.1), 8);
    zoomState.tx = cx - (cx - zoomState.tx) * newScale / zoomState.scale;
    zoomState.ty = cy - (cy - zoomState.ty) * newScale / zoomState.scale;
    zoomState.scale = newScale;
    applyZoom();
}

(function initZoomListeners() {
    diagramSvg.addEventListener('wheel', (e) => {
        if (diagramSvg.style.display === 'none') return;
        e.preventDefault();
        const rect = diagramSvg.getBoundingClientRect();
        const vb = diagramSvg.viewBox.baseVal;
        const mx = (e.clientX - rect.left) / rect.width * vb.width;
        const my = (e.clientY - rect.top) / rect.height * vb.height;
        const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
        const newScale = Math.min(Math.max(zoomState.scale * factor, 0.1), 8);
        zoomState.tx = mx - (mx - zoomState.tx) * newScale / zoomState.scale;
        zoomState.ty = my - (my - zoomState.ty) * newScale / zoomState.scale;
        zoomState.scale = newScale;
        applyZoom();
    }, { passive: false });

    let dragging = false;
    let startClientX, startClientY, startTx, startTy;

    diagramSvg.addEventListener('mousedown', (e) => {
        if (e.button !== 0 || diagramSvg.style.display === 'none') return;
        dragging = true;
        startClientX = e.clientX;
        startClientY = e.clientY;
        startTx = zoomState.tx;
        startTy = zoomState.ty;
        diagramSvg.style.cursor = 'grabbing';
        e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        const rect = diagramSvg.getBoundingClientRect();
        const vb = diagramSvg.viewBox.baseVal;
        const svgPerPx = vb.width / rect.width;
        zoomState.tx = startTx + (e.clientX - startClientX) * svgPerPx;
        zoomState.ty = startTy + (e.clientY - startClientY) * svgPerPx;
        applyZoom();
    });

    window.addEventListener('mouseup', () => {
        if (!dragging) return;
        dragging = false;
        diagramSvg.style.cursor = '';
    });
}());

function encodeState(type, code) {
    try {
        const json = JSON.stringify({ type, code });
        return btoa(unescape(encodeURIComponent(json)));
    } catch {
        return null;
    }
}

function decodeState(hash) {
    try {
        const b64 = hash.replace(/^#/, '');
        if (!b64) return null;
        return JSON.parse(decodeURIComponent(escape(atob(b64))));
    } catch {
        return null;
    }
}

function loadFromHash() {
    const state = decodeState(location.hash);
    if (!state || !state.code || !state.type) return false;

    const tab = document.querySelector(`.input-tab[data-type="${state.type}"]`);
    if (!tab) return false;

    document.querySelectorAll('.input-tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    updateEditorForType(state.type);
    codeInput.value = state.code;
    generateButton.click();
    return true;
}

function activeInputType() {
    return document.querySelector('.input-tab.active').dataset.type;
}

function updateStats(resources) {
    const stats = computeStats(resources);
    document.getElementById('stat-vpc').textContent = stats.vpc;
    document.getElementById('stat-compute').textContent = stats.compute;
    document.getElementById('stat-db').textContent = stats.db;
    document.getElementById('stat-storage').textContent = stats.storage;
    document.getElementById('stat-lb').textContent = stats.lb;
    statsBar.style.display = 'flex';
}

function populateResourceTable(resources) {
    resourceTableBody.innerHTML = '';
    resources.forEach((r, i) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="col-num">${i + 1}</td>
            <td>${r.name}</td>
            <td class="col-type">${r.type}</td>
            <td><span class="cat-badge"><span class="cat-dot" style="background:${r.color}"></span>${r.category}</span></td>
        `;
        resourceTableBody.appendChild(tr);
    });
}

function hideDiagram() {
    diagramSvg.style.display = 'none';
    statsBar.style.display = 'none';
    zoomControls.style.display = 'none';
    resourceTablePanel.style.display = 'none';
    tableOpen = false;
    toggleTableButton.textContent = 'Resources ▾';
}

async function parseCode(code) {
    const type = activeInputType();
    if (type === 'docker') return parseDockerCompose(code);
    if (type === 'terragrunt') return parseTerragrunt(code);
    if (code.trimStart().startsWith('{')) {
        const planResult = parseTerraformPlan(code);
        if (planResult !== null) return planResult;
    }
    const rootParsed = parseTerraform(code);
    return expandModules(rootParsed, code, { virtualFS: currentVirtualFS, fetchRegistry: autoFetchRegistry });
}

function populateExampleSelect(type) {
    const extras = EXTRA_SAMPLES[type] || {};
    exampleSelect.innerHTML = '<option value="">Load an example...</option>';
    for (const [key, { label }] of Object.entries(extras)) {
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = label;
        exampleSelect.appendChild(opt);
    }
}

function updateEditorForType(type, previousType = null) {
    const currentText = codeInput.value.trim();
    const previousSamples = previousType ? Object.values(EXTRA_SAMPLES[previousType] || {}).map((s) => s.code.trim()) : [];
    const isShowingSample = previousSamples.some((s) => s === currentText);

    codeInput.placeholder = PLACEHOLDERS[type];
    populateExampleSelect(type);
    if (btnLoadSample) btnLoadSample.textContent = type === 'docker' ? 'Load Docker sample' : type === 'terragrunt' ? 'Load Terragrunt sample' : 'Load Terraform sample';

    if (isShowingSample || !currentText) {
        codeInput.value = '';
    }
}

exampleSelect.addEventListener('change', () => {
    const type = activeInputType();
    const key = exampleSelect.value;
    if (!key) return;
    const sample = EXTRA_SAMPLES[type]?.[key];
    if (sample) codeInput.value = sample.code;
});

// Load sample button - loads the first example for the current type
btnLoadSample.addEventListener('click', () => {
    const type = activeInputType();
    const extras = EXTRA_SAMPLES[type] || {};
    const firstKey = Object.keys(extras)[0];
    if (firstKey) {
        const sample = extras[firstKey];
        codeInput.value = sample.code;
    }
});

generateButton.addEventListener('click', async () => {
    const code = codeInput.value.trim();
    if (!code) {
        alert('Please paste some Terraform or docker-compose code first.');
        return;
    }

    placeholder.style.display = 'none';
    hideDiagram();
    loading.classList.add('active');

    try {
        const parsed = await parseCode(code);
        const layout = renderDiagram(parsed, diagramSvg);
        loading.classList.remove('active');

        if (!layout) {
            placeholder.style.display = 'block';
            alert('No supported resources found. Check your code and try again.');
            return;
        }

        lastParsed = parsed;
        window._lastParsed = parsed;
        resetZoom();
        zoomControls.style.display = 'flex';
        updateStats(parsed.resources);
        populateResourceTable(parsed.resources);
    } catch (error) {
        loading.classList.remove('active');
        placeholder.style.display = 'block';
        alert(error.message || 'Could not generate the diagram.');
    }
});

document.querySelectorAll('.input-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
        const previousType = activeInputType();
        document.querySelectorAll('.input-tab').forEach((item) => item.classList.remove('active'));
        tab.classList.add('active');
        updateEditorForType(tab.dataset.type, previousType);
        updateModuleOptionsVisibility(tab.dataset.type);
    });
});

updateEditorForType(activeInputType());

// ── Module expansion UI ───────────────────────────────────────────────────────

const moduleOptionsBar = document.getElementById('module-options');
const zipUploadInput = document.getElementById('zip-upload-input');
const zipStatusText = document.getElementById('zip-status-text');
const zipUploadLabel = document.getElementById('zip-upload-label');
const btnClearZip = document.getElementById('btn-clear-zip');
const toggleRegistry = document.getElementById('toggle-registry');

function updateModuleOptionsVisibility(type) {
    if (!moduleOptionsBar) return;
    moduleOptionsBar.style.display = (type === 'terraform') ? 'flex' : 'none';
}

updateModuleOptionsVisibility(activeInputType());

zipUploadInput?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
        currentVirtualFS = await buildVirtualFS(file);
        const tfCount = currentVirtualFS.size;
        zipStatusText.textContent = `${file.name} (${tfCount} .tf file${tfCount !== 1 ? 's' : ''})`;
        zipUploadLabel?.classList.add('loaded');
        btnClearZip.hidden = false;
    } catch (err) {
        alert('Could not read ZIP: ' + (err.message || err));
        currentVirtualFS = null;
    }
    zipUploadInput.value = '';
});

btnClearZip?.addEventListener('click', () => {
    currentVirtualFS = null;
    zipStatusText.textContent = 'Upload modules ZIP';
    zipUploadLabel?.classList.remove('loaded');
    btnClearZip.hidden = true;
});

toggleRegistry?.addEventListener('change', () => {
    autoFetchRegistry = toggleRegistry.checked;
});

document.getElementById('btn-export-png').addEventListener('click', async () => {
    if (diagramSvg.style.display === 'none') return;

    try {
        await exportPng(diagramSvg);
    } catch (error) {
        alert(error.message || 'Could not export PNG.');
    }
});

document.getElementById('btn-export-svg').addEventListener('click', async () => {
    if (diagramSvg.style.display === 'none') return;

    try {
        await exportSvg(diagramSvg);
    } catch (error) {
        alert(error.message || 'Could not export SVG.');
    }
});

// ── draw.io preview modal ─────────────────────────────────────────────────────

let drawioModalXml = null;
let drawioModalFilename = 'infrasketch-diagram.drawio';

const drawioModal = document.getElementById('drawio-modal');
const drawioModalBody = document.getElementById('drawio-modal-body');
const drawioModalBadge = document.getElementById('drawio-modal-badge');

function openDrawioModal(xml, filename, previewNode) {
    drawioModalXml = xml;
    drawioModalFilename = filename;
    drawioModalBody.innerHTML = '';
    drawioModalBody.appendChild(previewNode);
    drawioModalBadge.textContent = filename;
    drawioModal.hidden = false;
}

function closeDrawioModal() {
    drawioModal.hidden = true;
    drawioModalBody.innerHTML = '';
    drawioModalXml = null;
}

document.getElementById('drawio-modal-close').addEventListener('click', closeDrawioModal);
document.getElementById('drawio-modal-cancel').addEventListener('click', closeDrawioModal);
drawioModal.addEventListener('click', (e) => { if (e.target === drawioModal) closeDrawioModal(); });

document.getElementById('drawio-modal-download').addEventListener('click', () => {
    if (!drawioModalXml) return;
    const blob = new Blob([drawioModalXml], { type: 'application/xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.download = drawioModalFilename;
    a.href = url;
    a.click();
    URL.revokeObjectURL(url);
});

document.getElementById('btn-export-drawio').addEventListener('click', () => {
    if (!lastParsed) {
        alert('Generate a diagram first.');
        return;
    }

    const xml = generateDrawioXml(lastParsed);
    if (!xml) {
        alert('No resources to export.');
        return;
    }

    const svgClone = diagramSvg.cloneNode(true);
    svgClone.removeAttribute('id');
    svgClone.style.display = '';
    svgClone.style.maxWidth = '100%';
    const zoomLayer = svgClone.querySelector('.zoom-layer');
    if (zoomLayer) zoomLayer.setAttribute('transform', '');

    openDrawioModal(xml, 'infrasketch-diagram.drawio', svgClone);
});

shareButton.addEventListener('click', () => {
    const code = codeInput.value.trim();
    if (!code) {
        alert('Paste some code first, then share.');
        return;
    }

    const hash = encodeState(activeInputType(), code);
    if (!hash) return;

    history.replaceState(null, '', `#${hash}`);
    const url = location.href;

    navigator.clipboard.writeText(url).then(() => {
        shareButton.textContent = 'Copied!';
        shareButton.classList.add('copied');
        setTimeout(() => {
            shareButton.textContent = 'Share';
            shareButton.classList.remove('copied');
        }, 2000);
    }).catch(() => {
        prompt('Copy this link:', url);
    });
});

document.getElementById('btn-zoom-in').addEventListener('click', () => stepZoom(1.25));
document.getElementById('btn-zoom-out').addEventListener('click', () => stepZoom(1 / 1.25));
document.getElementById('btn-zoom-reset').addEventListener('click', resetZoom);

toggleTableButton.addEventListener('click', () => {
    tableOpen = !tableOpen;
    resourceTablePanel.style.display = tableOpen ? 'block' : 'none';
    toggleTableButton.textContent = tableOpen ? 'Resources ▴' : 'Resources ▾';
});

// ── SVG → draw.io import ─────────────────────────────────────────────────────

const svgImportInput = document.getElementById('svg-import-input');

document.getElementById('btn-svg-to-drawio').addEventListener('click', () => {
    svgImportInput.value = '';
    svgImportInput.click();
});

svgImportInput.addEventListener('change', () => {
    const file = svgImportInput.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const svgText = e.target.result;
            const xml = svgToDrawio(svgText);

            const parser = new DOMParser();
            const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
            const svgEl = svgDoc.documentElement.cloneNode(true);
            svgEl.style.maxWidth = '100%';
            svgEl.style.height = 'auto';

            const filename = file.name.replace(/\.svg$/i, '') + '.drawio';
            openDrawioModal(xml, filename, svgEl);
        } catch (err) {
            alert('Could not convert SVG: ' + (err.message || err));
        }
    };
    reader.readAsText(file);
});

loadFromHash();
