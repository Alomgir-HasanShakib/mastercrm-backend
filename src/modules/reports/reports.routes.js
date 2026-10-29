/**
 * @file reports.routes.js
 * @description Express routing definitions for Unified Reporting & Analytics module.
 * Exposes REST endpoints for CATI, CAPI, Super Audit, TVC, Feedback Calling, Unified APR, and file exports.
 */

const express = require('express');
const { authenticate } = require('../../middleware/auth');
const { setTenantContext } = require('../../middleware/tenancy');
const { checkPermission } = require('../../middleware/rbac');
const { validate } = require('../../middleware/validator');
const reportsController = require('./reports.controller');
const { commonFilterSchema, exportSchema } = require('./reports.validation');

const router = express.Router();

// Apply authentication and tenant context resolution across all report routes
router.use(authenticate, setTenantContext);

/**
 * @route GET /api/v1/reports/dashboard-summary
 * @desc Retrieve executive KPI dashboard summary across modules
 * @access Authenticated (reports:read)
 */
router.get(
  '/dashboard-summary',
  checkPermission('reports', 'read'),
  validate(commonFilterSchema, 'query'),
  reportsController.getDashboardSummary
);

/**
 * @route GET /api/v1/reports/cati
 * @desc Retrieve CATI production overview
 * @access Authenticated (reports:read)
 */
router.get(
  '/cati',
  checkPermission('reports', 'read'),
  validate(commonFilterSchema, 'query'),
  reportsController.getCati
);

/**
 * @route GET /api/v1/reports/capi
 * @desc Retrieve CAPI audit production overview
 * @access Authenticated (reports:read)
 */
router.get(
  '/capi',
  checkPermission('reports', 'read'),
  validate(commonFilterSchema, 'query'),
  reportsController.getCapi
);

/**
 * @route GET /api/v1/reports/super-audit
 * @desc Retrieve Super Audit production overview
 * @access Authenticated (reports:read)
 */
router.get(
  '/super-audit',
  checkPermission('reports', 'read'),
  validate(commonFilterSchema, 'query'),
  reportsController.getSuperAudit
);

/**
 * @route GET /api/v1/reports/tvc
 * @desc Retrieve TVC calling overview
 * @access Authenticated (reports:read)
 */
router.get(
  '/tvc',
  checkPermission('reports', 'read'),
  validate(commonFilterSchema, 'query'),
  reportsController.getTvc
);

/**
 * @route GET /api/v1/reports/fa
 * @desc Retrieve Field Agent feedback overview
 * @access Authenticated (reports:read)
 */
router.get(
  '/fa',
  checkPermission('reports', 'read'),
  validate(commonFilterSchema, 'query'),
  reportsController.getFa
);

/**
 * @route GET /api/v1/reports/cati/production
 * @desc Retrieve CATI Production Report KPI summary, time-series, and drilldown
 * @access Authenticated (reports:read)
 */
router.get(
  '/cati/production',
  checkPermission('reports', 'read'),
  validate(commonFilterSchema, 'query'),
  reportsController.getCatiProduction
);

/**
 * @route GET /api/v1/reports/cati/apr
 * @desc Retrieve CATI Agent Performance Report (APR)
 * @access Authenticated (reports:read)
 */
router.get(
  '/cati/apr',
  checkPermission('reports', 'read'),
  validate(commonFilterSchema, 'query'),
  reportsController.getCatiApr
);

/**
 * @route GET /api/v1/reports/capi/production
 * @desc Retrieve CAPI Audit Production Report
 * @access Authenticated (reports:read)
 */
router.get(
  '/capi/production',
  checkPermission('reports', 'read'),
  validate(commonFilterSchema, 'query'),
  reportsController.getCapiProduction
);

/**
 * @route GET /api/v1/reports/capi/apr
 * @desc Retrieve CAPI Auditor Performance Report (APR)
 * @access Authenticated (reports:read)
 */
router.get(
  '/capi/apr',
  checkPermission('reports', 'read'),
  validate(commonFilterSchema, 'query'),
  reportsController.getCapiApr
);

/**
 * @route GET /api/v1/reports/super-audit/production
 * @desc Retrieve Super Audit Production Report
 * @access Authenticated (reports:read)
 */
router.get(
  '/super-audit/production',
  checkPermission('reports', 'read'),
  validate(commonFilterSchema, 'query'),
  reportsController.getSuperAuditProduction
);

/**
 * @route GET /api/v1/reports/super-audit/apr
 * @desc Retrieve Super Audit Auditor Performance Report (APR)
 * @access Authenticated (reports:read)
 */
router.get(
  '/super-audit/apr',
  checkPermission('reports', 'read'),
  validate(commonFilterSchema, 'query'),
  reportsController.getSuperAuditApr
);

/**
 * @route GET /api/v1/reports/tvc/cpr
 * @desc Retrieve TVC Call Performance Report (CPR / CDR-Style)
 * @access Authenticated (reports:read)
 */
router.get(
  '/tvc/cpr',
  checkPermission('reports', 'read'),
  validate(commonFilterSchema, 'query'),
  reportsController.getTvcCpr
);

/**
 * @route GET /api/v1/reports/tvc/apr
 * @desc Retrieve TVC Agent Performance Report (APR)
 * @access Authenticated (reports:read)
 */
router.get(
  '/tvc/apr',
  checkPermission('reports', 'read'),
  validate(commonFilterSchema, 'query'),
  reportsController.getTvcApr
);

/**
 * @route GET /api/v1/reports/fa/cdr
 * @desc Retrieve Feedback Calling (FA) CDR Report
 * @access Authenticated (reports:read)
 */
router.get(
  '/fa/cdr',
  checkPermission('reports', 'read'),
  validate(commonFilterSchema, 'query'),
  reportsController.getFaCdr
);

/**
 * @route GET /api/v1/reports/fa/apr
 * @desc Retrieve Feedback Calling Agent Performance Report (FA APR)
 * @access Authenticated (reports:read)
 */
router.get(
  '/fa/apr',
  checkPermission('reports', 'read'),
  validate(commonFilterSchema, 'query'),
  reportsController.getFaApr
);

/**
 * @route GET /api/v1/reports/agents/unified-apr
 * @desc Retrieve Cross-Module Unified Agent Daily Scorecard & APR
 * @access Authenticated (reports:read)
 */
router.get(
  '/agents/unified-apr',
  checkPermission('reports', 'read'),
  validate(commonFilterSchema, 'query'),
  reportsController.getUnifiedApr
);

/**
 * @route POST /api/v1/reports/export
 * @desc Generate and download on-demand XLSX or CSV report file
 * @access Authenticated (reports:read)
 */
router.post(
  '/export',
  checkPermission('reports', 'read'),
  validate(exportSchema, 'body'),
  reportsController.exportReport
);

module.exports = router;
