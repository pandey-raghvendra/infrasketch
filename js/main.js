import { exportDrawio, exportPng, exportSvg } from './exporters.js';
import { computeStats } from './layout.js';
import { parseDockerCompose, parseTerraform } from './parser.js';
import { renderDiagram } from './renderer.js';

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

const SAMPLES = {
    terraform: SAMPLE_TERRAFORM,
    docker: SAMPLE_DOCKER_COMPOSE,
};

const PLACEHOLDERS = {
    terraform: `# Paste your Terraform code here...

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
};

const SAMPLE_BUTTON_LABELS = {
    terraform: 'Load Terraform sample',
    docker: 'Load Docker sample',
};

const codeInput = document.getElementById('code-input');
const generateButton = document.getElementById('btn-generate');
const loadSampleButton = document.getElementById('btn-load-sample');
const placeholder = document.getElementById('placeholder');
const loading = document.getElementById('loading');
const diagramSvg = document.getElementById('diagram-svg');
const statsBar = document.getElementById('stats-bar');
let lastParsed = null;
let lastLoadedSampleType = null;

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

function hideDiagram() {
    diagramSvg.style.display = 'none';
    statsBar.style.display = 'none';
}

function parseCode(code) {
    return activeInputType() === 'docker'
        ? parseDockerCompose(code)
        : parseTerraform(code);
}

function updateEditorForType(type, previousType = null) {
    const currentText = codeInput.value.trim();
    const previousSample = previousType ? SAMPLES[previousType].trim() : null;
    const lastSample = lastLoadedSampleType ? SAMPLES[lastLoadedSampleType].trim() : null;
    const shouldSwapSample = currentText && (currentText === previousSample || currentText === lastSample);

    codeInput.placeholder = PLACEHOLDERS[type];
    loadSampleButton.textContent = SAMPLE_BUTTON_LABELS[type];

    if (shouldSwapSample) {
        codeInput.value = SAMPLES[type];
        lastLoadedSampleType = type;
    } else if (!currentText) {
        lastLoadedSampleType = null;
    }
}

loadSampleButton.addEventListener('click', () => {
    const type = activeInputType();
    codeInput.value = SAMPLES[type];
    lastLoadedSampleType = type;
});

generateButton.addEventListener('click', () => {
    const code = codeInput.value.trim();
    if (!code) {
        alert('Please paste some Terraform or docker-compose code first.');
        return;
    }

    placeholder.style.display = 'none';
    hideDiagram();
    loading.classList.add('active');

    setTimeout(() => {
        try {
            const parsed = parseCode(code);
            const layout = renderDiagram(parsed, diagramSvg);
            loading.classList.remove('active');

            if (!layout) {
                placeholder.style.display = 'block';
                alert('No supported resources found. Check your code and try again.');
                return;
            }

            lastParsed = parsed;
            window._lastParsed = parsed;
            updateStats(parsed.resources);
        } catch (error) {
            loading.classList.remove('active');
            placeholder.style.display = 'block';
            alert(error.message || 'Could not generate the diagram.');
        }
    }, 300);
});

document.querySelectorAll('.input-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
        const previousType = activeInputType();
        document.querySelectorAll('.input-tab').forEach((item) => item.classList.remove('active'));
        tab.classList.add('active');
        updateEditorForType(tab.dataset.type, previousType);
    });
});

updateEditorForType(activeInputType());

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

document.getElementById('btn-export-drawio').addEventListener('click', () => {
    if (!lastParsed) {
        alert('Generate a diagram first.');
        return;
    }

    if (!exportDrawio(lastParsed)) {
        alert('No resources to export.');
    }
});
