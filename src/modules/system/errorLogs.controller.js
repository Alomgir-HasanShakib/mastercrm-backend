/**
 * @file errorLogs.controller.js
 * @description Controller handling HTTP requests for the system error logs module.
 */

const XLSX = require('xlsx');
const { success, paginated } = require('../../utils/response');
const { parsePagination, buildPaginationMeta } = require('../../utils/pagination');
const errorLogsService = require('./errorLogs.service');

/**
 * Helper to escape CSV values
 * @param {any} val
 * @returns {string}
 */
const escapeCsv = (val) => {
  if (val === null || val === undefined) return '""';
  let str = typeof val === 'object' ? JSON.stringify(val) : String(val);
  str = str.replace(/"/g, '""');
  return `"${str}"`;
};

const errorLogsController = {
  /**
   * List error logs with pagination, search, and multidimensional filters
   * GET /api/v1/system/error-logs
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
        source: req.query.source,
        statusCode: req.query.statusCode || req.query.status,
        errorCode: req.query.errorCode || req.query.code,
        method: req.query.method,
        dateFrom: req.query.dateFrom,
        dateTo: req.query.dateTo,
        search: req.query.search || req.query.q,
      };

      const { logs, total } = await errorLogsService.getErrorLogs(filters, pagination, req.tenantContext);
      const meta = buildPaginationMeta(total, pagination.page, pagination.limit);

      return paginated(res, logs, meta, 'Error logs retrieved successfully');
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Retrieve aggregate KPI metrics for error logs dashboard
   * GET /api/v1/system/error-logs/stats
   */
  async getStats(req, res, next) {
    try {
      const filters = {
        organizationId: req.query.organizationId,
        dateFrom: req.query.dateFrom,
        dateTo: req.query.dateTo,
      };

      const stats = await errorLogsService.getErrorStats(filters, req.tenantContext);
      return success(res, stats, 'System error statistics retrieved successfully');
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Ingest client-side errors from frontend application
   * POST /api/v1/system/error-logs/client
   */
  async logClientError(req, res, next) {
    try {
      const log = await errorLogsService.logClientError(req.body, req.user, req);
      return success(res, { logged: true, id: log?.id || null }, 'Client error registered');
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Export error logs to Excel (.xlsx) or CSV format
   * POST or GET /api/v1/system/error-logs/export
   */
  async exportLogs(req, res, next) {
    try {
      const params = { ...(req.query || {}), ...(req.body || {}) };
      const format = (params.format || 'csv').toLowerCase();

      const filters = {
        organizationId: params.organizationId,
        userId: params.userId,
        source: params.source,
        statusCode: params.statusCode || params.status,
        errorCode: params.errorCode || params.code,
        method: params.method,
        dateFrom: params.dateFrom,
        dateTo: params.dateTo,
        search: params.search || params.q,
      };

      const logs = await errorLogsService.exportErrorLogs(filters, req.tenantContext);
      const dateStr = new Date().toISOString().slice(0, 10);

      // Format data for export
      const exportRows = logs.map((l) => ({
        'Log ID': l.id,
        'Timestamp': l.created_at ? new Date(l.created_at).toISOString() : '',
        'Source': l.source || 'BACKEND',
        'HTTP Status': l.status_code,
        'Method': l.method,
        'Endpoint Path': l.path,
        'Error Code': l.error_code,
        'Message': l.message,
        'User Email': l.user_email || 'Anonymous',
        'User Role': l.user_role || 'SYSTEM',
        'IP Address': l.ip_address || '',
        'Stack Trace': l.stack || '',
        'Technical Details': typeof l.details === 'object' ? JSON.stringify(l.details) : String(l.details || ''),
      }));

      if (format === 'xlsx' || format === 'excel') {
        const worksheet = XLSX.utils.json_to_sheet(exportRows);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Error Logs');

        const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="system-error-logs-${dateStr}.xlsx"`);
        return res.status(200).send(buffer);
      }

      // Default CSV
      const headers = [
        'Log ID',
        'Timestamp',
        'Source',
        'HTTP Status',
        'Method',
        'Endpoint Path',
        'Error Code',
        'Message',
        'User Email',
        'User Role',
        'IP Address',
        'Stack Trace',
        'Technical Details',
      ];

      const csvRows = exportRows.map((r) => [
        escapeCsv(r['Log ID']),
        escapeCsv(r['Timestamp']),
        escapeCsv(r['Source']),
        escapeCsv(r['HTTP Status']),
        escapeCsv(r['Method']),
        escapeCsv(r['Endpoint Path']),
        escapeCsv(r['Error Code']),
        escapeCsv(r['Message']),
        escapeCsv(r['User Email']),
        escapeCsv(r['User Role']),
        escapeCsv(r['IP Address']),
        escapeCsv(r['Stack Trace']),
        escapeCsv(r['Technical Details']),
      ]);

      const csvContent = '\uFEFF' + [headers.map((h) => `"${h}"`).join(','), ...csvRows.map((r) => r.join(','))].join('\r\n');

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="system-error-logs-${dateStr}.csv"`);
      return res.status(200).send(csvContent);
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Clear error logs (Master Admin only)
   * DELETE /api/v1/system/error-logs
   */
  async clearLogs(req, res, next) {
    try {
      const filters = req.body || req.query || {};
      const deletedCount = await errorLogsService.clearErrorLogs(filters, req.tenantContext);
      return success(res, { deletedCount }, `Successfully purged error logs (${deletedCount} removed)`);
    } catch (err) {
      return next(err);
    }
  },
};

module.exports = errorLogsController;
