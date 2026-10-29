/**
 * @file reports.controller.js
 * @description Controller handling incoming HTTP requests for unified reporting and analytics endpoints.
 */

const reportsService = require('./reports.service');
const { success } = require('../../utils/response');

/**
 * Extracts and merges query filters with tenant scoping context
 * @param {import('express').Request} req
 * @returns {{ filters: object, pagination: object, interval: string }}
 */
const parseReportRequest = (req) => {
  const query = req.query || {};
  const tenantContext = req.tenantContext || {};
  const user = req.user || {};
  const userRole = (user.role || user.roleName || user.role_name || '').toUpperCase().replace(/\s+/g, '_');
  const isMaster = userRole === 'MASTER_ADMIN' || userRole === 'MASTER_ADMINISTRATOR' || Boolean(tenantContext.isMasterAdmin);

  // Strict Vendor Report Scoping: Vendor can ONLY view reports for their own vendor!
  let effectiveVendorId = query.vendorId || null;
  if (!isMaster && (user.vendor_id || user.vendorId || tenantContext.vendorId)) {
    effectiveVendorId = user.vendor_id || user.vendorId || tenantContext.vendorId;
  }

  const filters = {
    clientId: query.clientId || null,
    vendorId: effectiveVendorId,
    projectId: query.projectId || null,
    stateId: query.stateId || null,
    userId: query.userId || null,
    agentId: query.agentId || null,
    sourceChannel: query.sourceChannel || null,
    status: query.status || null,
    disposition: query.disposition || null,
    dateFrom: query.dateFrom || null,
    dateTo: query.dateTo || null,
    search: query.search || null,
  };

  const page = parseInt(query.page, 10) || 1;
  const limit = parseInt(query.limit, 10) || 20;
  const offset = (page - 1) * limit;

  const pagination = {
    page,
    limit,
    offset,
    sortBy: query.sortBy,
    sortOrder: query.sortOrder || 'desc',
  };

  const interval = query.interval || 'day';

  return { filters, pagination, interval };
};

const reportsController = {
  /**
   * GET /cati/production
   * Returns aggregated KPI summary, time-series, and drill-down table for CATI production
   */
  async getCatiProduction(req, res, next) {
    try {
      const { filters, pagination, interval } = parseReportRequest(req);
      const data = await reportsService.getCatiProductionReport(filters, pagination, interval);
      return success(res, data, 'CATI production report retrieved successfully');
    } catch (err) {
      return next(err);
    }
  },

  /**
   * GET /cati/apr
   * Returns CATI Agent Performance Report (APR)
   */
  async getCatiApr(req, res, next) {
    try {
      const { filters, pagination } = parseReportRequest(req);
      const data = await reportsService.getCatiAprReport(filters, pagination);
      return success(res, data, 'CATI APR retrieved successfully');
    } catch (err) {
      return next(err);
    }
  },

  /**
   * GET /capi/production
   * Returns CAPI Audit Production Report
   */
  async getCapiProduction(req, res, next) {
    try {
      const { filters, pagination } = parseReportRequest(req);
      const data = await reportsService.getCapiProductionReport(filters, pagination);
      return success(res, data, 'CAPI audit production report retrieved successfully');
    } catch (err) {
      return next(err);
    }
  },

  /**
   * GET /capi/apr
   * Returns CAPI Auditor Performance Report (CAPI APR)
   */
  async getCapiApr(req, res, next) {
    try {
      const { filters, pagination } = parseReportRequest(req);
      const data = await reportsService.getCapiAprReport(filters, pagination);
      return success(res, data, 'CAPI APR retrieved successfully');
    } catch (err) {
      return next(err);
    }
  },

  /**
   * GET /super-audit/production
   * Returns Super Audit Production Report
   */
  async getSuperAuditProduction(req, res, next) {
    try {
      const { filters } = parseReportRequest(req);
      const data = await reportsService.getSuperAuditProductionReport(filters);
      return success(res, data, 'Super audit production report retrieved successfully');
    } catch (err) {
      return next(err);
    }
  },

  /**
   * GET /super-audit/apr
   * Returns Super Audit Auditor Performance Report (Super Audit APR)
   */
  async getSuperAuditApr(req, res, next) {
    try {
      const { filters, pagination } = parseReportRequest(req);
      const data = await reportsService.getSuperAuditAprReport(filters, pagination);
      return success(res, data, 'Super audit APR retrieved successfully');
    } catch (err) {
      return next(err);
    }
  },

  /**
   * GET /tvc/cpr
   * Returns TVC Call Performance Report (CPR / CDR-Style)
   */
  async getTvcCpr(req, res, next) {
    try {
      const { filters, pagination } = parseReportRequest(req);
      const data = await reportsService.getTvcCprReport(filters, pagination);
      return success(res, data, 'TVC CPR report retrieved successfully');
    } catch (err) {
      return next(err);
    }
  },

  /**
   * GET /tvc/apr
   * Returns TVC Agent Performance Report (TVC APR)
   */
  async getTvcApr(req, res, next) {
    try {
      const { filters, pagination } = parseReportRequest(req);
      const data = await reportsService.getTvcAprReport(filters, pagination);
      return success(res, data, 'TVC APR retrieved successfully');
    } catch (err) {
      return next(err);
    }
  },

  /**
   * GET /fa/cdr
   * Returns Feedback Calling (FA) CDR Report
   */
  async getFaCdr(req, res, next) {
    try {
      const { filters } = parseReportRequest(req);
      const data = await reportsService.getFaCdrReport(filters);
      return success(res, data, 'Feedback calling CDR report retrieved successfully');
    } catch (err) {
      return next(err);
    }
  },

  /**
   * GET /fa/apr
   * Returns Feedback Calling Agent Performance Report (FA APR)
   */
  async getFaApr(req, res, next) {
    try {
      const { filters, pagination } = parseReportRequest(req);
      const data = await reportsService.getFaAprReport(filters, pagination);
      return success(res, data, 'Feedback calling APR retrieved successfully');
    } catch (err) {
      return next(err);
    }
  },

  /**
   * GET /agents/unified-apr
   * Returns Cross-Module Unified Agent Daily Scorecard & APR
   */
  async getUnifiedApr(req, res, next) {
    try {
      const { filters, pagination } = parseReportRequest(req);
      const data = await reportsService.getUnifiedAprReport(filters, pagination);
      return success(res, data, 'Cross-module unified APR retrieved successfully');
    } catch (err) {
      return next(err);
    }
  },

  /**
   * POST /export
   * Generates and downloads XLSX or CSV report file
   */
  async exportReport(req, res, next) {
    try {
      const { reportType, format = 'xlsx', filters = {} } = req.body;
      const tenantContext = req.tenantContext || {};

      const scopedFilters = {
        ...filters,
        vendorId: tenantContext.vendorId || filters.vendorId || null,
      };

      const { buffer, filename, contentType } = await reportsService.generateExport(
        reportType,
        format,
        scopedFilters
      );

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(buffer);
    } catch (err) {
      return next(err);
    }
  },

  /**
   * GET /dashboard-summary
   * Aggregates key KPI metrics across CATI, CAPI, Super Audit, TVC, and FA
   */
  async getDashboardSummary(req, res, next) {
    try {
      const { filters, pagination, interval } = parseReportRequest(req);
      const [cati, capi, superAudit, tvc, fa] = await Promise.all([
        reportsService.getCatiProductionReport(filters, pagination, interval).catch(() => ({})),
        reportsService.getCapiProductionReport(filters, pagination).catch(() => ({})),
        reportsService.getSuperAuditProductionReport(filters).catch(() => ({})),
        reportsService.getTvcCprReport(filters, pagination).catch(() => ({})),
        reportsService.getFaCdrReport(filters).catch(() => ({})),
      ]);

      const dashboardData = {
        cati: cati.summary || {},
        capi: capi.summary || {},
        superAudit: superAudit.summary || {},
        tvc: tvc.summary || {},
        fa: fa.summary || {},
        timestamp: new Date().toISOString(),
      };

      return success(res, dashboardData, 'Dashboard KPI summary retrieved successfully');
    } catch (err) {
      return next(err);
    }
  },

  /**
   * GET /cati
   * Alias for CATI Production Report
   */
  async getCati(req, res, next) {
    return reportsController.getCatiProduction(req, res, next);
  },

  /**
   * GET /capi
   * Alias for CAPI Production Report
   */
  async getCapi(req, res, next) {
    return reportsController.getCapiProduction(req, res, next);
  },

  /**
   * GET /super-audit
   * Alias for Super Audit Production Report
   */
  async getSuperAudit(req, res, next) {
    return reportsController.getSuperAuditProduction(req, res, next);
  },

  /**
   * GET /tvc
   * Alias for TVC CPR Report
   */
  async getTvc(req, res, next) {
    return reportsController.getTvcCpr(req, res, next);
  },

  /**
   * GET /fa
   * Alias for Feedback Calling Report
   */
  async getFa(req, res, next) {
    return reportsController.getFaCdr(req, res, next);
  },
};

module.exports = reportsController;
