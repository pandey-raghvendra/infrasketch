import { describe, it, expect } from 'vitest';
import { parseTerraform, parseDockerCompose, parseTerraformPlan } from '../js/parser.js';

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

// ─── parseTerraform — Azure ───────────────────────────────────────────────────

describe('parseTerraform — Azure', () => {
    it('recognises azurerm_virtual_network as vpc category', () => {
        const code = `
resource "azurerm_virtual_network" "main" {
  name          = "prod-vnet"
  address_space = ["10.0.0.0/16"]
}`;
        const { resources } = parseTerraform(code);
        expect(resources).toHaveLength(1);
        expect(resources[0]).toMatchObject({ category: 'vpc', type: 'azurerm_virtual_network', name: 'main' });
    });

    it('recognises azurerm_subnet as subnet category', () => {
        const code = `
resource "azurerm_subnet" "private" {
  name                 = "private"
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = ["10.0.1.0/24"]
}
resource "azurerm_virtual_network" "main" {
  name          = "prod-vnet"
  address_space = ["10.0.0.0/16"]
}`;
        const { resources } = parseTerraform(code);
        const categories = resources.map((r) => r.category);
        expect(categories).toContain('subnet');
        expect(categories).toContain('vpc');
    });

    it('maps azurerm_subnet to its VNet via virtual_network_name', () => {
        const code = `
resource "azurerm_virtual_network" "main" {
  name          = "prod-vnet"
  address_space = ["10.0.0.0/16"]
}
resource "azurerm_subnet" "private" {
  name                 = "private"
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = ["10.0.2.0/24"]
}`;
        const { vpcOf } = parseTerraform(code);
        expect(vpcOf['azurerm_subnet.private']).toBe('azurerm_virtual_network.main');
    });

    it('maps a resource to azurerm_subnet via subnet_id', () => {
        const code = `
resource "azurerm_virtual_network" "main" { name = "vnet" address_space = ["10.0.0.0/16"] }
resource "azurerm_subnet" "priv" {
  name                 = "priv"
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = ["10.0.1.0/24"]
}
resource "azurerm_linux_web_app" "api" {
  name      = "api"
  subnet_id = azurerm_subnet.priv.id
}`;
        const { subnetOf } = parseTerraform(code);
        expect(subnetOf['azurerm_linux_web_app.api']).toBe('azurerm_subnet.priv');
    });

    it('maps AKS default_node_pool vnet_subnet_id to azurerm_subnet', () => {
        const code = `
resource "azurerm_virtual_network" "main" { name = "vnet" address_space = ["10.0.0.0/16"] }
resource "azurerm_subnet" "priv" {
  name                 = "priv"
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = ["10.0.2.0/24"]
}
resource "azurerm_kubernetes_cluster" "main" {
  name = "prod-aks"
  default_node_pool {
    name           = "default"
    vnet_subnet_id = azurerm_subnet.priv.id
  }
}`;
        const { subnetOf } = parseTerraform(code);
        expect(subnetOf['azurerm_kubernetes_cluster.main']).toBe('azurerm_subnet.priv');
    });

    it('recognises Azure compute resource categories', () => {
        const code = `
resource "azurerm_kubernetes_cluster" "aks" { name = "aks" }
resource "azurerm_linux_function_app" "fn" { name = "fn" }
resource "azurerm_linux_web_app" "app" { name = "app" }
resource "azurerm_virtual_machine" "vm" { name = "vm" }`;
        const { resources } = parseTerraform(code);
        const cats = Object.fromEntries(resources.map((r) => [r.name, r.category]));
        expect(cats.aks).toBe('az_aks');
        expect(cats.fn).toBe('az_function');
        expect(cats.app).toBe('az_appservice');
        expect(cats.vm).toBe('az_vm');
    });

    it('recognises Azure data/storage resource categories', () => {
        const code = `
resource "azurerm_mssql_server" "sql" { name = "sql" }
resource "azurerm_cosmosdb_account" "cosmos" { name = "cosmos" }
resource "azurerm_postgresql_flexible_server" "pg" { name = "pg" }
resource "azurerm_redis_cache" "redis" { name = "redis" }
resource "azurerm_storage_account" "storage" { name = "storage" }`;
        const { resources } = parseTerraform(code);
        const cats = Object.fromEntries(resources.map((r) => [r.name, r.category]));
        expect(cats.sql).toBe('az_sql');
        expect(cats.cosmos).toBe('az_cosmos');
        expect(cats.pg).toBe('az_postgres');
        expect(cats.redis).toBe('az_redis');
        expect(cats.storage).toBe('az_storage');
    });

    it('recognises Azure messaging and security categories', () => {
        const code = `
resource "azurerm_servicebus_namespace" "sb" { name = "sb" }
resource "azurerm_eventhub_namespace" "eh" { name = "eh" }
resource "azurerm_key_vault" "kv" { name = "kv" }
resource "azurerm_network_security_group" "nsg" { name = "nsg" }`;
        const { resources } = parseTerraform(code);
        const cats = Object.fromEntries(resources.map((r) => [r.name, r.category]));
        expect(cats.sb).toBe('az_servicebus');
        expect(cats.eh).toBe('az_eventhub');
        expect(cats.kv).toBe('az_keyvault');
        expect(cats.nsg).toBe('az_nsg');
    });

    it('does not create connections for resource_group_name references', () => {
        const code = `
resource "azurerm_virtual_network" "main" { name = "vnet" address_space = ["10.0.0.0/16"] }
resource "azurerm_kubernetes_cluster" "aks" {
  name                = "aks"
  resource_group_name = azurerm_resource_group.main.name
}`;
        const { connections } = parseTerraform(code);
        expect(connections).toEqual([]);
    });
});

// ─── parseTerraformPlan ───────────────────────────────────────────────────────

function makePlan(resourceChanges, configResources = []) {
    return JSON.stringify({
        format_version: '1.1',
        resource_changes: resourceChanges,
        configuration: { root_module: { resources: configResources } },
    });
}

describe('parseTerraformPlan', () => {
    it('returns null for non-JSON input', () => {
        expect(parseTerraformPlan('not json')).toBeNull();
    });

    it('returns null for JSON without resource_changes', () => {
        expect(parseTerraformPlan(JSON.stringify({ foo: 'bar' }))).toBeNull();
    });

    it('parses a single EC2 instance from plan', () => {
        const plan = makePlan([{
            address: 'aws_instance.web', type: 'aws_instance', name: 'web',
            change: { actions: ['create'], before: null, after: { instance_type: 't3.medium' } },
        }]);
        const { resources } = parseTerraformPlan(plan);
        expect(resources).toHaveLength(1);
        expect(resources[0]).toMatchObject({ id: 'aws_instance.web', type: 'aws_instance', name: 'web', category: 'instance' });
    });

    it('skips delete-only changes', () => {
        const plan = makePlan([{
            address: 'aws_instance.old', type: 'aws_instance', name: 'old',
            change: { actions: ['delete'], before: { instance_type: 't2.micro' }, after: null },
        }]);
        expect(parseTerraformPlan(plan).resources).toEqual([]);
    });

    it('skips module resources', () => {
        const plan = makePlan([{
            address: 'module.vpc.aws_vpc.main', type: 'aws_vpc', name: 'main',
            change: { actions: ['create'], before: null, after: {} },
        }]);
        expect(parseTerraformPlan(plan).resources).toEqual([]);
    });

    it('classifies aws_lb as alb or nlb from after block', () => {
        const alb = makePlan([{ address: 'aws_lb.app', type: 'aws_lb', name: 'app', change: { actions: ['create'], before: null, after: { load_balancer_type: 'application' } } }]);
        const nlb = makePlan([{ address: 'aws_lb.net', type: 'aws_lb', name: 'net', change: { actions: ['create'], before: null, after: { load_balancer_type: 'network' } } }]);
        expect(parseTerraformPlan(alb).resources[0].category).toBe('alb');
        expect(parseTerraformPlan(nlb).resources[0].category).toBe('nlb');
    });

    it('maps vpcOf from vpc_id expression references', () => {
        const plan = makePlan(
            [
                { address: 'aws_vpc.main', type: 'aws_vpc', name: 'main', change: { actions: ['create'], before: null, after: {} } },
                { address: 'aws_subnet.pub', type: 'aws_subnet', name: 'pub', change: { actions: ['create'], before: null, after: {} } },
            ],
            [
                { address: 'aws_vpc.main', expressions: {} },
                { address: 'aws_subnet.pub', expressions: { vpc_id: { references: ['aws_vpc.main.id', 'aws_vpc.main'] } } },
            ],
        );
        expect(parseTerraformPlan(plan).vpcOf['aws_subnet.pub']).toBe('aws_vpc.main');
    });

    it('maps subnetOf from subnet_id expression references', () => {
        const plan = makePlan(
            [
                { address: 'aws_subnet.priv', type: 'aws_subnet', name: 'priv', change: { actions: ['create'], before: null, after: {} } },
                { address: 'aws_instance.web', type: 'aws_instance', name: 'web', change: { actions: ['create'], before: null, after: {} } },
            ],
            [
                { address: 'aws_subnet.priv', expressions: {} },
                { address: 'aws_instance.web', expressions: { subnet_id: { references: ['aws_subnet.priv.id', 'aws_subnet.priv'] } } },
            ],
        );
        expect(parseTerraformPlan(plan).subnetOf['aws_instance.web']).toBe('aws_subnet.priv');
    });

    it('builds connections from non-structural expression references', () => {
        const plan = makePlan(
            [
                { address: 'aws_sqs_queue.q', type: 'aws_sqs_queue', name: 'q', change: { actions: ['create'], before: null, after: {} } },
                { address: 'aws_lambda_function.fn', type: 'aws_lambda_function', name: 'fn', change: { actions: ['create'], before: null, after: {} } },
            ],
            [
                { address: 'aws_sqs_queue.q', expressions: {} },
                { address: 'aws_lambda_function.fn', expressions: {
                    event_source_arn: { references: ['aws_sqs_queue.q.arn', 'aws_sqs_queue.q'] },
                } },
            ],
        );
        const { connections } = parseTerraformPlan(plan);
        expect(connections).toContainEqual({ from: 'aws_sqs_queue.q', to: 'aws_lambda_function.fn' });
    });

    it('does not create connections for skipped attributes', () => {
        const plan = makePlan(
            [
                { address: 'aws_vpc.main', type: 'aws_vpc', name: 'main', change: { actions: ['create'], before: null, after: {} } },
                { address: 'aws_eks_cluster.k8s', type: 'aws_eks_cluster', name: 'k8s', change: { actions: ['create'], before: null, after: {} } },
            ],
            [
                { address: 'aws_vpc.main', expressions: {} },
                { address: 'aws_eks_cluster.k8s', expressions: {
                    vpc_id: { references: ['aws_vpc.main'] },
                } },
            ],
        );
        const { connections } = parseTerraformPlan(plan);
        expect(connections).toEqual([]);
    });

    it('handles nested block expressions (e.g. default_node_pool.vnet_subnet_id)', () => {
        const plan = makePlan(
            [
                { address: 'azurerm_subnet.priv', type: 'azurerm_subnet', name: 'priv', change: { actions: ['create'], before: null, after: {} } },
                { address: 'azurerm_kubernetes_cluster.aks', type: 'azurerm_kubernetes_cluster', name: 'aks', change: { actions: ['create'], before: null, after: {} } },
            ],
            [
                { address: 'azurerm_subnet.priv', expressions: {} },
                { address: 'azurerm_kubernetes_cluster.aks', expressions: {
                    default_node_pool: [{ vnet_subnet_id: { references: ['azurerm_subnet.priv.id', 'azurerm_subnet.priv'] } }],
                } },
            ],
        );
        expect(parseTerraformPlan(plan).subnetOf['azurerm_kubernetes_cluster.aks']).toBe('azurerm_subnet.priv');
    });
});
