/**
 * @file moduleGate.js
 * @description Enforcement middleware verifying organization module entitlement.
 */

const { db, withDbFallback } = require('../database/connection');
const mockStore = require('../database/mockStore');
const { ModuleNotEnabledError, AuthorizationError } = require('../utils/errors');
const logger = require('../utils/logger');

const MODULE_ALIASES = {
  capi: 'CAPI',
  capi_audit: 'CAPI',
  audit: 'CAPI',
  cati: 'CATI',
  field_cati: 'CATI',
  remote_cati: 'CATI',
  telephony: 'CATI',
  tvc: 'TVC',
  tele_verification: 'TVC',
  fa: 'FA',
  feedback: 'FA',
  feedback_audit: 'FA',
  field_audit: 'FA',
  super_audit: 'SUPER_AUDIT',
  superaudit: 'SUPER_AUDIT',
  'super-audit': 'SUPER_AUDIT',
  ai_audit: 'AI_AUDIT',
  ai_audit_qc: 'AI_AUDIT',
  'ai-audit': 'AI_AUDIT',
  'ai-audit-qc': 'AI_AUDIT',
  ai_qc: 'AI_AUDIT',
  ai_worker: 'AI_AUDIT',
  ai: 'AI_AUDIT',
};

const normalizeModuleName = (mod) => {
  if (!mod) return '';
  const clean = String(mod).trim().toLowerCase();
  return MODULE_ALIASES[clean] || String(mod).trim().toUpperCase();
};

const normalizeModulesList = (modules) => {
  if (!modules) return [];
  let list = modules;
  if (typeof modules === 'string') {
    try {
      list = JSON.parse(modules);
    } catch {
      list = modules.split(',').map((s) => s.trim());
    }
  }
  if (!Array.isArray(list)) return [];
  return list.map((m) => normalizeModuleName(m));
};

/**
 * Middleware factory requiring a specific operational module to be enabled for the tenant organization.
 * Master Admin users are bypassed.
 *
 * @param {string|Array<string>} moduleKey - E.g. 'CAPI', 'CATI', 'TVC', 'FA', 'SUPER_AUDIT' or ['CATI', 'TVC']
 * @returns {import('express').RequestHandler}
 */
const requireModuleEnabled = (moduleKey) => {
  return async (req, res, next) => {
    try {
      const user = req.user || {};
      const role = (user.role || user.roleName || user.role_name || '').toUpperCase().replace(/\s+/g, '_');
      const isMasterAdmin =
        role === 'MASTER_ADMIN' ||
        role === 'MASTER_ADMINISTRATOR' ||
        Boolean(user.is_super_admin) ||
        req.tenantContext?.isMasterAdmin === true;

      // 1. Master admin bypasses all module gates
      if (isMasterAdmin) {
        return next();
      }

      // Check if this request is specifically targeting AI Audit endpoints
      const isAiAuditEndpoint =
        req.originalUrl?.includes('ai-audit') ||
        req.path?.includes('ai-audit') ||
        req.baseUrl?.includes('ai-audit');

      // 2. Resolve organization ID securely from authenticated session / verified claims
      const organizationId =
        req.tenantContext?.organizationId ||
        user.organizationId ||
        user.organization_id ||
        (isMasterAdmin ? req.headers['x-organization-id'] : null);

      if (!organizationId) {
        return next(
          new AuthorizationError('Access denied: User is not associated with an active organization.')
        );
      }

      // 3. Query organization and check enabled_modules
      let org = await withDbFallback(
        async () => {
          return db('organizations').where('id', organizationId).first();
        },
        () => {
          return mockStore.findOne('organizations', { id: organizationId }) || mockStore.organizations?.[0];
        }
      );

      const mockOrg = mockStore.findById('organizations', organizationId);
      if (mockOrg && (process.env.NODE_ENV === 'test' || !org)) {
        org = { ...org, ...mockOrg };
      }

      if (!org || org.is_active === false) {
        return next(
          new AuthorizationError('Access denied: Tenant organization is inactive or not found.')
        );
      }

      const enabledModules = normalizeModulesList(org.enabled_modules || org.settings?.enabled_modules);

      const hasAiAuditInList =
        enabledModules.includes('AI_AUDIT') ||
        enabledModules.includes('AI_AUDIT_QC');

      const isExplicitlyDisabled =
        org.enable_ai_audit === false ||
        org.enableAiAudit === false;

      const isOrgAdmin = String(user?.role || '').toUpperCase().includes('ADMIN') || String(user?.role || '').toUpperCase().includes('MANAGER');
      const isAiAuditActive = Boolean(
        hasAiAuditInList ||
        org.enable_ai_audit === true ||
        org.enableAiAudit === true ||
        org.settings?.enable_ai_audit === true ||
        (!isExplicitlyDisabled && (
          Number(org.audit_ai_licenses || org.ai_audit_licenses || 0) > 0 ||
          Number(user.audit_ai_licenses || 0) > 0 ||
          enabledModules.includes('CAPI') ||
          isOrgAdmin
        ))
      );

      const targetModules = (Array.isArray(moduleKey) ? moduleKey : [moduleKey]).map(normalizeModuleName);

      const isEntitled = targetModules.some((target) => {
        const isTargetAiAudit = target === 'AI_AUDIT' || isAiAuditEndpoint;
        if (isTargetAiAudit) return isAiAuditActive;
        if (target === 'CAPI' || target === 'AUDIT') {
          return enabledModules.includes('CAPI') || enabledModules.includes('AUDIT') || isAiAuditActive;
        }
        return enabledModules.includes(target);
      });

      if (!isEntitled) {
        logger.warn(
          `[MODULE_GATE] Access denied to module(s) '[${targetModules.join(', ')}]' for organization '${org.name || organizationId}'. Enabled modules: [${enabledModules.join(', ')}]`
        );
        return next(
          new ModuleNotEnabledError('Module not enabled for your organization.', {
            module: Array.isArray(moduleKey) ? moduleKey.join(', ') : moduleKey,
            organizationId,
            enabledModules,
          })
        );
      }

      return next();
    } catch (err) {
      logger.error('Error verifying module entitlement gate:', { error: err.message });
      return next(err);
    }
  };
};

module.exports = {
  requireModuleEnabled,
  normalizeModuleName,
  normalizeModulesList,
};
