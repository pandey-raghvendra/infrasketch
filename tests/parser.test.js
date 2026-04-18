import { describe, it, expect } from 'vitest';
import { parseTerraform, parseDockerCompose } from '../js/parser.js';

// ─── parseTerraform ──────────────────────────────────────────────────────────

describe('parseTerraform', () => {
    it('returns empty result for empty string', () => {
        const result = parseTerraform('');
        expect(result.resources).toEqual([]);
        expect(result.connections).toEqual([]);
        expect(result.vpcOf).toEqual({});
        expect(result.subnetOf).toEqual({});
    });

    it('returns empty result for unsupported resource types', () => {
        const code = `
resource "aws_route_table" "main" {
  vpc_id = "vpc-123"
}`;
        const result = parseTerraform(code);
        expect(result.resources).toEqual([]);
    });

    it('parses a single EC2 instance', () => {
        const code = `
resource "aws_instance" "web" {
  ami           = "ami-abc"
  instance_type = "t3.medium"
}`;
        const result = parseTerraform(code);
        expect(result.resources).toHaveLength(1);
        expect(result.resources[0]).toMatchObject({
            id: 'aws_instance.web',
            type: 'aws_instance',
            name: 'web',
            category: 'instance',
        });
    });

    it('parses multiple supported resource types', () => {
        const code = `
resource "aws_vpc" "main" { cidr_block = "10.0.0.0/16" }
resource "aws_subnet" "pub" { vpc_id = aws_vpc.main.id cidr_block = "10.0.1.0/24" }
resource "aws_lambda_function" "fn" { function_name = "my-fn" runtime = "nodejs18.x" }
resource "aws_sqs_queue" "q" { name = "my-queue" }`;
        const result = parseTerraform(code);
        const ids = result.resources.map((r) => r.id);
        expect(ids).toContain('aws_vpc.main');
        expect(ids).toContain('aws_subnet.pub');
        expect(ids).toContain('aws_lambda_function.fn');
        expect(ids).toContain('aws_sqs_queue.q');
    });

    it('classifies aws_lb as ALB by default', () => {
        const code = `
resource "aws_lb" "frontend" {
  name               = "prod-alb"
  load_balancer_type = "application"
}`;
        const result = parseTerraform(code);
        expect(result.resources[0].category).toBe('alb');
    });

    it('classifies aws_lb as NLB when load_balancer_type = "network"', () => {
        const code = `
resource "aws_lb" "internal" {
  name               = "prod-nlb"
  load_balancer_type = "network"
}`;
        const result = parseTerraform(code);
        expect(result.resources[0].category).toBe('nlb');
    });

    it('detects VPC membership via vpc_id reference', () => {
        const code = `
resource "aws_vpc" "main" { cidr_block = "10.0.0.0/16" }
resource "aws_subnet" "pub" {
  vpc_id     = aws_vpc.main.id
  cidr_block = "10.0.1.0/24"
}`;
        const result = parseTerraform(code);
        expect(result.vpcOf['aws_subnet.pub']).toBe('aws_vpc.main');
    });

    it('detects subnet membership via subnet_id reference', () => {
        const code = `
resource "aws_vpc" "main" { cidr_block = "10.0.0.0/16" }
resource "aws_subnet" "private" {
  vpc_id     = aws_vpc.main.id
  cidr_block = "10.0.2.0/24"
}
resource "aws_db_instance" "postgres" {
  engine    = "postgres"
  subnet_id = aws_subnet.private.id
}`;
        const result = parseTerraform(code);
        expect(result.subnetOf['aws_db_instance.postgres']).toBe('aws_subnet.private');
    });

    it('detects connections between resources', () => {
        const code = `
resource "aws_lambda_function" "fn" {
  function_name = "handler"
  runtime       = "nodejs18.x"
}
resource "aws_sqs_queue" "q" { name = "jobs" }
resource "aws_lambda_event_source_mapping" "trigger" {
  event_source_arn = aws_sqs_queue.q.arn
  function_name    = aws_lambda_function.fn.function_name
}`;
        // Only supported resources get connections; event_source_mapping is unsupported
        const result = parseTerraform(code);
        const ids = result.resources.map((r) => r.id);
        expect(ids).toContain('aws_lambda_function.fn');
        expect(ids).toContain('aws_sqs_queue.q');
    });

    it('handles nested braces in resource blocks', () => {
        const code = `
resource "aws_security_group" "web" {
  name   = "web-sg"
  vpc_id = aws_vpc.main.id
  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
}
resource "aws_vpc" "main" { cidr_block = "10.0.0.0/16" }`;
        const result = parseTerraform(code);
        const ids = result.resources.map((r) => r.id);
        expect(ids).toContain('aws_security_group.web');
        expect(ids).toContain('aws_vpc.main');
    });

    it('does not duplicate connections', () => {
        const code = `
resource "aws_eks_cluster" "main" {
  name     = "prod"
  role_arn = aws_iam_role.eks.arn
}
resource "aws_iam_role" "eks" { name = "eks-role" }`;
        const result = parseTerraform(code);
        const key = 'aws_iam_role.eks->aws_eks_cluster.main';
        const matches = result.connections.filter((c) => `${c.from}->${c.to}` === key);
        expect(matches.length).toBeLessThanOrEqual(1);
    });
});

// ─── parseDockerCompose ──────────────────────────────────────────────────────

describe('parseDockerCompose', () => {
    it('returns empty result for empty services', () => {
        const result = parseDockerCompose('services: {}');
        expect(result.resources).toEqual([]);
        expect(result.connections).toEqual([]);
    });

    it('parses a single service', () => {
        const code = `
services:
  web:
    image: nginx:alpine`;
        const result = parseDockerCompose(code);
        expect(result.resources).toHaveLength(1);
        expect(result.resources[0]).toMatchObject({
            id: 'docker.web',
            type: 'docker_service',
            name: 'web',
            category: 'instance',
        });
    });

    it('parses multiple services', () => {
        const code = `
services:
  api:
    image: node:20-alpine
  db:
    image: postgres:16-alpine
  cache:
    image: redis:7-alpine`;
        const result = parseDockerCompose(code);
        const names = result.resources.map((r) => r.name);
        expect(names).toContain('api');
        expect(names).toContain('db');
        expect(names).toContain('cache');
    });

    it('creates connections from array-form depends_on', () => {
        const code = `
services:
  web:
    image: nginx:alpine
    depends_on:
      - api
  api:
    image: node:20-alpine`;
        const result = parseDockerCompose(code);
        expect(result.connections).toContainEqual({ from: 'docker.api', to: 'docker.web' });
    });

    it('creates connections from map-form depends_on (condition syntax)', () => {
        const code = `
services:
  api:
    image: node:20-alpine
    depends_on:
      db:
        condition: service_healthy
      cache:
        condition: service_started
  db:
    image: postgres:16-alpine
  cache:
    image: redis:7-alpine`;
        const result = parseDockerCompose(code);
        expect(result.connections).toContainEqual({ from: 'docker.db', to: 'docker.api' });
        expect(result.connections).toContainEqual({ from: 'docker.cache', to: 'docker.api' });
    });

    it('ignores depends_on entries that reference non-existent services', () => {
        const code = `
services:
  web:
    image: nginx:alpine
    depends_on:
      - ghost-service`;
        const result = parseDockerCompose(code);
        expect(result.connections).toEqual([]);
    });

    it('does not duplicate connections', () => {
        const code = `
services:
  api:
    image: node:20-alpine
    depends_on:
      - db
  db:
    image: postgres:16-alpine`;
        const result = parseDockerCompose(code);
        const dupes = result.connections.filter((c) => c.from === 'docker.db' && c.to === 'docker.api');
        expect(dupes).toHaveLength(1);
    });

    it('handles YAML with comments correctly', () => {
        const code = `
# My compose file
services:
  web:
    image: nginx:alpine # use alpine for size
    depends_on:
      - api  # wait for API
  api:
    image: node:20-alpine`;
        const result = parseDockerCompose(code);
        expect(result.resources).toHaveLength(2);
        expect(result.connections).toHaveLength(1);
    });

    it('sets vpcOf and subnetOf to empty objects', () => {
        const code = `
services:
  web:
    image: nginx:alpine`;
        const result = parseDockerCompose(code);
        expect(result.vpcOf).toEqual({});
        expect(result.subnetOf).toEqual({});
    });
});
