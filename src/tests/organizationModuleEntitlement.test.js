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
        .send({ enabled_modules: ['CAPI', 'TVC'] });

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

    it('Master Admin should be restricted from operational survey routes (like TVC)', async () => {
      // Disable TVC
      await request(app)
        .put('/api/v1/organizations/11111111-1111-1111-1111-111111111111/modules')
        .set('Authorization', `Bearer ${masterAdminToken}`)
        .send({ enabled_modules: ['CAPI'] });

      const res = await request(app)
        .get('/api/v1/tvc/metrics')
        .set('Authorization', `Bearer ${masterAdminToken}`);

      // Master Admin is restricted from survey operations
      expect(res.status).toBe(403);
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

  describe('4. Subscription Service Pricing Defaults & AI_AUDIT Entitlement Sync', () => {
    const subscriptionService = require('../modules/subscriptions/subscription.service');
    const { requireModuleEnabled } = require('../middlewares/organizationModuleEntitlement.middleware');

    it('Pricing configuration should default to 10 BDT per seat and 50 BDT per AI audit license', async () => {
      const pricing = await subscriptionService.getPricingConfig();
      expect(pricing.basePrice).toBe(10);
      expect(pricing.aiAuditPrice).toBe(50);
      expect(pricing.currency).toBe('BDT');
    });

    it('Provisioning subscription with AI Audit (hasAiAudit: true, aiLicense: 5) should auto-enable AI_AUDIT in enabled_modules and enable_ai_audit: true', async () => {
      const orgId = '11111111-1111-1111-1111-111111111111';
      const result = await subscriptionService.createOrRenewSubscription(
        {
          organizationId: orgId,
          planName: 'GROWTH_TIER',
          billingCycle: 'MONTHLY',
          userLicense: 20,
          aiLicense: 5,
          hasAiAudit: true,
        },
        { isMasterAdmin: true, organizationId: orgId }
      );

      expect(result).toBeDefined();
      const org = mockStore.findById('organizations', orgId);
      expect(org.enable_ai_audit).toBe(true);
      expect(org.enabled_modules).toContain('AI_AUDIT');
    });

    it('Provisioning subscription without AI Audit (aiLicense: 0, hasAiAudit: false) should remove AI_AUDIT from enabled_modules and set enable_ai_audit: false', async () => {
      const orgId = '11111111-1111-1111-1111-111111111111';
      const result = await subscriptionService.createOrRenewSubscription(
        {
          organizationId: orgId,
          planName: 'BASIC_TIER',
          billingCycle: 'MONTHLY',
          userLicense: 10,
          aiLicense: 0,
          hasAiAudit: false,
        },
        { isMasterAdmin: true, organizationId: orgId }
      );

      expect(result).toBeDefined();
      const org = mockStore.findById('organizations', orgId);
      expect(org.enable_ai_audit).toBe(false);
      expect(org.enabled_modules).not.toContain('AI_AUDIT');
      expect(org.enabled_modules).not.toContain('AI_AUDIT_QC');
    });

    it('Middleware organizationModuleEntitlement("AI_AUDIT") should permit access when enable_ai_audit is true', async () => {
      const orgId = '11111111-1111-1111-1111-111111111111';
      mockStore.update('organizations', orgId, {
        enable_ai_audit: true,
        enabled_modules: ['CAPI', 'CATI'],
      });

      const middleware = requireModuleEnabled('AI_AUDIT');
      let calledNext = false;
      let errPassed = null;
      const req = {
        user: {
          id: '66666666-6666-6666-6666-666666666602',
          role: 'ORGANIZATION_ADMIN',
          organizationId: orgId,
        },
      };
      const res = {};
      await middleware(req, res, (err) => {
        calledNext = true;
        errPassed = err;
      });

      expect(calledNext).toBe(true);
      expect(errPassed).toBeUndefined();
    });

    it('Middleware organizationModuleEntitlement("AI_AUDIT") should permit access when enabled_modules includes AI_AUDIT', async () => {
      const orgId = '11111111-1111-1111-1111-111111111111';
      mockStore.update('organizations', orgId, {
        enable_ai_audit: false,
        enabled_modules: ['CAPI', 'CATI', 'AI_AUDIT'],
      });

      const middleware = requireModuleEnabled('AI_AUDIT');
      let calledNext = false;
      let errPassed = null;
      const req = {
        user: {
          id: '66666666-6666-6666-6666-666666666602',
          role: 'ORGANIZATION_ADMIN',
          organizationId: orgId,
        },
      };
      const res = {};
      await middleware(req, res, (err) => {
        calledNext = true;
        errPassed = err;
      });

      expect(calledNext).toBe(true);
      expect(errPassed).toBeUndefined();
    });

    it('Middleware organizationModuleEntitlement("AI_AUDIT") should reject access when neither flag nor module list contains AI_AUDIT', async () => {
      const orgId = '11111111-1111-1111-1111-111111111111';
      mockStore.update('organizations', orgId, {
        enable_ai_audit: false,
        enabled_modules: ['CAPI', 'CATI'],
      });

      const middleware = requireModuleEnabled('AI_AUDIT');
      let errPassed = null;
      const req = {
        user: {
          id: '66666666-6666-6666-6666-666666666602',
          role: 'ORGANIZATION_ADMIN',
          organizationId: orgId,
        },
      };
      const res = {};
      await middleware(req, res, (err) => {
        errPassed = err;
      });

      expect(errPassed).toBeDefined();
      expect(errPassed.statusCode).toBe(403);
      expect(errPassed.code).toBe('MODULE_NOT_ENABLED');
    });
  });

  afterAll(async () => {
    try {
      await request(app)
        .put('/api/v1/organizations/11111111-1111-1111-1111-111111111111/modules')
        .set('Authorization', `Bearer ${masterAdminToken}`)
        .send({ enabled_modules: ['CAPI'] });
    } catch (_) {}
  });
});
