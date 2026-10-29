/**
 * @file multiVendorCampaign.test.js
 * @description Comprehensive automated integration tests for:
 * 1. Multi-Vendor Campaign Equal Split:
 *    - 65 leads evenly distributed across 5 vendors (65 / 5 = 13 leads per vendor, 0 remainder)
 *    - Uneven remainder pool handling (e.g. 67 leads / 5 vendors = 13 leads each, 2 pending remainder)
 *    - Automatic reassignment of remainder pool leads across active vendors
 * 2. Strict Multi-Vendor Data Isolation:
 *    - Vendor A can NEVER see, access, or survey leads belonging to Vendor B
 *    - Vendor A accessing Vendor B's lead returns 403 Forbidden
 * 3. Campaign-Questionnaire Binding:
 *    - Selecting existing Questionnaire Builder questionnaires for a campaign
 *    - Binding one questionnaire to multiple campaigns simultaneously
 *    - Switching questionnaires on a campaign
 *    - Building and binding a new questionnaire directly for a campaign
 */

const request = require('supertest');
const app = require('../app');
const { generateToken } = require('../utils/crypto');
const mockStore = require('../database/mockStore');

jest.setTimeout(30000);

describe('Multi-Vendor Allocation & Campaign Questionnaire Binding Suite', () => {
  const PROJECT_ID = '44444444-4444-4444-4444-444444444441';
  const PROJECT_2_ID = '44444444-4444-4444-4444-444444444442';

  const VENDOR_1_ID = '33333333-3333-3333-3333-333333333331';
  const VENDOR_2_ID = '33333333-3333-3333-3333-333333333332';
  const VENDOR_3_ID = '33333333-3333-3333-3333-333333333333';
  const VENDOR_4_ID = '33333333-3333-3333-3333-333333333334';
  const VENDOR_5_ID = '33333333-3333-3333-3333-333333333335';

  const FIVE_VENDORS = [VENDOR_1_ID, VENDOR_2_ID, VENDOR_3_ID, VENDOR_4_ID, VENDOR_5_ID];

  let adminToken;
  let vendor1Token;
  let vendor2Token;

  beforeAll(() => {
    adminToken = generateToken({
      userId: '66666666-6666-6666-6666-666666666601',
      id: '66666666-6666-6666-6666-666666666601',
      email: 'admin@mastercrm.com',
      role: 'MASTER_ADMIN',
      organization_id: '11111111-1111-1111-1111-111111111111',
      permissions: ['*:*'],
    });

    vendor1Token = generateToken({
      userId: '66666666-6666-6666-6666-666666666611',
      id: '66666666-6666-6666-6666-666666666611',
      email: 'agent1@vendor1.in',
      role: 'CATI_AGENT',
      vendor_id: VENDOR_1_ID,
      vendorId: VENDOR_1_ID,
      organization_id: '11111111-1111-1111-1111-111111111111',
      permissions: ['submissions:read', 'submissions:create'],
    });

    vendor2Token = generateToken({
      userId: '66666666-6666-6666-6666-666666666612',
      id: '66666666-6666-6666-6666-666666666612',
      email: 'agent2@vendor2.in',
      role: 'CATI_AGENT',
      vendor_id: VENDOR_2_ID,
      vendorId: VENDOR_2_ID,
      organization_id: '11111111-1111-1111-1111-111111111111',
      permissions: ['submissions:read', 'submissions:create'],
    });
  });

  // ==========================================================================
  // REQUIREMENT 1: MULTI-VENDOR CAMPAIGN EQUAL SPLIT & STRICT ISOLATION
  // ==========================================================================
  describe('Multi-Vendor Campaign Equal Split (65 leads / 5 vendors = 13 leads)', () => {
    test('1. POST /api/v1/projects/:id/leads/allocate splits 65 leads evenly across 5 vendors (13 each, 0 remainder)', async () => {
      const res = await request(app)
        .post(`/api/v1/projects/${PROJECT_ID}/leads/allocate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          vendorIds: FIVE_VENDORS,
          reallocateAll: true,
          method: 'EQUAL_SPLIT',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.totalLeads).toBe(65);
      expect(res.body.data.vendorCount).toBe(5);
      expect(res.body.data.perVendorCount).toBe(13); // 65 / 5 = exactly 13!
      expect(res.body.data.remainderCount).toBe(0); // 0 remainder

      expect(res.body.data.allocatedVendors).toHaveLength(5);
      res.body.data.allocatedVendors.forEach((v) => {
        expect(v.allocatedCount).toBe(13);
      });
    });

    test('2. Remainder handling: Uneven split (67 leads / 5 vendors = 13 each, 2 pending remainder)', async () => {
      // Add 2 extra unallocated leads to project
      mockStore.campaign_leads.push({
        id: 'lead-c1-extra-0001',
        project_id: PROJECT_ID,
        vendor_id: null,
        phone_number: '+91-9899001101',
        respondent_name: 'Extra Lead 1',
        status: 'PENDING',
        created_at: new Date(),
      });
      mockStore.campaign_leads.push({
        id: 'lead-c1-extra-0002',
        project_id: PROJECT_ID,
        vendor_id: null,
        phone_number: '+91-9899001102',
        respondent_name: 'Extra Lead 2',
        status: 'PENDING',
        created_at: new Date(),
      });

      const res = await request(app)
        .post(`/api/v1/projects/${PROJECT_ID}/leads/allocate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          vendorIds: FIVE_VENDORS,
          reallocateAll: true,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.totalLeads).toBe(67);
      expect(res.body.data.perVendorCount).toBe(13);
      expect(res.body.data.remainderCount).toBe(2); // 2 remainder leads stay in pending pool
    });

    test('3. POST /api/v1/projects/:id/leads/auto-assign auto-assigns remainder leads to active vendors', async () => {
      const res = await request(app)
        .post(`/api/v1/projects/${PROJECT_ID}/leads/auto-assign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send();

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.assignedCount).toBe(2);
      expect(res.body.data.remainderCount).toBe(0);
    });

    test('4. Strict Multi-Vendor Data Isolation: Vendor 1 can ONLY see Vendor 1 leads', async () => {
      const res = await request(app)
        .get(`/api/v1/projects/${PROJECT_ID}/leads`)
        .set('Authorization', `Bearer ${vendor1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);

      // Verify EVERY single returned lead belongs strictly to Vendor 1!
      res.body.data.forEach((lead) => {
        expect(lead.vendor_id).toBe(VENDOR_1_ID);
        expect(lead.vendor_id).not.toBe(VENDOR_2_ID);
      });
    });

    test('5. Strict Multi-Vendor Data Isolation: Vendor 2 can ONLY see Vendor 2 leads', async () => {
      const res = await request(app)
        .get(`/api/v1/projects/${PROJECT_ID}/leads`)
        .set('Authorization', `Bearer ${vendor2Token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);

      // Verify EVERY single returned lead belongs strictly to Vendor 2!
      res.body.data.forEach((lead) => {
        expect(lead.vendor_id).toBe(VENDOR_2_ID);
        expect(lead.vendor_id).not.toBe(VENDOR_1_ID);
      });
    });

    test('6. Strict Isolation Violation Check: Vendor 1 surveying Vendor 2 lead returns 403 Forbidden', async () => {
      // Find a lead belonging to Vendor 2
      const vendor2Lead = mockStore.campaign_leads.find(
        (l) => l.project_id === PROJECT_ID && l.vendor_id === VENDOR_2_ID
      );
      expect(vendor2Lead).toBeDefined();

      // Vendor 1 attempts to survey Vendor 2's lead
      const res = await request(app)
        .post(`/api/v1/projects/${PROJECT_ID}/leads/${vendor2Lead.id}/survey`)
        .set('Authorization', `Bearer ${vendor1Token}`)
        .send({
          responses: { q1: 'Option A' },
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/Multi-Vendor Isolation|forbidden/i);
    });

    test('7. Authorized Survey: Vendor 1 surveying their OWN lead succeeds', async () => {
      // Find a lead belonging to Vendor 1
      const vendor1Lead = mockStore.campaign_leads.find(
        (l) => l.project_id === PROJECT_ID && l.vendor_id === VENDOR_1_ID
      );
      expect(vendor1Lead).toBeDefined();

      const res = await request(app)
        .post(`/api/v1/projects/${PROJECT_ID}/leads/${vendor1Lead.id}/survey`)
        .set('Authorization', `Bearer ${vendor1Token}`)
        .send({
          responses: { q1: 'Option B', satisfaction: 5 },
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('COMPLETED');
    });
  });

  // ==========================================================================
  // REQUIREMENT 2: CAMPAIGN-QUESTIONNAIRE BINDING
  // ==========================================================================
  describe('Campaign-Questionnaire Binding Studio', () => {
    test('8. GET /api/v1/projects/available-questionnaires lists templates from Question Builder', async () => {
      const res = await request(app)
        .get('/api/v1/projects/available-questionnaires')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data[0]).toHaveProperty('name');
      expect(res.body.data[0]).toHaveProperty('module');
    });

    test('9. POST /api/v1/projects/:id/questionnaires/bind binds Question Builder questionnaire to campaign', async () => {
      const targetQuestionnaireId = '77777777-7777-7777-7777-777777777701';

      const res = await request(app)
        .post(`/api/v1/projects/${PROJECT_ID}/questionnaires/bind`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          questionnaireId: targetQuestionnaireId,
          module: 'CATI',
          isPrimary: true,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.questionnaireId).toBe(targetQuestionnaireId);
      expect(res.body.data.isPrimary).toBe(true);
    });

    test('10. One questionnaire can be bound to multiple campaigns simultaneously', async () => {
      const sharedQuestionnaireId = '77777777-7777-7777-7777-777777777701';

      // Bind to Campaign 1
      await request(app)
        .post(`/api/v1/projects/${PROJECT_ID}/questionnaires/bind`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ questionnaireId: sharedQuestionnaireId, isPrimary: true });

      // Bind to Campaign 2
      const res2 = await request(app)
        .post(`/api/v1/projects/${PROJECT_2_ID}/questionnaires/bind`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ questionnaireId: sharedQuestionnaireId, isPrimary: true });

      expect(res2.status).toBe(200);
      expect(res2.body.data.questionnaireId).toBe(sharedQuestionnaireId);

      // Verify both campaigns have it bound
      const bound1 = await request(app)
        .get(`/api/v1/projects/${PROJECT_ID}/questionnaires`)
        .set('Authorization', `Bearer ${adminToken}`);
      const bound2 = await request(app)
        .get(`/api/v1/projects/${PROJECT_2_ID}/questionnaires`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(bound1.body.data.some((q) => q.questionnaire_id === sharedQuestionnaireId)).toBe(true);
      expect(bound2.body.data.some((q) => q.questionnaire_id === sharedQuestionnaireId)).toBe(true);
    });

    test('11. Users can switch questionnaires on a campaign at any time', async () => {
      const secondQuestionnaireId = '77777777-7777-7777-7777-777777777702';

      const res = await request(app)
        .post(`/api/v1/projects/${PROJECT_ID}/questionnaires/bind`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          questionnaireId: secondQuestionnaireId,
          module: 'CAPI',
          isPrimary: true,
        });

      expect(res.status).toBe(200);

      // Verify active questionnaire on project detail
      const projectRes = await request(app)
        .get(`/api/v1/projects/${PROJECT_ID}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(projectRes.status).toBe(200);
      expect(projectRes.body.data.activeQuestionnaire.questionnaire_id).toBe(secondQuestionnaireId);
    });

    test('12. POST /api/v1/projects/:id/questionnaires/create builds campaign-specific questionnaire', async () => {
      const res = await request(app)
        .post(`/api/v1/projects/${PROJECT_ID}/questionnaires/create`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Bihar 2026 Voter Sentiment Deep Dive',
          module: 'CATI',
          status: 'DRAFT',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Bihar 2026 Voter Sentiment Deep Dive');
      expect(res.body.data.project_id).toBe(PROJECT_ID);
    });
  });
});
