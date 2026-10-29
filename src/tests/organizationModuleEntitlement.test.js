/**
 * @file organizationModuleEntitlement.test.js
 * @description Comprehensive unit & integration tests for Organization Module Entitlement & Access Control.
 */

const request = require('supertest');
const app = require('../app');
const { generateToken } = require('../utils/crypto');
const config = require('../config');
const mockStore = require('../database/mockStore');

describe('Organization Module Entitlement & Access Control Suite', () => {
  const secret = config.jwt.secret || config.jwt.accessSecret;

  // Master Admin (Super Admin) Token
  const masterAdminToken = generateToken(
    {
      userId: '66666666-6666-6666-6666-666666666601',
      id: '66666666-6666-6666-6666-666666666601',
      email: 'admin@mastercrm.com',
      role: 'MASTER_ADMIN',
      role_name: 'MASTER_ADMIN',
      organizationId: '11111111-1111-1111-1111-111111111111',
      organization_id: '11111111-1111-1111-1111-111111111111',
      permissions: ['*'],
    },
    secret,
    '1h'
  );

  // Tenant Org Admin Token
  const orgAdminToken = generateToken(
    {
      userId: '66666666-6666-6666-6666-666666666602',
      id: '66666666-6666-6666-6666-666666666602',
      email: 'orgadmin@mastercrm.com',
      role: 'ORGANIZATION_ADMIN',
      role_name: 'ORGANIZATION_ADMIN',
      organizationId: '11111111-1111-1111-1111-111111111111',
      organization_id: '11111111-1111-1111-1111-111111111111',
      permissions: ['*'],
    },
    secret,
    '1h'
  );

  // Operational Agent Token (TVC Agent)
  const tvcAgentToken = generateToken(
    {
      userId: '66666666-6666-6666-6666-666666666603',
      id: '66666666-6666-6666-6666-666666666603',
      email: 'tvc@mastercrm.com',
      role: 'TVC_AGENT',
      role_name: 'TVC_AGENT',
      organizationId: '11111111-1111-1111-1111-111111111111',
      organization_id: '11111111-1111-1111-1111-111111111111',
      permissions: ['tvc:*', 'dialer:*', 'submissions:read'],
    },
    secret,
    '1h'
  );

  beforeEach(() => {
    // Reset test organization modules in mockStore
    const org = mockStore.findById('organizations', '11111111-1111-1111-1111-111111111111');
    if (org) {
      org.enabled_modules = ['CAPI', 'CATI', 'TVC', 'FA', 'SUPER_AUDIT'];
    }
  });

  describe('1. Organization Module Entitlement Configuration Endpoints', () => {
    it('Super Admin should successfully update enabled modules via PUT /organizations/:id/modules', async () => {
      const res = await request(app)
        .put('/api/v1/organizations/11111111-1111-1111-1111-111111111111/modules')
        .set('Authorization', `Bearer ${masterAdminToken}`)
        .send({
          enabled_modules: ['CAPI', 'CATI'],
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.enabled_modules).toEqual(expect.arrayContaining(['CAPI', 'CATI']));
      expect(res.body.data.enabled_modules).not.toContain('TVC');
    });

    it('Super Admin should successfully update enabled modules via PATCH /organizations/:id/modules', async () => {
      const res = await request(app)
        .patch('/api/v1/organizations/11111111-1111-1111-1111-111111111111/modules')
        .set('Authorization', `Bearer ${masterAdminToken}`)
        .send({
          enabledModules: ['TVC', 'SUPER_AUDIT'],
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.enabled_modules).toEqual(expect.arrayContaining(['TVC', 'SUPER_AUDIT']));
      expect(res.body.data.enabled_modules).not.toContain('CAPI');
    });

    it('Non-Super Admin (Organization Admin) should be rejected from updating organization modules with 403', async () => {
      const res = await request(app)
        .put('/api/v1/organizations/11111111-1111-1111-1111-111111111111/modules')
        .set('Authorization', `Bearer ${orgAdminToken}`)
        .send({
          enabled_modules: ['CAPI', 'TVC'],
        });

      expect(res.status).toBe(403);
    });

    it('Super Admin creating an organization with custom modules should store and return enabled_modules', async () => {
      const newOrgCode = `ORG_MOD_${Date.now().toString().slice(-4)}`;
      const res = await request(app)
        .post('/api/v1/organizations')
        .set('Authorization', `Bearer ${masterAdminToken}`)
        .send({
          name: 'Module Test Org',
          code: newOrgCode,
          enabled_modules: ['CAPI', 'CATI', 'TVC'],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.enabled_modules).toEqual(expect.arrayContaining(['CAPI', 'CATI', 'TVC']));
      expect(res.body.data.enabled_modules).not.toContain('SUPER_AUDIT');
    });
  });

  describe('2. Backend Operational Route Module Gates (/tvc, /capi, /cati, etc.)', () => {
    it('Should allow operational access to TVC endpoints when TVC module is enabled', async () => {
      // Ensure TVC is enabled via Super Admin endpoint
      await request(app)
        .put('/api/v1/organizations/11111111-1111-1111-1111-111111111111/modules')
        .set('Authorization', `Bearer ${masterAdminToken}`)
        .send({ enabled_modules: ['CAPI', 'CATI', 'TVC', 'FA', 'SUPER_AUDIT'] });

      const res = await request(app)
        .get('/api/v1/tvc/metrics')
        .set('Authorization', `Bearer ${tvcAgentToken}`);

      // Should succeed or return normal endpoint response (not 403 MODULE_NOT_ENABLED)
      expect(res.status).not.toBe(403);
    });

    it('Should block access to TVC endpoints with 403 MODULE_NOT_ENABLED when TVC is disabled', async () => {
      // Disable TVC for the organization via Super Admin endpoint
      await request(app)
        .put('/api/v1/organizations/11111111-1111-1111-1111-111111111111/modules')
        .set('Authorization', `Bearer ${masterAdminToken}`)
        .send({ enabled_modules: ['CAPI', 'CATI', 'FA'] }); // TVC omitted

      const res = await request(app)
        .get('/api/v1/tvc/metrics')
        .set('Authorization', `Bearer ${tvcAgentToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('MODULE_NOT_ENABLED');
      expect(res.body.error.message).toContain('Module not enabled for your organization');
    });

    it('Master Admin should bypass module gate even when module is disabled in organization context', async () => {
      // Disable TVC
      await request(app)
        .put('/api/v1/organizations/11111111-1111-1111-1111-111111111111/modules')
        .set('Authorization', `Bearer ${masterAdminToken}`)
        .send({ enabled_modules: ['CAPI'] });

      const res = await request(app)
        .get('/api/v1/tvc/metrics')
        .set('Authorization', `Bearer ${masterAdminToken}`);

      // Master Admin is bypassed
      expect(res.status).not.toBe(403);
    });
  });

  describe('3. Auth Profile & Me Endpoint Module Entitlements', () => {
    it('GET /api/v1/auth/me should return enabled_modules and organization details', async () => {
      await request(app)
        .put('/api/v1/organizations/11111111-1111-1111-1111-111111111111/modules')
        .set('Authorization', `Bearer ${masterAdminToken}`)
        .send({ enabled_modules: ['CAPI', 'CATI', 'TVC'] });

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${orgAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.enabled_modules).toBeDefined();
      expect(res.body.data.enabled_modules).toEqual(expect.arrayContaining(['CAPI', 'CATI', 'TVC']));
    });
  });

  afterAll(async () => {
    try {
      await request(app)
        .put('/api/v1/organizations/11111111-1111-1111-1111-111111111111/modules')
        .set('Authorization', `Bearer ${masterAdminToken}`)
        .send({ enabled_modules: ['CAPI', 'CATI', 'TVC', 'FA', 'SUPER_AUDIT'] });
    } catch (_) {}
  });
});
