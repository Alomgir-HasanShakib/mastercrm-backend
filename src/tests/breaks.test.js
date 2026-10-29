/**
 * @file breaks.test.js
 * @description Integration and unit tests for Operational Break & Productivity Management API.
 */

const request = require('supertest');
const app = require('../app');
const { generateToken } = require('../utils/crypto');
const config = require('../config');

jest.setTimeout(30000);

describe('Operational Break & Productivity Management System API', () => {
  let agentToken = null;
  let adminToken = null;
  const agentUser = {
    userId: '66666666-6666-6666-6666-666666666605',
    id: '66666666-6666-6666-6666-666666666605',
    email: 'rati.cati@primefield.in',
    role: 'CATI_AGENT',
    role_name: 'CATI_AGENT',
    organization_id: '11111111-1111-1111-1111-111111111111',
    permissions: ['field_cati:*', 'submissions:*'],
  };

  const adminUser = {
    userId: '66666666-6666-6666-6666-666666666601',
    id: '66666666-6666-6666-6666-666666666601',
    email: 'admin@mastercrm.com',
    role: 'MASTER_ADMIN',
    role_name: 'MASTER_ADMIN',
    organization_id: '11111111-1111-1111-1111-111111111111',
    permissions: ['*:*'],
  };

  beforeAll(() => {
    const secret = config.jwt.secret || config.jwt.accessSecret;
    agentToken = generateToken(agentUser, secret, '1h');
    adminToken = generateToken(adminUser, secret, '1h');
  });

  test('1. GET /api/v1/breaks/my-today retrieves current status for agent', async () => {
    const res = await request(app)
      .get('/api/v1/breaks/my-today')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(Array.isArray(res.body.data.todayBreaks)).toBe(true);
    expect(typeof res.body.data.todayTotalMinutes).toBe('number');
  });

  test('2. POST /api/v1/breaks/start initiates a new break', async () => {
    const res = await request(app)
      .post('/api/v1/breaks/start')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ breakType: 'TEA' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.status).toBe('ACTIVE');
    expect(res.body.data.breakType).toBe('TEA');
    expect(res.body.data.startTime).toBeDefined();
  });

  test('3. POST /api/v1/breaks/start fails if an active break is already running', async () => {
    const res = await request(app)
      .post('/api/v1/breaks/start')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ breakType: 'LUNCH' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/already in progress/i);
  });

  test('4. GET /api/v1/breaks/my-today reflects the active break and live counter', async () => {
    const res = await request(app)
      .get('/api/v1/breaks/my-today')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.activeBreak).toBeDefined();
    expect(res.body.data.activeBreak.status).toBe('ACTIVE');
    expect(res.body.data.activeBreak.breakType).toBe('TEA');
  });

  test('5. POST /api/v1/breaks/end completes the active break and computes duration', async () => {
    const res = await request(app)
      .post('/api/v1/breaks/end')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.completedBreak).toBeDefined();
    expect(res.body.data.completedBreak.status).toBe('COMPLETED');
    expect(res.body.data.completedBreak.endTime).toBeDefined();
    expect(typeof res.body.data.todayTotalBreakMinutes).toBe('number');
  });

  test('6. POST /api/v1/breaks/end fails when no break is active', async () => {
    const res = await request(app)
      .post('/api/v1/breaks/end')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/no active break found/i);
  });

  test('7. GET /api/v1/breaks/admin/live returns live active breaks across agents', async () => {
    const res = await request(app)
      .get('/api/v1/breaks/admin/live')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(Array.isArray(res.body.data.activeBreaks)).toBe(true);
    expect(typeof res.body.data.count).toBe('number');
  });

  test('8. GET /api/v1/breaks/admin/reports returns filterable breakdown and agent summaries', async () => {
    const res = await request(app)
      .get('/api/v1/breaks/admin/reports?limit=10&page=1')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.records).toBeDefined();
    expect(res.body.data.pagination).toBeDefined();
    expect(res.body.data.summary).toBeDefined();
    expect(Array.isArray(res.body.data.summary.summaryByAgent)).toBe(true);
    expect(typeof res.body.data.summary.totalBreakMinutes).toBe('number');
  });

  test('9. Operational agent cannot access /api/v1/breaks/admin/reports (RBAC check)', async () => {
    const res = await request(app)
      .get('/api/v1/breaks/admin/reports')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });
});
