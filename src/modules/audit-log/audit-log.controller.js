/**
 * @file audit-log.controller.js
 * @description Controller handling incoming HTTP requests for the audit-log module.
 */

const { success, paginated } = require('../../utils/response');
const { parsePagination, buildPaginationMeta } = require('../../utils/pagination');
const auditLogService = require('./audit-log.service');

/**
 * Escapes fields for CSV output
 * @param {any} val
 * @returns {string}
 */
const escapeCsv = (val) => {
  if (val === null || val === undefined) return '""';
  let str = typeof val === 'object' ? JSON.stringify(val) : String(val);
  str = str.replace(/"/g, '""');
  return `"${str}"`;
};

const auditLogController = {
  /**
   * List audit logs with pagination and filters
   */
  async list(req, res, next) {
    try {
      const pagination = parsePagination(req.query, {
        defaultPage: 1,
        defaultLimit: 25,
        defaultSortBy: 'created_at',
        defaultSortOrder: 'desc',
      });

      const filters = {
        organizationId: req.query.organizationId,
        userId: req.query.userId,
        action: req.query.action,
        entityType: req.query.entityType,
        entityId: req.query.entityId,
        module: req.query.module,
        dateFrom: req.query.dateFrom,
        dateTo: req.query.dateTo,
        search: req.query.search || req.query.q,
      };

      const { logs, total } = await auditLogService.listAuditLogs(filters, pagination, req.tenantContext);
      const meta = buildPaginationMeta(total, pagination.page, pagination.limit);

      return paginated(res, logs, meta, 'Audit logs retrieved successfully');
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Get KPI statistics for audit log dashboard
   */
  async getStats(req, res, next) {
    try {
      const stats = await auditLogService.getAuditLogStats(req.tenantContext);
      return success(res, stats, 'Audit log statistics retrieved successfully');
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Export audit logs to CSV
   */
  async exportLogs(req, res, next) {
    try {
      const filters = {
        organizationId: req.query.organizationId,
        userId: req.query.userId,
        action: req.query.action,
        entityType: req.query.entityType,
        entityId: req.query.entityId,
        module: req.query.module,
        dateFrom: req.query.dateFrom,
        dateTo: req.query.dateTo,
        search: req.query.search || req.query.q,
      };

      const logs = await auditLogService.exportAuditLogs(filters, req.tenantContext);

      // Build CSV
      const headers = [
        'ID',
        'Timestamp',
        'Module',
        'Action',
        'Entity Type',
        'Entity ID',
        'User Name',
        'User Email',
        'User Role',
        'IP Address',
        'User Agent',
        'Metadata',
      ];

      const rows = logs.map((log) => [
        escapeCsv(log.id),
        escapeCsv(new Date(log.created_at).toISOString()),
        escapeCsv(log.module),
        escapeCsv(log.action),
        escapeCsv(log.entity_type),
        escapeCsv(log.entity_id),
        escapeCsv(log.user_name),
        escapeCsv(log.user_email),
        escapeCsv(log.user_role),
        escapeCsv(log.ip_address),
        escapeCsv(log.user_agent),
        escapeCsv(log.metadata),
      ]);

      const csvContent = '\uFEFF' + [headers.map((h) => `"${h}"`).join(','), ...rows.map((r) => r.join(','))].join('\r\n');

      const dateStr = new Date().toISOString().slice(0, 10);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="audit-logs-${dateStr}.csv"`);
      return res.status(200).send(csvContent);
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Get entity history
   */
  async getEntityHistory(req, res, next) {
    try {
      const { entityType, entityId } = req.params;
      const history = await auditLogService.getEntityHistory(entityType, entityId);
      return success(res, history, `Audit history for ${entityType} #${entityId} retrieved successfully`);
    } catch (err) {
      return next(err);
    }
  },
};

module.exports = auditLogController;
