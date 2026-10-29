/**
 * @file auditLog.js
 * @description Centralized audit logging service for tracking user actions and resource mutations.
 * Powered by the unified logOperation engine with PostgreSQL persistence and mockStore resilience.
 */

const { logOperation } = require('../middlewares/auditLog.middleware');

/**
 * Record an audit log entry in database and system logs.
 *
 * @param {object} params
 * @param {string|number} [params.userId] - User ID performing the action
 * @param {string|number} [params.organizationId] - Organization / tenant ID
 * @param {string} params.action - Action name (e.g. 'USER_LOGIN', 'CREATE_USER', 'UPDATE_PROJECT')
 * @param {string} [params.resource] - Resource name
 * @param {string} [params.entityType] - Entity type
 * @param {string|number} [params.resourceId] - Target resource ID
 * @param {string|number} [params.entityId] - Target entity ID
 * @param {string} [params.module] - Target functional module
 * @param {object} [params.oldValues] - Prior state
 * @param {object} [params.newValues] - Mutated state
 * @param {object} [params.details] - Additional contextual data or diff
 * @param {object} [params.metadata] - Metadata
 * @param {string} [params.ipAddress] - Request IP address
 * @param {string} [params.userAgent] - Request User-Agent header
 * @param {object} [params.req] - Express request object
 * @returns {Promise<object|null>} Created audit log record or null
 */
const auditLog = async (params = {}) => {
  return logOperation({
    userId: params.userId,
    organizationId: params.organizationId,
    action: params.action,
    entityType: params.entityType || params.resource,
    entityId: params.entityId || params.resourceId,
    module: params.module || params.resource,
    oldValues: params.oldValues,
    newValues: params.newValues,
    metadata: params.metadata || params.details,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
    req: params.req,
  });
};

module.exports = {
  auditLog,
  log: auditLog,
  logOperation,
};
