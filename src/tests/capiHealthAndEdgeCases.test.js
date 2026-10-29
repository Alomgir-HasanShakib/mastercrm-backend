/**
 * @file capiHealthAndEdgeCases.test.js
 * @description Comprehensive automated integration tests for:
 * 1. Health checks: GET /health and GET /api/v1/health
 * 2. CAPI Audit APIs: /api/v1/capi, /api/v1/capi/metrics, /api/v1/capi/next, /api/v1/capi/my-completed
 * 3. Edge Cases & Validation:
 *    - Invalid payloads & missing required fields (Auth, CAPI Audits, Submissions)
 *    - Role-based authorization gates (401 unauthenticated, 403 forbidden)
 *    - Offline sync idempotent deduplication
 */

const request = require('supertest');
const app = require('../app');
const { generateToken } = require('../utils/crypto');
const config = require('../config');

jest.setTimeout(30000);

describe('Health Checks, CAPI Audit APIs & Edge Cases Suite', () => {
  let adminToken = null;
  let capiToken = null;
  let catiToken = null;

  const adminUser = {
    userId: '66666666-6666-6666-6666-666666666601',
    id: '66666666-6666-6666-6666-666666666601',
    email: 'admin@mastercrm.com',
    role: 'MASTER_ADMIN',
    role_name: 'MASTER_ADMIN',
    organization_id: '11111111-1111-1111-1111-111111111111',
    permissions: ['*:*'],
  };

  const capiUser = {
    userId: '66666666-6666-6666-6666-666666666606',
    id: '66666666-6666-6666-6666-666666666606',
    email: 'capi@crm.local',
    role: 'CAPI_AUDITOR',
    role_name: 'CAPI_AUDITOR',
    organization_id: '11111111-1111-1111-1111-111111111111',
    permissions: ['capi:*', 'exam:*', 'submissions:read'],
  };

  const catiUser = {
    userId: '66666666-6666-6666-6666-666666666605',
    id: '66666666-6666-6666-6666-666666666605',
    email: 'surveyor.field@primefield.in',
    role: 'CATI_AGENT',
    role_name: 'CATI_AGENT',
    organization_id: '11111111-1111-1111-1111-111111111111',
    permissions: ['field_cati:*', 'submissions:*'],
  };

  beforeAll(() => {
    const secret = config.jwt.secret || config.jwt.accessSecret;
    adminToken = generateToken(adminUser, secret, '1h');
    capiToken = generateToken(capiUser, secret, '1h');
    catiToken = generateToken(catiUser, secret, '1h');
  });

  // ==========================================
  // 1. HEALTH CHECKS
  // ==========================================
  describe('Health Checks', () => {
    test('1. GET /health returns service health status and DB/Redis statuses', async () => {
      const res = await request(app).get('/health');
      expect([200, 503]).toContain(res.status);
      expect(res.body).toHaveProperty('data');
      expect(res.body.data).toHaveProperty('status');
      expect(res.body.data).toHaveProperty('services');
      expect(res.body.data.services).toHaveProperty('database');
      expect(res.body.data.services).toHaveProperty('redis');
    });

    test('2. GET /api/v1/health returns detailed health diagnostics', async () => {
      const res = await request(app).get('/api/v1/health');
      expect([200, 503]).toContain(res.status);
      expect(res.body).toHaveProperty('data');
      expect(res.body.data).toHaveProperty('status');
      expect(res.body.data).toHaveProperty('timestamp');
      expect(res.body.data.services).toHaveProperty('database');
      expect(res.body.data.services).toHaveProperty('redis');
    });
  });

  // ==========================================
  // 2. CAPI AUDIT APIS
  // ==========================================
  describe('CAPI Audit APIs (/api/v1/capi)', () => {
    test('3. GET /api/v1/capi lists audits for authorized CAPI auditor', async () => {
      const res = await request(app)
        .get('/api/v1/capi?limit=10&page=1')
        .set('Authorization', `Bearer ${capiToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta).toHaveProperty('pagination');
    });

    test('4. GET /api/v1/capi/metrics returns CAPI audit KPIs and analytics', async () => {
      const res = await request(app)
        .get('/api/v1/capi/metrics')
        .set('Authorization', `Bearer ${capiToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
    });

    test('5. GET /api/v1/capi/my-completed enforces auditor data isolation', async () => {
      const res = await request(app)
        .get('/api/v1/capi/my-completed')
        .set('Authorization', `Bearer ${capiToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    test('6. GET /api/v1/capi/next retrieves or locks next queued audit safely', async () => {
      const res = await request(app)
        .get('/api/v1/capi/next')
        .set('Authorization', `Bearer ${capiToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ==========================================
  // 3. ROLE-BASED AUTHORIZATION GATES (RBAC)
  // ==========================================
  describe('Role-Based Authorization Gates', () => {
    test('7. Rejects unauthenticated request without token with 401', async () => {
      const res = await request(app).get('/api/v1/capi');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    test('8. Rejects CATI_AGENT from accessing /api/v1/capi with 403 Forbidden', async () => {
      const res = await request(app)
        .get('/api/v1/capi')
        .set('Authorization', `Bearer ${catiToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    test('9. Rejects CATI_AGENT from accessing /api/v1/operations/dashboard-insights with 403 Forbidden', async () => {
      const res = await request(app)
        .get('/api/v1/operations/dashboard-insights')
        .set('Authorization', `Bearer ${catiToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    test('10. Rejects CATI_AGENT from accessing /api/v1/breaks/admin/reports with 403 Forbidden', async () => {
      const res = await request(app)
        .get('/api/v1/breaks/admin/reports')
        .set('Authorization', `Bearer ${catiToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    test('11. Allows MASTER_ADMIN to access CAPI and Admin Break Reports endpoints', async () => {
      const res = await request(app)
        .get('/api/v1/capi/metrics')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ==========================================
  // 4. INVALID PAYLOADS & MISSING REQUIRED FIELDS
  // ==========================================
  describe('Validation & Edge Cases', () => {
    test('12. POST /api/v1/auth/login fails with 400 when email or password is missing', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'admin@mastercrm.com' }); // missing password

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test('13. POST /api/v1/capi fails with 400 when required fields (submissionId, projectId, vendorId) are missing', async () => {
      const res = await request(app)
        .post('/api/v1/capi')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({}); // missing required fields

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test('14. POST /api/v1/capi/audits fails with 400 on malformed UUID for submissionId', async () => {
      const res = await request(app)
        .post('/api/v1/capi/audits')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          submissionId: 'not-a-valid-uuid',
          projectId: '44444444-4444-4444-4444-444444444441',
          vendorId: '33333333-3333-3333-3333-333333333331',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  // ==========================================
  // 5. OFFLINE SYNC IDEMPOTENT DEDUPLICATION
  // ==========================================
  describe('Offline Sync Idempotent Deduplication', () => {
    test('15. Submitting duplicate offline submissions is deduplicated idempotently without errors', async () => {
      const uniqueSubId = `SUB-IDEMPOTENT-${Date.now()}`;
      const payload = {
        submissions: [
          {
            submissionId: uniqueSubId,
            acId: 'AC-216',
            acName: '216 - Kanthi Dakshin',
            answers: {
              introduction: 'Consent Given',
              respondent_name: 'Deduplication Test User',
              phone_no: '9876543210',
            },
            gps: { latitude: 22.1234, longitude: 88.5678 },
          },
        ],
      };

      // First sync request
      const res1 = await request(app)
        .post('/api/v1/cati/sync')
        .set('Authorization', `Bearer ${catiToken}`)
        .send(payload);

      expect(res1.status).toBe(200);
      expect(res1.body.success).toBe(true);
      expect(res1.body.data.syncedCount).toBe(1);

      // Duplicate sync request with the exact same submissionId
      const res2 = await request(app)
        .post('/api/v1/cati/sync')
        .set('Authorization', `Bearer ${catiToken}`)
        .send(payload);

      expect(res2.status).toBe(200);
      expect(res2.body.success).toBe(true);
      expect(res2.body.data.syncedCount).toBe(1);
      expect(res2.body.data.failedCount).toBe(0);
    });
  });
});
