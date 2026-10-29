/**
 * @file audit-log.service.js
 * @description Business logic layer for retrieving, querying, aggregating and exporting immutable audit trail records.
 */

const auditLogModel = require('./audit-log.model');
const { logOperation } = require('../../middlewares/auditLog.middleware');

const auditLogService = {
  /**
   * Scope incoming filters to tenant context
   * @param {object} filters
   * @param {object} tenantContext
   * @returns {object}
   */
  getScopedFilters(filters = {}, tenantContext = {}) {
    const scopedFilters = { ...filters };
    if (!tenantContext?.isMasterAdmin && tenantContext?.organizationId) {
      scopedFilters.organizationId = tenantContext.organizationId;
    }
    return scopedFilters;
  },

  /**
   * List audit logs with filters and pagination
   * @param {object} filters
   * @param {object} pagination
   * @param {object} tenantContext
   * @returns {Promise<{ logs: Array<object>, total: number }>}
   */
  async listAuditLogs(filters = {}, pagination = {}, tenantContext = {}) {
    const scopedFilters = this.getScopedFilters(filters, tenantContext);

    const [logs, total] = await Promise.all([
      auditLogModel.findAll(scopedFilters, pagination),
      auditLogModel.count(scopedFilters),
    ]);

    return { logs, total };
  },

  /**
   * Retrieve aggregate KPI statistics for audit log dashboard
   * @param {object} tenantContext
   * @returns {Promise<object>}
   */
  async getAuditLogStats(tenantContext = {}) {
    const scopedFilters = this.getScopedFilters({}, tenantContext);
    return auditLogModel.getStats(scopedFilters);
  },

  /**
   * Export matching audit records up to maxLimit
   * @param {object} filters
   * @param {object} tenantContext
   * @param {number} [maxLimit=10000]
   * @returns {Promise<Array<object>>}
   */
  async exportAuditLogs(filters = {}, tenantContext = {}, maxLimit = 10000) {
    const scopedFilters = this.getScopedFilters(filters, tenantContext);
    return auditLogModel.exportAll(scopedFilters, maxLimit);
  },

  /**
   * Get complete audit history for a specific entity
   * @param {string} entityType
   * @param {string} entityId
   * @returns {Promise<Array<object>>}
   */
  async getEntityHistory(entityType, entityId) {
    return auditLogModel.findByEntity(entityType, entityId);
  },

  /**
   * Create an immutable audit log record
   * @param {object} logData
   * @returns {Promise<object>}
   */
  async createAuditLog(logData) {
    return logOperation(logData);
  },
};

module.exports = auditLogService;
