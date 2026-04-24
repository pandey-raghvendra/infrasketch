/**
 * Visual regression tests: snapshot the draw.io XML output for canonical
 * sample inputs. Any change to parsing, layout, or XML generation that
 * alters the output will cause these to fail, surfacing unintended regressions.
 *
 * Run `npx vitest run --reporter verbose` to see diffs on failure.
 * To update baselines after an intentional change: `npx vitest run -u`
 */
import { describe, it, expect } from 'vitest';
import { parseTerraform, parseDockerCompose } from '../js/parser.js';
import { generateDrawioXml } from '../js/exporters.js';

const SAMPLE_TERRAFORM = `
resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
}

resource "aws_internet_gateway" "gw" {
  vpc_id = aws_vpc.main.id
}

resource "aws_subnet" "public" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.1.0/24"
  availability_zone = "us-east-1a"
}

resource "aws_subnet" "private" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.2.0/24"
  availability_zone = "us-east-1b"
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

resource "aws_eks_cluster" "main" {
  name     = "prod-cluster"
  role_arn = aws_iam_role.eks.arn
  vpc_config {
    subnet_ids = [aws_subnet.private.id]
  }
}

resource "aws_iam_role" "eks" {
  name = "eks-cluster-role"
}

resource "aws_db_instance" "postgres" {
  identifier = "prod-db"
  engine     = "postgres"
  subnet_id  = aws_subnet.private.id
}

resource "aws_s3_bucket" "assets" {
  bucket = "prod-static-assets"
}

resource "aws_sqs_queue" "events" {
  name = "event-queue"
}

resource "aws_cloudwatch_log_group" "app" {
  name = "/eks/app"
}
`;

const SAMPLE_DOCKER_COMPOSE = `
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
      db:
        condition: service_started
      cache:
        condition: service_started

  db:
    image: postgres:16-alpine

  cache:
    image: redis:7-alpine
`;

const MINIMAL_TERRAFORM = `
resource "aws_lambda_function" "fn" {
  function_name = "handler"
  runtime       = "nodejs18.x"
}
resource "aws_sqs_queue" "q" {
  name = "jobs"
}
`;

describe('draw.io XML visual regression', () => {
    it('full Terraform sample produces consistent XML', () => {
        const parsed = parseTerraform(SAMPLE_TERRAFORM);
        const xml = generateDrawioXml(parsed);
        expect(xml).toMatchSnapshot();
    });

    it('Docker Compose sample produces consistent XML', async () => {
        const parsed = await parseDockerCompose(SAMPLE_DOCKER_COMPOSE);
        const xml = generateDrawioXml(parsed);
        expect(xml).toMatchSnapshot();
    });

    it('minimal two-resource Terraform produces consistent XML', () => {
        const parsed = parseTerraform(MINIMAL_TERRAFORM);
        const xml = generateDrawioXml(parsed);
        expect(xml).toMatchSnapshot();
    });

    it('Terraform with VPC + subnets + resources produces consistent layout', () => {
        const code = `
resource "aws_vpc" "main" { cidr_block = "10.0.0.0/16" }
resource "aws_subnet" "pub" {
  vpc_id     = aws_vpc.main.id
  cidr_block = "10.0.1.0/24"
}
resource "aws_subnet" "priv" {
  vpc_id     = aws_vpc.main.id
  cidr_block = "10.0.2.0/24"
}
resource "aws_lb" "alb" {
  load_balancer_type = "application"
  subnets            = [aws_subnet.pub.id]
}
resource "aws_lb" "nlb" {
  load_balancer_type = "network"
  subnets            = [aws_subnet.priv.id]
}
resource "aws_rds_cluster" "db" {
  subnet_id = aws_subnet.priv.id
}
resource "aws_elasticache_cluster" "cache" {
  cluster_id = "redis"
  subnet_id  = aws_subnet.priv.id
}
resource "aws_cloudfront_distribution" "cdn" { enabled = true }
resource "aws_route53_zone" "dns" { name = "example.com" }
resource "aws_security_group" "web" { vpc_id = aws_vpc.main.id }
resource "aws_kms_key" "secrets" { description = "enc" }
`;
        const parsed = parseTerraform(code);
        const xml = generateDrawioXml(parsed);
        expect(xml).toMatchSnapshot();
    });
});

describe('parsed resource count regression', () => {
    it('full Terraform sample yields expected resource count', () => {
        const { resources } = parseTerraform(SAMPLE_TERRAFORM);
        expect(resources.length).toMatchSnapshot();
    });

    it('Docker Compose sample yields expected service count', async () => {
        const { resources } = await parseDockerCompose(SAMPLE_DOCKER_COMPOSE);
        expect(resources.length).toBe(4);
    });

    it('Docker Compose sample yields expected connection count', async () => {
        const { connections } = await parseDockerCompose(SAMPLE_DOCKER_COMPOSE);
        // web→api, api→db, api→cache
        expect(connections.length).toBe(3);
    });
});
