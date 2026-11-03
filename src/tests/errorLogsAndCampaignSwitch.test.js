/**
 * @file errorLogsAndCampaignSwitch.test.js
 * @description Comprehensive automated tests for:
 * 1. Campaign switch for Org Admin & Master Admin (resolving campaigns from DB/mockStore without NotFoundError)
 * 2. System error logs telemetry (backend 4xx/5xx logging, stats, client error ingest, export, and clear)
 */

const request = require('supertest');
const app = require('../app');
const authService = require('../modules/auth/auth.service');
const errorLogsService = require('../modules/system/errorLogs.service');
const errorLogsModel = require('../modules/system/errorLogs.model');
const { generateToken } = require('../utils/crypto');
const mockStore = require('../database/mockStore');

jest.setTimeout(30000);

describe('Campaign Switcher & System Error Logs Telemetry Suite', () => {
  let masterAdminToken = null;
  let orgAdminToken = null;
  let regularAgentToken = null;

  const masterAdminUser = {
    userId: '66666666-6666-6666-6666-666666666601',
    id: '66666666-6666-6666-6666-666666666601',
    email: 'admin@mastercrm.com',
    role: 'MASTER_ADMIN',
    role_name: 'MASTER_ADMIN',
    organization_id: '11111111-1111-1111-1111-111111111111',
    permissions: ['*:*'],
  };

  const orgAdminUser = {
    userId: '66666666-6666-6666-6666-666666666602',
    id: '66666666-6666-6666-6666-666666666602',
    email: 'orgadmin@mastercrm.com',
    role: 'ORGANIZATION_ADMIN',
    role_name: 'ORGANIZATION_ADMIN',
    organization_id: '11111111-1111-1111-1111-111111111111',
    permissions: ['*'],
  };

  const agentUser = {
    userId: '66666666-6666-6666-6666-666666666605',
    id: '66666666-6666-6666-6666-666666666605',
    email: 'cati@mastercrm.com',
    role: 'CATI_AGENT',
    role_name: 'CATI_AGENT',
    organization_id: '11111111-1111-1111-1111-111111111111',
    permissions: ['field_cati:*'],
  };

  beforeAll(async () => {
    masterAdminToken = generateToken(masterAdminUser);
    orgAdminToken = generateToken(orgAdminUser);
    regularAgentToken = generateToken(agentUser);
  });

  describe('1. Campaign Switcher Robustness', () => {
    it('allows Organization Admin to switch to any campaign in DB/mockStore without NotFoundError', async () => {
      // Find a project from mockStore
      const project = mockStore.projects[0];
      expect(project).toBeDefined();

      const result = await authService.switchCampaign(orgAdminUser.id, project.id);
      expect(result).toBeDefined();
      expect(result.activeCampaign).toBeDefined();
      expect(result.activeCampaign.id).toBe(project.id);
      expect(['ORGANIZATION_ADMIN', 'CLIENT_ADMIN', 'ORG_ADMIN']).toContain(result.role);
      expect(result.tokens?.accessToken).toBeDefined();
    });

    it('allows Master Admin or Org Admin to switch to campaign by code or custom campaign name', async () => {
      const result = await authService.switchCampaign(masterAdminUser.id, 'ABCD');
      expect(result).toBeDefined();
      expect(result.activeCampaign).toBeDefined();
      expect(result.activeCampaign.id).toBe('ABCD');
      expect(result.role).toBe('MASTER_ADMIN');
      expect(result.permissions).toContain('*');
    });

    it('POST /api/v1/auth/switch-campaign successfully switches active campaign over HTTP', async () => {
      const project = mockStore.projects[0];
      const res = await request(app)
        .post('/api/v1/auth/switch-campaign')
        .set('Authorization', `Bearer ${orgAdminToken}`)
        .send({ campaignId: project.id });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.activeCampaign).toBeDefined();
      expect(res.body.data.activeCampaign.id).toBe(project.id);
    });
  });

  describe('2. Master Admin System Error Logs Feature', () => {
    beforeEach(async () => {
      // Clear logs before test
      await errorLogsModel.clear();
    });

    it('POST /api/v1/system/error-logs/client ingests frontend client errors', async () => {
      const clientErrorPayload = {
        path: '/dashboard',
        method: 'GET',
        statusCode: 400,
        errorCode: 'UI_COMPONENT_ERROR',
        message: 'TypeError: Cannot read properties of undefined',
        stack: 'TypeError: Cannot read properties of undefined\n at Dashboard (Dashboard.jsx:42:10)',
        details: { component: 'DashboardMetrics', browser: 'Chrome 120' },
      };

      const res = await request(app)
        .post('/api/v1/system/error-logs/client')
        .set('Authorization', `Bearer ${orgAdminToken}`)
        .send(clientErrorPayload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.logged).toBe(true);

      // Verify log was saved
      const stats = await errorLogsService.getErrorStats();
      expect(stats.frontendErrors).toBeGreaterThanOrEqual(1);
    });

    it('GET /api/v1/system/error-logs lists paginated errors for Master Admin', async () => {
      // Create test errors
      await errorLogsService.logError({
        path: '/api/v1/projects',
        method: 'POST',
        status: 400,
        errorCode: 'VALIDATION_ERROR',
        message: 'Name is required',
        source: 'BACKEND',
      });

      await errorLogsService.logError({
        path: '/api/v1/submissions',
        method: 'GET',
        status: 500,
        errorCode: 'INTERNAL_SERVER_ERROR',
        message: 'Database query connection timeout',
        source: 'BACKEND',
      });

      const res = await request(app)
        .get('/api/v1/system/error-logs')
        .set('Authorization', `Bearer ${masterAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
      expect(res.body.meta).toBeDefined();
    });

    it('GET /api/v1/system/error-logs/stats returns KPI analytics breakdown', async () => {
      await errorLogsService.logError({
        path: '/api/v1/test-fail',
        method: 'GET',
        status: 500,
        errorCode: 'CRITICAL_ERROR',
        message: 'Server error',
        source: 'BACKEND',
      });

      const res = await request(app)
        .get('/api/v1/system/error-logs/stats')
        .set('Authorization', `Bearer ${masterAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.totalErrors).toBeGreaterThanOrEqual(1);
      expect(res.body.data.total5xx).toBeGreaterThanOrEqual(1);
    });

    it('POST /api/v1/system/error-logs/export exports error logs to CSV and Excel', async () => {
      await errorLogsService.logError({
        path: '/api/v1/export-test',
        method: 'GET',
        status: 404,
        errorCode: 'NOT_FOUND',
        message: 'Resource not found',
        source: 'BACKEND',
      });

      // Export CSV
      const csvRes = await request(app)
        .post('/api/v1/system/error-logs/export')
        .set('Authorization', `Bearer ${masterAdminToken}`)
        .send({ format: 'csv' });

      expect(csvRes.status).toBe(200);
      expect(csvRes.headers['content-type']).toContain('text/csv');
      expect(csvRes.text).toContain('Log ID');
      expect(csvRes.text).toContain('Endpoint Path');

      // Export Excel
      const xlsxRes = await request(app)
        .post('/api/v1/system/error-logs/export')
        .set('Authorization', `Bearer ${masterAdminToken}`)
        .send({ format: 'xlsx' });

      expect(xlsxRes.status).toBe(200);
      expect(xlsxRes.headers['content-type']).toContain('spreadsheetml');
    });

    it('DELETE /api/v1/system/error-logs purges logs for Master Admin', async () => {
      await errorLogsService.logError({
        path: '/api/v1/to-delete',
        method: 'GET',
        status: 500,
        errorCode: 'TEMP_ERR',
        message: 'Temporary',
      });

      const res = await request(app)
        .delete('/api/v1/system/error-logs')
        .set('Authorization', `Bearer ${masterAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const stats = await errorLogsService.getErrorStats();
      expect(stats.totalErrors).toBe(0);
    });

    it('automatically records 404 and 4xx/5xx requests into errorLogs telemetry via errorHandler middleware', async () => {
      await errorLogsModel.clear();

      // Trigger 404
      const res = await request(app)
        .get('/api/v1/non-existent-endpoint-for-testing-telemetry')
        .set('Authorization', `Bearer ${masterAdminToken}`);

      expect(res.status).toBe(404);

      // Check that telemetry captured this 404
      const errorLogs = await errorLogsModel.list();
      const recorded = errorLogs.find((l) => l.path.includes('non-existent-endpoint-for-testing-telemetry'));
      expect(recorded).toBeDefined();
      expect(recorded.status_code).toBe(404);
      expect(recorded.error_code).toBe('ROUTE_NOT_FOUND');
    });
  });
});
