import { exportPng, exportSvg, generateDrawioXml } from './exporters.js';
import { svgToDrawio } from './svg-to-drawio.js';
import { computeStats } from './layout.js';
import { parseCloudFormation, parseDockerCompose, parsePulumi, parseTerraform, parseTerraformPlan, parseTerragrunt } from './parser.js';
import { buildVirtualFS, expandModules } from './moduleResolver.js';
import { generateMermaid } from './mermaid-export.js';
import { renderDiagram } from './renderer.js';
import { initEditor, destroyEditor, resetLayout } from './editor.js';

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

const SAMPLE_CDK = `{
  "Resources": {
    "VPCB9E5F0B4": {
      "Type": "AWS::EC2::VPC",
      "Properties": { "CidrBlock": "10.0.0.0/16", "EnableDnsHostnames": true }
    },
    "PublicSubnet1B4246D30": {
      "Type": "AWS::EC2::Subnet",
      "Properties": { "VpcId": { "Ref": "VPCB9E5F0B4" }, "CidrBlock": "10.0.0.0/18", "MapPublicIpOnLaunch": true }
    },
    "PrivateSubnet1BCA10E0": {
      "Type": "AWS::EC2::Subnet",
      "Properties": { "VpcId": { "Ref": "VPCB9E5F0B4" }, "CidrBlock": "10.0.128.0/18" }
    },
    "VPCIGWB7E252D3": { "Type": "AWS::EC2::InternetGateway" },
    "NatGatewayEIP": { "Type": "AWS::EC2::EIP" },
    "NatGateway": {
      "Type": "AWS::EC2::NatGateway",
      "Properties": { "SubnetId": { "Ref": "PublicSubnet1B4246D30" }, "AllocationId": { "Fn::GetAtt": ["NatGatewayEIP", "AllocationId"] } }
    },
    "AppLoadBalancer": {
      "Type": "AWS::ElasticLoadBalancingV2::LoadBalancer",
      "Properties": { "Subnets": [{ "Ref": "PublicSubnet1B4246D30" }] }
    },
    "AppTargetGroup": {
      "Type": "AWS::ElasticLoadBalancingV2::TargetGroup",
      "Properties": { "VpcId": { "Ref": "VPCB9E5F0B4" } }
    },
    "EKSCluster9EE0221C": {
      "Type": "AWS::EKS::Cluster",
      "Properties": {
        "RoleArn": { "Fn::GetAtt": ["ClusterRoleFA261979", "Arn"] },
        "ResourcesVpcConfig": { "SubnetIds": [{ "Ref": "PrivateSubnet1BCA10E0" }] }
      }
    },
    "ClusterRoleFA261979": { "Type": "AWS::IAM::Role" },
    "DatabaseB269D8BB": {
      "Type": "AWS::RDS::DBInstance",
      "Properties": { "DBSubnetGroupName": { "Ref": "DatabaseSubnetGroup" } }
    },
    "DatabaseSubnetGroup": {
      "Type": "AWS::RDS::DBSubnetGroup",
      "Properties": { "SubnetIds": [{ "Ref": "PrivateSubnet1BCA10E0" }] }
    },
    "CacheCluster": {
      "Type": "AWS::ElastiCache::ReplicationGroup",
      "Properties": { "SecurityGroupIds": [] }
    },
    "AppBucketB0BA7C80": { "Type": "AWS::S3::Bucket" },
    "AppQueueC7D94E80": { "Type": "AWS::SQS::Queue" },
    "AppTopicSNS": {
      "Type": "AWS::SNS::Topic",
      "Properties": {
        "Subscription": [{ "Endpoint": { "Fn::GetAtt": ["ProcessorFunctionC865E5A0", "Arn"] }, "Protocol": "lambda" }]
      }
    },
    "ProcessorFunctionC865E5A0": {
      "Type": "AWS::Lambda::Function",
      "Properties": {
        "Role": { "Fn::GetAtt": ["ProcessorRoleB9D5BCCE", "Arn"] },
        "Environment": {
          "Variables": {
            "BUCKET": { "Ref": "AppBucketB0BA7C80" },
            "QUEUE_URL": { "Ref": "AppQueueC7D94E80" }
          }
        }
      }
    },
    "ProcessorRoleB9D5BCCE": { "Type": "AWS::IAM::Role" },
    "EncryptionKeyA1B2C3": { "Type": "AWS::KMS::Key" },
    "AppDistributionCF": {
      "Type": "AWS::CloudFront::Distribution",
      "Properties": {
        "DistributionConfig": {
          "Origins": [{ "DomainName": { "Fn::GetAtt": ["AppLoadBalancer", "DNSName"] } }]
        }
      }
    }
  }
}`;

const SAMPLE_CLOUDFORMATION = `AWSTemplateFormatVersion: '2010-09-09'
Description: Production AWS stack — VPC, ECS, RDS, Lambda, SQS, SNS

Resources:
  VPC:
    Type: AWS::EC2::VPC
    Properties:
      CidrBlock: 10.0.0.0/16

  PublicSubnet:
    Type: AWS::EC2::Subnet
    Properties:
      VpcId: !Ref VPC
      CidrBlock: 10.0.1.0/24

  PrivateSubnet:
    Type: AWS::EC2::Subnet
    Properties:
      VpcId: !Ref VPC
      CidrBlock: 10.0.2.0/24

  InternetGateway:
    Type: AWS::EC2::InternetGateway

  AppSecurityGroup:
    Type: AWS::EC2::SecurityGroup
    Properties:
      VpcId: !Ref VPC

  AppLoadBalancer:
    Type: AWS::ElasticLoadBalancingV2::LoadBalancer
    Properties:
      Subnets:
        - !Ref PublicSubnet
      SecurityGroups:
        - !Ref AppSecurityGroup

  AppTargetGroup:
    Type: AWS::ElasticLoadBalancingV2::TargetGroup
    Properties:
      VpcId: !Ref VPC

  ECSCluster:
    Type: AWS::ECS::Cluster

  AppService:
    Type: AWS::ECS::Service
    Properties:
      Cluster: !Ref ECSCluster
      LoadBalancers:
        - TargetGroupArn: !Ref AppTargetGroup

  AppDatabase:
    Type: AWS::RDS::DBInstance
    Properties:
      DBSubnetGroupName: !Ref DBSubnetGroup

  DBSubnetGroup:
    Type: AWS::RDS::DBSubnetGroup
    Properties:
      SubnetIds:
        - !Ref PrivateSubnet

  AppCache:
    Type: AWS::ElastiCache::ReplicationGroup
    Properties:
      SecurityGroupIds:
        - !Ref AppSecurityGroup

  AppBucket:
    Type: AWS::S3::Bucket

  AppQueue:
    Type: AWS::SQS::Queue

  AppTopic:
    Type: AWS::SNS::Topic
    Properties:
      Subscription:
        - Endpoint: !GetAtt ProcessorFunction.Arn
          Protocol: lambda

  ProcessorFunction:
    Type: AWS::Lambda::Function
    Properties:
      Role: !GetAtt LambdaRole.Arn
      Environment:
        Variables:
          QUEUE_URL: !Ref AppQueue
          BUCKET: !Ref AppBucket
          DB_HOST: !GetAtt AppDatabase.Endpoint.Address

  LambdaRole:
    Type: AWS::IAM::Role

  EncryptionKey:
    Type: AWS::KMS::Key

  AppDistribution:
    Type: AWS::CloudFront::Distribution
    Properties:
      DistributionConfig:
        Origins:
          - DomainName: !GetAtt AppLoadBalancer.DNSName
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
    cloudformation: {
        basic: { label: 'Production AWS stack (VPC + ECS + RDS + Lambda + SQS)', code: SAMPLE_CLOUDFORMATION },
    },
    cdk: {
        basic: { label: 'Production AWS stack — cdk synth output (VPC + EKS + RDS + Lambda)', code: SAMPLE_CDK },
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
    cloudformation: `# Paste CloudFormation YAML or JSON template

AWSTemplateFormatVersion: '2010-09-09'
Resources:
  VPC:
    Type: AWS::EC2::VPC
    Properties:
      CidrBlock: 10.0.0.0/16

  PublicSubnet:
    Type: AWS::EC2::Subnet
    Properties:
      VpcId: !Ref VPC
      CidrBlock: 10.0.1.0/24

  WebServer:
    Type: AWS::EC2::Instance
    Properties:
      SubnetId: !Ref PublicSubnet`,
    pulumi: `// Paste Pulumi TypeScript or Python program

import * as aws from "@pulumi/aws";

const vpc = new aws.ec2.Vpc("main", {
    cidrBlock: "10.0.0.0/16",
});

const subnet = new aws.ec2.Subnet("public", {
    vpcId: vpc.id,
    cidrBlock: "10.0.1.0/24",
});

const web = new aws.ec2.Instance("web", {
    ami: "ami-0c55b159cbfafe1f0",
    instanceType: "t3.micro",
    subnetId: subnet.id,
});

const db = new aws.rds.Instance("postgres", {
    instanceClass: "db.t3.micro",
    engine: "postgres",
    dbSubnetGroupName: subnet.id,
});`,
    cdk: `# Paste cdk synth JSON output
# Run: cdk synth | pbcopy   (macOS)
#  or: cdk synth > template.json

{
  "Resources": {
    "VPCB9E5F0B4": {
      "Type": "AWS::EC2::VPC",
      "Properties": { "CidrBlock": "10.0.0.0/16" }
    },
    "PublicSubnet1": {
      "Type": "AWS::EC2::Subnet",
      "Properties": {
        "VpcId": { "Ref": "VPCB9E5F0B4" },
        "CidrBlock": "10.0.0.0/18"
      }
    },
    "WebFunction": {
      "Type": "AWS::Lambda::Function",
      "Properties": {
        "Role": { "Fn::GetAtt": ["LambdaRole", "Arn"] }
      }
    },
    "LambdaRole": { "Type": "AWS::IAM::Role" }
  }
}`,
};

// ── Toast notifications ───────────────────────────────────────────────────────

function showToast(message, type = 'error', duration = 4500) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    const dismiss = () => {
        if (!toast.parentNode) return;
        toast.classList.add('fade-out');
        toast.addEventListener('animationend', () => toast.remove(), { once: true });
    };

    const timer = setTimeout(dismiss, duration);
    toast.addEventListener('click', () => { clearTimeout(timer); dismiss(); });
}

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
let lastLayout = null;
let tableOpen = false;
let editMode = false;

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
    if (type === 'pulumi') return parsePulumi(code);
    if (type === 'cloudformation' || type === 'cdk') return parseCloudFormation(code);
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
    if (btnLoadSample) {
        const labels = { docker: 'Load Docker sample', terragrunt: 'Load Terragrunt sample', cloudformation: 'Load CloudFormation sample', cdk: 'Load CDK sample', pulumi: 'Load Pulumi sample' };
        btnLoadSample.textContent = labels[type] || 'Load Terraform sample';
    }

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
    if (diffMode) return; // diff mode has its own handler
    const code = codeInput.value.trim();
    if (!code) {
        showToast('Paste some code first — Terraform HCL, plan JSON, Terragrunt, CloudFormation YAML/JSON, or docker-compose.yml.', 'info');
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
            const looksLikeHcl = /^\s*resource\s+"/.test(code) || /^\s*module\s+"/.test(code);
            const looksLikePlanText = /^Terraform will perform/.test(code) || /^An execution plan/.test(code);
            if (looksLikePlanText) {
                showToast('Looks like terraform plan text output — use terraform show -json tfplan instead for JSON.');
            } else if (looksLikeHcl) {
                showToast('HCL parsed but no recognized resource types found. Check the supported resource list.');
            } else {
                showToast('No recognized resources found. Check your code format and try again.');
            }
            return;
        }

        lastParsed = parsed;
        lastLayout = layout;
        window._lastParsed = parsed;
        resetZoom();
        zoomControls.style.display = 'flex';
        updateStats(parsed.resources);
        populateResourceTable(parsed.resources);
        if (editMode) initEditor(diagramSvg, layout, zoomState);
    } catch (error) {
        loading.classList.remove('active');
        placeholder.style.display = 'block';
        const msg = error.message || '';
        const type = activeInputType();
        if (type === 'cloudformation' || type === 'cdk') {
            showToast(msg || 'Invalid template — check YAML/JSON syntax.');
        } else if (msg.toLowerCase().includes('json')) {
            showToast('Invalid JSON — if pasting a plan, use: terraform show -json tfplan');
        } else if (msg.toLowerCase().includes('yaml')) {
            showToast('Invalid YAML — check your docker-compose.yml syntax.');
        } else {
            showToast(msg || 'Could not generate the diagram.');
        }
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
    moduleOptionsBar.style.display = type === 'terraform' ? 'flex' : 'none';
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
        showToast('Could not read ZIP: ' + (err.message || err));
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
        showToast(error.message || 'Could not export PNG.');
    }
});

document.getElementById('btn-export-svg').addEventListener('click', async () => {
    if (diagramSvg.style.display === 'none') return;

    try {
        await exportSvg(diagramSvg);
    } catch (error) {
        showToast(error.message || 'Could not export SVG.');
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
        showToast('Generate a diagram first.', 'info');
        return;
    }

    const xml = generateDrawioXml(lastParsed);
    if (!xml) {
        showToast('No resources to export.', 'info');
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
        showToast('Paste some code first, then share.', 'info');
        return;
    }

    const hash = encodeState(activeInputType(), code);
    if (!hash) return;

    history.replaceState(null, '', `#${hash}`);
    const url = location.href;

    navigator.clipboard.writeText(url).then(() => {
        shareButton.textContent = 'Copied!';
        shareButton.classList.add('copied');
        showToast('Link copied to clipboard!', 'success', 3000);
        setTimeout(() => {
            shareButton.textContent = 'Share';
            shareButton.classList.remove('copied');
        }, 2000);
    }).catch(() => {
        showToast('Could not copy automatically — copy the URL from the address bar.', 'info');
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
            showToast('Could not convert SVG: ' + (err.message || err));
        }
    };
    reader.readAsText(file);
});

// ── Interactive editor ────────────────────────────────────────────────────────

const btnEdit = document.getElementById('btn-edit');
const btnResetLayout = document.getElementById('btn-reset-layout');
const diagramCanvas = document.getElementById('diagram-canvas');

btnEdit?.addEventListener('click', () => {
    editMode = !editMode;
    btnEdit.textContent = editMode ? 'Done' : 'Edit';
    btnEdit.classList.toggle('edit-active', editMode);
    diagramCanvas.classList.toggle('edit-mode', editMode);
    btnResetLayout.style.display = editMode ? '' : 'none';

    if (editMode && lastLayout) {
        initEditor(diagramSvg, lastLayout, zoomState);
    } else {
        destroyEditor();
    }
});

btnResetLayout?.addEventListener('click', () => {
    resetLayout();
});

// ── Dark / light theme toggle ─────────────────────────────────────────────────
(function initTheme() {
    const stored = localStorage.getItem('infrasketch-theme');
    if (stored) document.documentElement.setAttribute('data-theme', stored);
})();

const themeBtn = document.getElementById('btn-theme');
function syncThemeIcon() {
    if (!themeBtn) return;
    themeBtn.textContent = document.documentElement.getAttribute('data-theme') === 'light' ? '🌙' : '☀️';
}
themeBtn?.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('infrasketch-theme', next);
    syncThemeIcon();
});
syncThemeIcon();

// ── Diff mode ─────────────────────────────────────────────────────────────────
let diffMode = false;

const diffBtn       = document.getElementById('btn-diff');
const diffEditors   = document.getElementById('diff-editors');
const diffV1        = document.getElementById('diff-v1');
const diffV2        = document.getElementById('diff-v2');
const diffSummary   = document.getElementById('diff-summary');
const diffAddedEl   = document.getElementById('diff-added');
const diffRemovedEl = document.getElementById('diff-removed-count');
const diffUnchangedEl = document.getElementById('diff-unchanged');
const diffRemovedPanel = document.getElementById('diff-removed-panel');
const diffRemovedList  = document.getElementById('diff-removed-list');

diffBtn?.addEventListener('click', () => {
    diffMode = !diffMode;
    diffBtn.classList.toggle('active', diffMode);

    if (diffMode) {
        codeInput.style.display = 'none';
        diffEditors.classList.add('visible');
        generateButton.textContent = 'Compare';
        // Copy current code into v2 as starting point
        if (!diffV2.value && codeInput.value) diffV2.value = codeInput.value;
    } else {
        codeInput.style.display = '';
        diffEditors.classList.remove('visible');
        generateButton.innerHTML = '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg> Generate Diagram';
        diffSummary.classList.remove('visible');
        diffRemovedPanel.classList.remove('visible');
        clearDiffOverlay();
    }
});

function clearDiffOverlay() {
    diagramSvg.querySelectorAll('[data-node-id]').forEach(node => {
        const rect = node.querySelector('rect');
        if (rect) {
            rect.removeAttribute('data-diff-orig-stroke');
            rect.removeAttribute('data-diff-orig-width');
        }
        node.querySelector('.diff-overlay-rect')?.remove();
    });
}

function applyDiffOverlay(addedIds, removedIds) {
    clearDiffOverlay();
    const SVG_NS = 'http://www.w3.org/2000/svg';

    for (const id of addedIds) {
        const node = diagramSvg.querySelector(`[data-node-id="${id}"]`);
        if (!node) continue;
        const rect = node.querySelector('rect');
        if (!rect) continue;
        // Green border
        rect.setAttribute('stroke', '#16a34a');
        rect.setAttribute('stroke-width', '2.5');
        // Green tint overlay
        const overlay = document.createElementNS(SVG_NS, 'rect');
        overlay.setAttribute('x', rect.getAttribute('x'));
        overlay.setAttribute('y', rect.getAttribute('y'));
        overlay.setAttribute('width', rect.getAttribute('width'));
        overlay.setAttribute('height', rect.getAttribute('height'));
        overlay.setAttribute('rx', rect.getAttribute('rx') || '8');
        overlay.setAttribute('fill', 'rgba(22,163,74,0.08)');
        overlay.setAttribute('pointer-events', 'none');
        overlay.classList.add('diff-overlay-rect');
        node.appendChild(overlay);
    }
}

function computeDiff(parsed1, parsed2) {
    const ids1 = new Set(parsed1.resources.map(r => r.id));
    const ids2 = new Set(parsed2.resources.map(r => r.id));
    const added     = parsed2.resources.filter(r => !ids1.has(r.id));
    const removed   = parsed1.resources.filter(r => !ids2.has(r.id));
    const unchanged = parsed2.resources.filter(r => ids1.has(r.id));
    return { added, removed, unchanged };
}

// Diff compare handler (bubble phase, guarded by diffMode flag)
generateButton.addEventListener('click', async (e) => {
    if (!diffMode) return;

    const code1 = diffV1.value.trim();
    const code2 = diffV2.value.trim();
    if (!code1 || !code2) {
        showToast('Paste code in both v1 and v2 fields.', 'info');
        return;
    }

    placeholder.style.display = 'none';
    hideDiagram();
    loading.classList.add('active');

    try {
        // Parse both using current tab type
        const type = activeInputType();
        async function parseByType(code) {
            if (type === 'docker') return parseDockerCompose(code);
            if (type === 'terragrunt') return parseTerragrunt(code);
            if (type === 'pulumi') return parsePulumi(code);
            if (type === 'cloudformation' || type === 'cdk') return parseCloudFormation(code);
            if (code.trimStart().startsWith('{')) {
                const r = parseTerraformPlan(code);
                if (r) return r;
            }
            return expandModules(parseTerraform(code), code, { virtualFS: currentVirtualFS, fetchRegistry: autoFetchRegistry });
        }

        const [parsed1, parsed2] = await Promise.all([parseByType(code1), parseByType(code2)]);
        lastParsed = parsed2;

        const diff = computeDiff(parsed1, parsed2);

        // Render v2
        const layout = renderDiagram(parsed2, diagramSvg);
        loading.classList.remove('active');

        if (!layout) {
            placeholder.style.display = 'block';
            showToast('No recognisable resources found in v2.', 'info');
            return;
        }

        lastParsed = parsed2;
        lastLayout = layout;
        resetZoom();
        zoomControls.style.display = 'flex';
        updateStats(parsed2.resources);
        populateResourceTable(parsed2.resources);

        // Apply diff overlay
        applyDiffOverlay(diff.added.map(r => r.id), diff.removed.map(r => r.id));

        // Show summary bar
        diffAddedEl.textContent   = `+${diff.added.length} added`;
        diffRemovedEl.textContent = `−${diff.removed.length} removed`;
        diffUnchangedEl.textContent = `~${diff.unchanged.length} unchanged`;
        diffSummary.classList.add('visible');

        // Show removed panel
        if (diff.removed.length) {
            diffRemovedList.innerHTML = diff.removed
                .map(r => `<span class="diff-removed-tag">${r.label}: ${r.name}</span>`)
                .join('');
            diffRemovedPanel.classList.add('visible');
        } else {
            diffRemovedPanel.classList.remove('visible');
        }

    } catch (err) {
        loading.classList.remove('active');
        showToast(`Error: ${err.message}`, 'error');
    }
});

// ── Mermaid export ────────────────────────────────────────────────────────────
const mermaidBtn     = document.getElementById('btn-export-mermaid');
const mermaidOverlay = document.getElementById('mermaid-modal-overlay');
const mermaidClose   = document.getElementById('mermaid-modal-close');
const mermaidCancel  = document.getElementById('mermaid-modal-cancel');
const mermaidCode    = document.getElementById('mermaid-code');
const mermaidCopy    = document.getElementById('mermaid-copy-btn');

mermaidBtn?.addEventListener('click', () => {
    if (!lastParsed) {
        showToast('Generate a diagram first.', 'info');
        return;
    }
    mermaidCode.textContent = generateMermaid(lastParsed);
    mermaidOverlay.removeAttribute('hidden');
});

mermaidClose?.addEventListener('click',  () => mermaidOverlay.setAttribute('hidden', ''));
mermaidCancel?.addEventListener('click', () => mermaidOverlay.setAttribute('hidden', ''));
mermaidOverlay?.addEventListener('click', e => { if (e.target === mermaidOverlay) mermaidOverlay.setAttribute('hidden', ''); });

mermaidCopy?.addEventListener('click', () => {
    navigator.clipboard.writeText(mermaidCode.textContent).then(() => {
        mermaidCopy.textContent = 'Copied!';
        setTimeout(() => { mermaidCopy.textContent = 'Copy'; }, 2000);
    });
});

// ── ?load=TYPE:KEY query param support (used by examples gallery) ─────────────
function loadFromQueryParam() {
    const params = new URLSearchParams(location.search);
    const load = params.get('load');
    if (!load) return false;
    const [type, key] = load.split(':');
    if (!type || !key) return false;
    const sample = EXTRA_SAMPLES[type]?.[key];
    if (!sample) return false;
    const tab = document.querySelector(`.input-tab[data-type="${type}"]`);
    if (!tab) return false;
    document.querySelectorAll('.input-tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    updateEditorForType(type);
    codeInput.value = sample.code;
    generateButton.click();
    // Clean up query param without breaking the URL
    history.replaceState(null, '', location.pathname + location.hash);
    return true;
}

// ── Embed button ──────────────────────────────────────────────────────────────
const embedButton = document.getElementById('btn-embed');
const embedModal = document.getElementById('embed-modal-overlay');
const embedClose = document.getElementById('embed-modal-close');
const embedCode = document.getElementById('embed-code');
const embedCopy = document.getElementById('embed-copy-btn');

embedButton?.addEventListener('click', () => {
    const code = codeInput.value.trim();
    if (!code) {
        showToast('Generate a diagram first, then embed it.', 'info');
        return;
    }
    const hash = encodeState(activeInputType(), code);
    if (!hash) return;
    history.replaceState(null, '', `#${hash}`);
    const snippet = `<iframe\n  src="https://infrasketch.cloud/embed.html#${hash}"\n  width="100%"\n  height="520"\n  style="border:none;border-radius:8px"\n  allowfullscreen\n  title="InfraSketch Architecture Diagram"\n></iframe>`;
    embedCode.textContent = snippet;
    embedModal.removeAttribute('hidden');
});

embedClose?.addEventListener('click', () => embedModal.setAttribute('hidden', ''));
document.getElementById('embed-cancel-btn')?.addEventListener('click', () => embedModal.setAttribute('hidden', ''));
embedModal?.addEventListener('click', (e) => { if (e.target === embedModal) embedModal.setAttribute('hidden', ''); });

embedCopy?.addEventListener('click', () => {
    navigator.clipboard.writeText(embedCode.textContent).then(() => {
        embedCopy.textContent = 'Copied!';
        setTimeout(() => { embedCopy.textContent = 'Copy'; }, 2000);
    });
});

if (!loadFromHash()) loadFromQueryParam();
