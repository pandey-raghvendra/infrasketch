import { describe, it, expect } from 'vitest';
import { generateDrawioXml } from '../js/exporters.js';

const emptyParsed = { resources: [], connections: [], vpcOf: {}, subnetOf: {} };

function minimalParsed(overrides = {}) {
    return {
        resources: [
            { id: 'aws_sqs_queue.jobs', type: 'aws_sqs_queue', name: 'jobs', category: 'sqs', label: 'SQS', color: '#e07a5f', icon: 'SQS' },
        ],
        connections: [],
        vpcOf: {},
        subnetOf: {},
        ...overrides,
    };
}

// ─── generateDrawioXml ───────────────────────────────────────────────────────

describe('generateDrawioXml', () => {
    it('returns null for empty resources', () => {
        expect(generateDrawioXml(emptyParsed)).toBeNull();
    });

    it('returns an XML string starting with <mxfile', () => {
        const xml = generateDrawioXml(minimalParsed());
        expect(xml).toBeTypeOf('string');
        expect(xml).toMatch(/^<mxfile/);
        expect(xml).toMatch(/<\/mxfile>$/);
    });

    it('includes mxGraphModel with required attributes', () => {
        const xml = generateDrawioXml(minimalParsed());
        expect(xml).toContain('<mxGraphModel');
        expect(xml).toContain('pageWidth=');
        expect(xml).toContain('pageHeight=');
    });

    it('includes a cell for the resource', () => {
        const xml = generateDrawioXml(minimalParsed());
        expect(xml).toContain('SQS');
        expect(xml).toContain('jobs');
    });

    it('includes root cells with id="0" and id="1"', () => {
        const xml = generateDrawioXml(minimalParsed());
        expect(xml).toContain('id="0"');
        expect(xml).toContain('id="1"');
    });

    it('generates a VPC group cell when VPC resource is present', () => {
        const parsed = {
            resources: [
                { id: 'aws_vpc.main', type: 'aws_vpc', name: 'main', category: 'vpc', label: 'VPC', color: '#118ab2', icon: 'VPC' },
            ],
            connections: [],
            vpcOf: {},
            subnetOf: {},
        };
        const xml = generateDrawioXml(parsed);
        expect(xml).toContain('mxgraph.aws4.group_vpc_alt');
        expect(xml).toContain('VPC: main');
    });

    it('generates a subnet group cell when subnet resource is present', () => {
        const parsed = {
            resources: [
                { id: 'aws_vpc.main', type: 'aws_vpc', name: 'main', category: 'vpc', label: 'VPC', color: '#118ab2', icon: 'VPC' },
                { id: 'aws_subnet.pub', type: 'aws_subnet', name: 'pub', category: 'subnet', label: 'Subnet', color: '#073b4c', icon: 'Subnet' },
            ],
            connections: [],
            vpcOf: { 'aws_subnet.pub': 'aws_vpc.main' },
            subnetOf: {},
        };
        const xml = generateDrawioXml(parsed);
        expect(xml).toContain('mxgraph.aws4.group_subnet');
        expect(xml).toContain('Subnet: pub');
    });

    it('generates edge cells for connections', () => {
        const parsed = {
            resources: [
                { id: 'aws_sqs_queue.q', type: 'aws_sqs_queue', name: 'q', category: 'sqs', label: 'SQS', color: '#e07a5f', icon: 'SQS' },
                { id: 'aws_lambda_function.fn', type: 'aws_lambda_function', name: 'fn', category: 'lambda', label: 'Lambda', color: '#ff6b35', icon: 'Lambda' },
            ],
            connections: [{ from: 'aws_sqs_queue.q', to: 'aws_lambda_function.fn' }],
            vpcOf: {},
            subnetOf: {},
        };
        const xml = generateDrawioXml(parsed);
        expect(xml).toContain('edge="1"');
        expect(xml).toContain('edgeStyle=orthogonalEdgeStyle');
    });

    it('uses sequential cell IDs starting from c10', () => {
        const xml = generateDrawioXml(minimalParsed());
        expect(xml).toContain('id="c10"');
    });

    it('uses edge IDs starting from e900', () => {
        const parsed = {
            resources: [
                { id: 'aws_sqs_queue.q', type: 'aws_sqs_queue', name: 'q', category: 'sqs', label: 'SQS', color: '#e07a5f', icon: 'SQS' },
                { id: 'aws_lambda_function.fn', type: 'aws_lambda_function', name: 'fn', category: 'lambda', label: 'Lambda', color: '#ff6b35', icon: 'Lambda' },
            ],
            connections: [{ from: 'aws_sqs_queue.q', to: 'aws_lambda_function.fn' }],
            vpcOf: {},
            subnetOf: {},
        };
        const xml = generateDrawioXml(parsed);
        expect(xml).toContain('id="e900"');
    });

    it('XML-escapes ampersands in resource labels and names', () => {
        const parsed = {
            resources: [
                { id: 'aws_sqs_queue.q', type: 'aws_sqs_queue', name: 'q', category: 'sqs', label: 'SQS & SNS', color: '#e07a5f', icon: 'SQS' },
            ],
            connections: [],
            vpcOf: {},
            subnetOf: {},
        };
        const xml = generateDrawioXml(parsed);
        // The bare & in the label must be encoded; no unescaped & should remain in attribute values
        expect(xml).not.toMatch(/value="[^"]*&(?!amp;|lt;|gt;|quot;|#)/);
        expect(xml).toContain('&amp;');
    });

    it('skips edges whose endpoints are not in the cell map', () => {
        const parsed = {
            resources: [
                { id: 'aws_sqs_queue.q', type: 'aws_sqs_queue', name: 'q', category: 'sqs', label: 'SQS', color: '#e07a5f', icon: 'SQS' },
            ],
            connections: [{ from: 'aws_sqs_queue.q', to: 'aws_lambda_function.missing' }],
            vpcOf: {},
            subnetOf: {},
        };
        const xml = generateDrawioXml(parsed);
        expect(xml).not.toContain('edge="1"');
    });

    it('rounds geometry values to integers', () => {
        const xml = generateDrawioXml(minimalParsed());
        // geometry attributes must be whole numbers (no decimal points)
        const geoMatches = [...xml.matchAll(/x="([\d.]+)"/g)];
        for (const [, value] of geoMatches) {
            expect(Number(value) % 1).toBe(0);
        }
    });
});
