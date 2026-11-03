/**
 * @file moduleGate.js
 * @description Enforcement middleware verifying organization module entitlement.
 */

const { db, withDbFallback } = require('../database/connection');
const mockStore = require('../database/mockStore');
const { ModuleNotEnabledError } = require('../utils/errors');
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
  if (!modules) return ['CAPI', 'CATI', 'TVC', 'FA', 'SUPER_AUDIT', 'AI_AUDIT'];
  let list = modules;
  if (typeof modules === 'string') {
    try {
      list = JSON.parse(modules);
    } catch {
      list = modules.split(',').map((s) => s.trim());
    }
  }
  if (!Array.isArray(list)) return ['CAPI', 'CATI', 'TVC', 'FA', 'SUPER_AUDIT', 'AI_AUDIT'];
  return list.map((m) => normalizeModuleName(m));
};

/**
 * Middleware factory requiring a specific operational module to be enabled for the tenant organization.
 * Master Admin users are bypassed.
 *
 * @param {string} moduleKey - E.g. 'CAPI', 'CATI', 'TVC', 'FA', 'SUPER_AUDIT'
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

      const targetModule = isAiAuditEndpoint ? 'AI_AUDIT' : normalizeModuleName(moduleKey);

      // 2. Resolve organization ID
      const organizationId =
        user.organizationId ||
        user.organization_id ||
        req.tenantContext?.organizationId ||
        req.headers['x-organization-id'];

      // Operational agents (TVC, CAPI, CATI, FA) accessing their assigned operational engine are permitted
      const isOperationalAgent =
        (targetModule === 'TVC' && (role.includes('TVC') || role.includes('VERIFIER') || role.includes('CALLER'))) ||
        (targetModule === 'CAPI' && (role.includes('CAPI') || role.includes('AUDIT'))) ||
        (targetModule === 'CATI' && role.includes('CATI')) ||
        (targetModule === 'FA' && (role.includes('FA') || role.includes('FEEDBACK')));

      if (isOperationalAgent) {
        return next();
      }

      if (!organizationId) {
        return next();
      }

      // 3. Query organization and check enabled_modules
      const org = await withDbFallback(
        async () => {
          return db('organizations').where('id', organizationId).first();
        },
        () => {
          return mockStore.findOne('organizations', { id: organizationId }) || mockStore.organizations?.[0];
        }
      );

      if (!org) {
        return next();
      }

      const enabledModules = normalizeModulesList(org.enabled_modules || org.settings?.enabled_modules);

      // AI_AUDIT module is enabled if enabled_modules includes AI_AUDIT (or AI_AUDIT_QC) OR enable_ai_audit is true
      const isTargetAiAudit = targetModule === 'AI_AUDIT';
      const isAiAuditActive = Boolean(
        enabledModules.includes('AI_AUDIT') ||
        enabledModules.includes('AI_AUDIT_QC') ||
        org.enable_ai_audit === true ||
        org.enableAiAudit === true ||
        org.settings?.enable_ai_audit === true ||
        Number(org.audit_ai_licenses || org.ai_audit_licenses || 0) > 0 ||
        Number(user.audit_ai_licenses || 0) > 0
      );

      const isEntitled = isTargetAiAudit
        ? isAiAuditActive
        : (targetModule === 'CAPI' || targetModule === 'AUDIT')
        ? (enabledModules.includes('CAPI') || enabledModules.includes('AUDIT'))
        : enabledModules.includes(targetModule);

      if (!isEntitled) {
        logger.warn(
          `[MODULE_GATE] Access denied to module '${targetModule}' for organization '${org.name || organizationId}'. Enabled modules: [${enabledModules.join(', ')}]`
        );
        return next(
          new ModuleNotEnabledError('Module not enabled for your organization.', {
            module: targetModule,
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
