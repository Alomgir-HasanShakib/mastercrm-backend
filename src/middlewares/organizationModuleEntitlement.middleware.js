/**
 * @file organizationModuleEntitlement.middleware.js
 * @description Enforcement middleware verifying organization module entitlement & access control.
 */

const {
  requireModuleEnabled,
  normalizeModuleName,
  normalizeModulesList,
} = require('../middleware/moduleGate');

/**
 * Validates if an organization or user context has AI audit capability enabled.
 * Returns true if enabled_modules includes 'AI_AUDIT' (or 'AI_AUDIT_QC') OR enable_ai_audit is true.
 *
 * @param {object} org - Organization or user context
 * @returns {boolean}
 */
const hasAiAuditEntitlement = (org) => {
  if (!org) return false;
  if (
    org.enable_ai_audit === true ||
    org.enableAiAudit === true ||
    org.organizationEnableAiAudit === true ||
    org.organization_enable_ai_audit === true ||
    org.settings?.enable_ai_audit === true
  ) {
    return true;
  }
  const modules = normalizeModulesList(
    org.enabled_modules || org.enabledModules || org.settings?.enabled_modules
  );
  return modules.includes('AI_AUDIT') || modules.includes('AI_AUDIT_QC');
};

/**
 * Middleware requiring a specific module to be enabled for the tenant organization.
 * For AI_AUDIT, passes if either enabled_modules includes AI_AUDIT or enable_ai_audit is true.
 *
 * @param {string} moduleKey - E.g. 'AI_AUDIT', 'CAPI', 'CATI', 'TVC', 'FA', 'SUPER_AUDIT'
 * @returns {import('express').RequestHandler}
 */
const organizationModuleEntitlement = (moduleKey) => requireModuleEnabled(moduleKey);

module.exports = {
  organizationModuleEntitlement,
  requireModuleEnabled,
  requireOrganizationModule: requireModuleEnabled,
  hasAiAuditEntitlement,
  normalizeModuleName,
  normalizeModulesList,
};
