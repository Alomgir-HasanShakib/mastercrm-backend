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
};

const normalizeModuleName = (mod) => {
  if (!mod) return '';
  const clean = String(mod).trim().toLowerCase();
  return MODULE_ALIASES[clean] || String(mod).trim().toUpperCase();
};

const normalizeModulesList = (modules) => {
  if (!modules) return ['CAPI', 'CATI', 'TVC', 'FA', 'SUPER_AUDIT'];
  let list = modules;
  if (typeof modules === 'string') {
    try {
      list = JSON.parse(modules);
    } catch {
      list = modules.split(',').map((s) => s.trim());
    }
  }
  if (!Array.isArray(list)) return ['CAPI', 'CATI', 'TVC', 'FA', 'SUPER_AUDIT'];
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
  const targetModule = normalizeModuleName(moduleKey);

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

      // 2. Resolve organization ID
      const organizationId =
        user.organizationId ||
        user.organization_id ||
        req.tenantContext?.organizationId ||
        req.headers['x-organization-id'];

      if (!organizationId) {
        return next(
          new ModuleNotEnabledError('Module not enabled for your organization.', {
            requiredModule: targetModule,
            reason: 'NO_ORGANIZATION_CONTEXT',
          })
        );
      }

      // 3. Query organization and check enabled_modules
      const org = await withDbFallback(
        async () => {
          return db('organizations').where('id', organizationId).first();
        },
        () => {
          return mockStore.findOne('organizations', { id: organizationId });
        }
      );

      if (!org) {
        return next(
          new ModuleNotEnabledError('Module not enabled for your organization.', {
            requiredModule: targetModule,
            organizationId,
          })
        );
      }

      const enabledModules = normalizeModulesList(org.enabled_modules || org.settings?.enabled_modules);

      if (!enabledModules.includes(targetModule)) {
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
