/**
 * @file subscriptionGate.js
 * @description Enforcement middleware verifying active subscription and AI audit feature entitlements.
 */

const { db, withDbFallback } = require('../database/connection');
const mockStore = require('../database/mockStore');
const { SubscriptionRequiredError, AiAuditNotEnabledError } = require('../utils/errors');
const logger = require('../utils/logger');

/**
 * Middleware that verifies if the tenant/organization possesses an ACTIVE and non-expired subscription.
 * - MASTER_ADMIN users are strictly bypassed (always permitted).
 * - Other users must belong to an organization with status 'ACTIVE' and end_date >= NOW().
 * - If inactive, missing, or expired, returns HTTP 402 with code SUBSCRIPTION_REQUIRED.
 */
const requireActiveSubscription = async (req, res, next) => {
  try {
    const user = req.user || {};
    const role = (user.role || user.roleName || user.role_name || '').toUpperCase().replace(/\s+/g, '_');
    const isMasterAdmin = role === 'MASTER_ADMIN' || role === 'MASTER_ADMINISTRATOR' || Boolean(user.is_super_admin) || req.tenantContext?.isMasterAdmin === true;

    // 1. Bypass master admin users
    if (isMasterAdmin) {
      return next();
    }

    // 2. Resolve organization ID from user, request header, or tenant context
    const organizationId =
      user.organizationId ||
      user.organization_id ||
      req.tenantContext?.organizationId ||
      req.headers['x-organization-id'];

    if (!organizationId) {
      return next(
        new SubscriptionRequiredError(
          'Active subscription required to access Master CRM services. No valid organization context found.',
          { hasSubscription: false, status: 'NO_ORGANIZATION' }
        )
      );
    }

    // 3. Query active subscription from database (or mockStore fallback)
    const activeSub = await withDbFallback(
      async () => {
        const now = new Date();
        const sub = await db('subscriptions')
          .where('organization_id', organizationId)
          .where('status', 'ACTIVE')
          .where('end_date', '>=', now)
          .orderBy('end_date', 'desc')
          .first();

        if (sub) return sub;

        // Fallback to in-memory store if DB has no subscription for this organization yet
        const subs = mockStore.subscriptions || mockStore.data?.subscriptions || [];
        return subs.find(
          (s) =>
            s.organization_id === organizationId &&
            s.status === 'ACTIVE' &&
            new Date(s.end_date) >= now
        );
      },
      () => {
        const now = new Date();
        const subs = mockStore.subscriptions || mockStore.data?.subscriptions || [];
        return subs.find(
          (s) =>
            s.organization_id === organizationId &&
            s.status === 'ACTIVE' &&
            new Date(s.end_date) >= now
        );
      }
    );

    if (!activeSub) {
      // Find latest subscription record to provide informative details on expiry
      const latestSub = await withDbFallback(
        async () => {
          const sub = await db('subscriptions')
            .where('organization_id', organizationId)
            .orderBy('created_at', 'desc')
            .first();

          if (sub) return sub;

          const subs = mockStore.subscriptions || mockStore.data?.subscriptions || [];
          return subs
            .filter((s) => s.organization_id === organizationId)
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
        },
        () => {
          const subs = mockStore.subscriptions || mockStore.data?.subscriptions || [];
          return subs
            .filter((s) => s.organization_id === organizationId)
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
        }
      );

      const isExpired = latestSub && new Date(latestSub.end_date) < new Date();
      const message = isExpired
        ? `Your organization subscription expired on ${new Date(latestSub.end_date).toLocaleDateString()}. Please renew your subscription to restore access.`
        : 'Active subscription required. No active subscription found for your organization.';

      return next(
        new SubscriptionRequiredError(message, {
          hasSubscription: !!latestSub,
          status: latestSub ? (isExpired ? 'EXPIRED' : latestSub.status) : 'NONE',
          planName: latestSub?.plan_name || null,
          endDate: latestSub?.end_date || null,
          organizationId,
          renewalUrl: '/api/v1/subscriptions/renew',
        })
      );
    }

    // Attach active subscription to request object for downstream controllers
    req.subscription = activeSub;
    return next();
  } catch (error) {
    logger.error('Error verifying subscription gate:', { error: error.message });
    return next(error);
  }
};

/**
 * Middleware that verifies if the organization has AI Audit enabled.
 * - Master Admin is bypassed unless testing organization scoping.
 * - Otherwise checks organization.enable_ai_audit === true.
 * - If false, returns HTTP 403 with code AI_AUDIT_NOT_ENABLED.
 */
const requireAiAuditEnabled = async (req, res, next) => {
  try {
    const user = req.user || {};
    const role = (user.role || user.roleName || user.role_name || '').toUpperCase().replace(/\s+/g, '_');
    const isMasterAdmin = role === 'MASTER_ADMIN' || role === 'MASTER_ADMINISTRATOR' || Boolean(user.is_super_admin) || req.tenantContext?.isMasterAdmin === true;

    if (isMasterAdmin) {
      return next();
    }

    const organizationId =
      user.organizationId ||
      user.organization_id ||
      req.tenantContext?.organizationId ||
      req.headers['x-organization-id'];

    if (!organizationId) {
      return next(
        new AiAuditNotEnabledError(
          'AI Speech & Audit Intelligence is not enabled. Missing organization context.',
          { enableAiAudit: false }
        )
      );
    }

    const org = await withDbFallback(
      async () => {
        return db('organizations').where('id', organizationId).first();
      },
      () => {
        return mockStore.findOne('organizations', { id: organizationId });
      }
    );

    if (!org || (org.enable_ai_audit !== true && (org.audit_ai_licenses || 0) <= 0)) {
      return next(
        new AiAuditNotEnabledError(
          'AI Speech & Audit Intelligence is not enabled for your organization. Please upgrade your subscription plan with the AI Audit Add-On.',
          {
            enableAiAudit: false,
            organizationId,
            upgradeUrl: '/api/v1/subscriptions/renew',
          }
        )
      );
    }

    return next();
  } catch (error) {
    logger.error('Error verifying AI Audit entitlement gate:', { error: error.message });
    return next(error);
  }
};

module.exports = {
  requireActiveSubscription,
  requireAiAuditEnabled,
};
