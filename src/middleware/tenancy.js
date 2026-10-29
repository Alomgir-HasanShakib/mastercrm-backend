/**
 * @file tenancy.js
 * @description Multi-tenancy isolation middleware for resolving and enforcing tenant context.
 */

/**
 * Middleware that extracts and sets tenant context on req.tenantContext.
 * Master admin can optionally specify tenant via x-organization-id header or query parameter.
 *
 * @param {import('express').Request} req - Express request
 * @param {import('express').Response} res - Express response
 * @param {import('express').NextFunction} next - Express next function
 */
const setTenantContext = (req, res, next) => {
  const user = req.user || {};
  const rawRole = (user.role || user.roleName || user.role_name || '').toUpperCase().replace(/\s+/g, '_');
  const isMasterAdmin = rawRole === 'MASTER_ADMIN' || rawRole === 'MASTER_ADMINISTRATOR' || rawRole === 'SUPER_ADMIN';

  // Allow master admin to impersonate or scope to an organization
  let organizationId = user.organizationId || user.organization_id || null;
  if (isMasterAdmin) {
    const requestedOrgId = req.headers['x-organization-id'] || req.query.organizationId;
    if (requestedOrgId) {
      organizationId = requestedOrgId;
    } else {
      organizationId = null; // Master admin sees all organizations unless explicitly scoped
    }
  }

  req.tenantContext = {
    isMasterAdmin,
    organizationId,
    clientId: user.clientId || user.client_id || null,
    vendorId: user.vendorId || user.vendor_id || null,
    userId: user.userId || user.id || null,
    role: user.role || user.roleName || null,
  };

  return next();
};

/**
 * Applies tenant scoping filters to a Knex query builder or filter object.
 *
 * @param {import('knex').Knex.QueryBuilder|object} target - Knex query builder or plain filter object
 * @param {object} tenantContext - Resolved tenant context
 * @param {string} [columnPrefix=''] - Optional column/table prefix (e.g. 'audits.')
 * @returns {import('knex').Knex.QueryBuilder|object}
 */
const applyTenantScope = (target, tenantContext = {}, columnPrefix = '') => {
  if (!tenantContext || tenantContext.isMasterAdmin) {
    return target;
  }

  // If target is a plain filter object
  if (typeof target.where !== 'function') {
    if (tenantContext.organizationId && !target.organizationId) {
      target.organizationId = tenantContext.organizationId;
    }
    if (tenantContext.vendorId && !target.vendorId) {
      target.vendorId = tenantContext.vendorId;
    }
    return target;
  }

  // If target is a Knex query builder
  if (tenantContext.organizationId) {
    target.where(`${columnPrefix}organization_id`, tenantContext.organizationId);
  }
  if (tenantContext.vendorId) {
    target.where(`${columnPrefix}vendor_id`, tenantContext.vendorId);
  }

  return target;
};

module.exports = {
  setTenantContext,
  applyTenantScope,
};

