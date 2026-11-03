/**
 * @file projectCodeLeadDistribution.test.js
 * @description Comprehensive automated integration tests for Task 3:
 * 1. Lead Distribution by project_code:
 *    - Query / aggregate unique project_code with lead counts (e.g. PRJ-ABC = 20, PRJ-XYZ = 25, PRJ-POL = 20)
 *    - Organization Admin assigning a project_code to a chosen Vendor
 *    - Organization Admin reassigning / redistributing an already assigned project_code to another Vendor seamlessly
 * 2. Access Scoping for Surveying:
 *    - Vendor Admin / Vendor Agent can ONLY access and survey leads that match the project_code(s) explicitly assigned to that vendor
 *    - Attempting to access or survey leads from another project_code returns 403 Forbidden
 *    - Organization Admin can access and survey all leads and any project_code
 */

const request = require('supertest');
const app = require('../app');
const { generateToken } = require('../utils/crypto');
const mockStore = require('../database/mockStore');

jest.setTimeout(30000);

describe('Task 3: Lead Distribution by project_code & Survey Scoping Suite', () => {
  const PROJECT_ID = '44444444-4444-4444-4444-444444444441';
  const VENDOR_1_ID = '33333333-3333-3333-3333-333333333331';
  const VENDOR_2_ID = '33333333-3333-3333-3333-333333333332';
  const ORG_ID = '11111111-1111-1111-1111-111111111111';

  let orgAdminToken;
  let vendor1Token;
  let vendor2Token;

  beforeAll(() => {
    // 1. Organization Admin
    orgAdminToken = generateToken({
      userId: '66666666-6666-6666-6666-666666666601',
      id: '66666666-6666-6666-6666-666666666601',
      email: 'orgadmin@pollypulse.com',
      role: 'ORGANIZATION_ADMIN',
      organization_id: ORG_ID,
      permissions: ['*:*'],
    });

    // 2. Vendor 1 Agent / Admin
    vendor1Token = generateToken({
      userId: '66666666-6666-6666-6666-666666666611',
      id: '66666666-6666-6666-6666-666666666611',
      email: 'agent1@vendor1.in',
      role: 'VENDOR_AGENT',
      vendor_id: VENDOR_1_ID,
      vendorId: VENDOR_1_ID,
      organization_id: ORG_ID,
      permissions: ['submissions:read', 'submissions:create'],
    });

    // 3. Vendor 2 Agent / Admin
    vendor2Token = generateToken({
      userId: '66666666-6666-6666-6666-666666666612',
      id: '66666666-6666-6666-6666-666666666612',
      email: 'agent2@vendor2.in',
      role: 'VENDOR_AGENT',
      vendor_id: VENDOR_2_ID,
      vendorId: VENDOR_2_ID,
      organization_id: ORG_ID,
      permissions: ['submissions:read', 'submissions:create'],
    });

    // Reset assignments for clean test execution
    if (mockStore.data && Array.isArray(mockStore.data.campaign_project_code_assignments)) {
      mockStore.data.campaign_project_code_assignments = [];
    }
    if (Array.isArray(mockStore.campaign_project_code_assignments)) {
      mockStore.campaign_project_code_assignments = [];
    }
  });

  describe('1. Ingest & Analyze unique project_codes breakdown with lead counts', () => {
    test('GET /api/v1/projects/:id/project-code-distribution returns unique project_codes breakdown', async () => {
      const res = await request(app)
        .get(`/api/v1/projects/${PROJECT_ID}/project-code-distribution`)
        .set('Authorization', `Bearer ${orgAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.totalLeads).toBeGreaterThan(0);
      expect(res.body.data.uniqueProjectCodesCount).toBeGreaterThanOrEqual(3);

      const codes = res.body.data.distribution.map((d) => d.project_code);
      expect(codes).toContain('PRJ-ABC');
      expect(codes).toContain('PRJ-XYZ');
      expect(codes).toContain('PRJ-POL');

      // Verify each project code has count and status breakdown
      const abc = res.body.data.distribution.find((d) => d.project_code === 'PRJ-ABC');
      expect(abc).toBeDefined();
      expect(abc.lead_count).toBe(20);
      expect(abc.status_breakdown).toBeDefined();
    });
  });

  describe('2. Organization Admin assigns project_code to chosen Vendor', () => {
    test('POST /api/v1/projects/:id/assign-project-code assigns PRJ-ABC to Vendor 1', async () => {
      const res = await request(app)
        .post(`/api/v1/projects/${PROJECT_ID}/assign-project-code`)
        .set('Authorization', `Bearer ${orgAdminToken}`)
        .send({
          projectCode: 'PRJ-ABC',
          vendorId: VENDOR_1_ID,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.projectCode).toBe('PRJ-ABC');
      expect(res.body.data.vendorId).toBe(VENDOR_1_ID);
      expect(res.body.data.reallocatedCount).toBe(20);

      // Verify project code distribution reflects Vendor 1
      const distRes = await request(app)
        .get(`/api/v1/projects/${PROJECT_ID}/project-code-distribution`)
        .set('Authorization', `Bearer ${orgAdminToken}`);

      const abc = distRes.body.data.distribution.find((d) => d.project_code === 'PRJ-ABC');
      expect(abc.vendor_id).toBe(VENDOR_1_ID);
      expect(abc.vendor_name).toBeDefined();
    });

    test('Vendors are forbidden from assigning project codes (403 Forbidden)', async () => {
      const res = await request(app)
        .post(`/api/v1/projects/${PROJECT_ID}/assign-project-code`)
        .set('Authorization', `Bearer ${vendor1Token}`)
        .send({
          projectCode: 'PRJ-XYZ',
          vendorId: VENDOR_1_ID,
        });

      expect(res.status).toBe(403);
    });
  });

  describe('3. Support Redistribution: Seamlessly reassign project_code from Vendor 1 to Vendor 2', () => {
    test('POST /api/v1/projects/:id/assign-project-code redistributes PRJ-ABC to Vendor 2', async () => {
      const res = await request(app)
        .post(`/api/v1/projects/${PROJECT_ID}/assign-project-code`)
        .set('Authorization', `Bearer ${orgAdminToken}`)
        .send({
          projectCode: 'PRJ-ABC',
          vendorId: VENDOR_2_ID,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.projectCode).toBe('PRJ-ABC');
      expect(res.body.data.vendorId).toBe(VENDOR_2_ID);
      expect(res.body.data.isRedistribution).toBe(true);
      expect(res.body.data.previousVendorId).toBe(VENDOR_1_ID);
      expect(res.body.data.reallocatedCount).toBe(20);

      // Verify updated distribution
      const distRes = await request(app)
        .get(`/api/v1/projects/${PROJECT_ID}/project-code-distribution`)
        .set('Authorization', `Bearer ${orgAdminToken}`);

      const abc = distRes.body.data.distribution.find((d) => d.project_code === 'PRJ-ABC');
      expect(abc.vendor_id).toBe(VENDOR_2_ID);
    });
  });

  describe('4. Access Scoping for Surveying: Vendor vs Organization Admin', () => {
    test('Vendor 2 can ONLY access leads matching their assigned project_code (PRJ-ABC)', async () => {
      const res = await request(app)
        .get(`/api/v1/projects/${PROJECT_ID}/leads`)
        .set('Authorization', `Bearer ${vendor2Token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(20);

      // All leads must match PRJ-ABC and Vendor 2
      res.body.data.forEach((lead) => {
        expect(lead.project_code).toBe('PRJ-ABC');
        expect(lead.vendor_id).toBe(VENDOR_2_ID);
      });
    });

    test('Vendor 1 (without assigned project_code) cannot see leads of PRJ-ABC', async () => {
      const res = await request(app)
        .get(`/api/v1/projects/${PROJECT_ID}/leads`)
        .set('Authorization', `Bearer ${vendor1Token}`);

      expect(res.status).toBe(200);
      const abcLeads = res.body.data.filter((l) => l.project_code === 'PRJ-ABC');
      expect(abcLeads).toHaveLength(0);
    });

    test('Vendor 1 attempting to survey Vendor 2 lead (PRJ-ABC) is rejected with 403 Forbidden', async () => {
      // Find a lead in PRJ-ABC
      const lead = mockStore.campaign_leads.find(
        (l) => l.project_id === PROJECT_ID && l.project_code === 'PRJ-ABC'
      );
      expect(lead).toBeDefined();

      const res = await request(app)
        .post(`/api/v1/projects/${PROJECT_ID}/leads/${lead.id}/survey`)
        .set('Authorization', `Bearer ${vendor1Token}`)
        .send({
          responses: { q1: 'Option A' },
        });

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Multi-Vendor Isolation');
    });

    test('Vendor 2 surveying their assigned PRJ-ABC lead succeeds', async () => {
      const lead = mockStore.campaign_leads.find(
        (l) => l.project_id === PROJECT_ID && l.project_code === 'PRJ-ABC' && l.status !== 'COMPLETED'
      );
      expect(lead).toBeDefined();

      const res = await request(app)
        .post(`/api/v1/projects/${PROJECT_ID}/leads/${lead.id}/survey`)
        .set('Authorization', `Bearer ${vendor2Token}`)
        .send({
          responses: { q1: 'Yes', rating: 5 },
          outputData: { audit_status: 'COMPLETED' },
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('COMPLETED');
    });

    test('Organization Admin can access all leads across all project_codes', async () => {
      const res = await request(app)
        .get(`/api/v1/projects/${PROJECT_ID}/leads`)
        .set('Authorization', `Bearer ${orgAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(65);

      const uniqueCodes = new Set(res.body.data.map((l) => l.project_code));
      expect(uniqueCodes.size).toBeGreaterThanOrEqual(3);
    });

    test('Organization Admin can survey any lead / any project_code without restriction', async () => {
      const lead = mockStore.campaign_leads.find(
        (l) => l.project_id === PROJECT_ID && l.project_code === 'PRJ-XYZ' && l.status !== 'COMPLETED'
      );
      expect(lead).toBeDefined();

      const res = await request(app)
        .post(`/api/v1/projects/${PROJECT_ID}/leads/${lead.id}/survey`)
        .set('Authorization', `Bearer ${orgAdminToken}`)
        .send({
          responses: { q1: 'Admin Survey Verified' },
          outputData: { audit_status: 'COMPLETED' },
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('COMPLETED');
    });
  });
});
