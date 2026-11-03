/**
 * @file errorLogs.service.js
 * @description Business service layer for centralized system error logging, KPI analytics, and export.
 */

const errorLogsModel = require('./errorLogs.model');
const logger = require('../../utils/logger');

const errorLogsService = {
  /**
   * Log an error from backend middleware or system services.
   * Guaranteed not to throw so it never interrupts the request/response lifecycle.
   *
   * @param {object} param0
   * @returns {Promise<object|null>} Created error log record
   */
  async logError({
    path,
    method,
    status,
    statusCode,
    errorCode,
    code,
    message,
    stack,
    user,
    organization,
    organizationId,
    ip,
    ipAddress,
    userAgent,
    details,
    correlationId,
    source = 'BACKEND',
  }) {
    try {
      const effStatusCode = parseInt(statusCode || status || 500, 10);
      const effErrorCode = errorCode || code || (effStatusCode >= 500 ? 'INTERNAL_SERVER_ERROR' : 'CLIENT_ERROR');

      let userId = null;
      let userEmail = null;
      let userRole = null;

      if (user && typeof user === 'object') {
        userId = user.id || user.userId || null;
        userEmail = user.email || null;
        userRole = user.role || user.role_slug || user.role_name || null;
      } else if (typeof user === 'string') {
        userEmail = user;
      }

      const orgId = organizationId || (organization && typeof organization === 'object' ? organization.id : organization) || null;

      const record = {
        path: path || '/',
        method: method || 'GET',
        statusCode: effStatusCode,
        errorCode: effErrorCode,
        message: message || 'Unknown error occurred',
        stack: stack || null,
        userId,
        userEmail,
        userRole,
        organizationId: orgId,
        ipAddress: ip || ipAddress || null,
        userAgent: userAgent || null,
        details: details || null,
        correlationId: correlationId || null,
        source: source || 'BACKEND',
      };

      return await errorLogsModel.create(record);
    } catch (err) {
      logger.warn('Failed to persist system error log:', { error: err.message });
      return null;
    }
  },

  /**
   * List error logs with pagination, search, and multidimensional filters.
   *
   * @param {object} filters
   * @param {object} pagination
   * @param {object} tenantContext
   * @returns {Promise<{ logs: Array<object>, total: number }>}
   */
  async getErrorLogs(filters = {}, pagination = {}, tenantContext = {}) {
    // If not Master Admin, filter to tenant's own organization
    if (tenantContext && !tenantContext.isMasterAdmin && tenantContext.organizationId) {
      filters.organizationId = tenantContext.organizationId;
    }

    const [logs, total] = await Promise.all([
      errorLogsModel.list(filters, pagination),
      errorLogsModel.count(filters),
    ]);

    return { logs, total };
  },

  /**
   * Retrieve aggregate error metrics and KPI statistics.
   *
   * @param {object} filters
   * @param {object} tenantContext
   * @returns {Promise<object>}
   */
  async getErrorStats(filters = {}, tenantContext = {}) {
    if (tenantContext && !tenantContext.isMasterAdmin && tenantContext.organizationId) {
      filters.organizationId = tenantContext.organizationId;
    }

    return errorLogsModel.getStats(filters);
  },

  /**
   * Log a client-side error reported by frontend.
   *
   * @param {object} data
   * @param {object} [userContext]
   * @param {object} [req]
   * @returns {Promise<object|null>}
   */
  async logClientError(data = {}, userContext = null, req = null) {
    const user = data.user || userContext || (req && req.user) || null;
    const ip = req?.ip || req?.headers?.['x-forwarded-for'] || data.ip || null;
    const userAgent = req?.headers?.['user-agent'] || data.userAgent || null;

    return this.logError({
      path: data.path || '/',
      method: data.method || 'GET',
      statusCode: data.statusCode || data.status || 0,
      errorCode: data.errorCode || data.code || 'FRONTEND_EXCEPTION',
      message: data.message || 'Frontend client error',
      stack: data.stack || null,
      user,
      organizationId: data.organizationId || userContext?.organizationId || user?.organization_id || null,
      ip,
      userAgent,
      details: data.details || null,
      correlationId: data.correlationId || req?.correlationId || null,
      source: 'FRONTEND',
    });
  },

  /**
   * Export all matching error logs for CSV/Excel generation.
   *
   * @param {object} filters
   * @param {object} tenantContext
   * @returns {Promise<Array<object>>}
   */
  async exportErrorLogs(filters = {}, tenantContext = {}) {
    if (tenantContext && !tenantContext.isMasterAdmin && tenantContext.organizationId) {
      filters.organizationId = tenantContext.organizationId;
    }

    return errorLogsModel.exportAll(filters);
  },

  /**
   * Clear error logs (Master Admin operation).
   *
   * @param {object} filters
   * @param {object} tenantContext
   * @returns {Promise<number>}
   */
  async clearErrorLogs(filters = {}, tenantContext = {}) {
    return errorLogsModel.clear(filters);
  },
};

module.exports = errorLogsService;
