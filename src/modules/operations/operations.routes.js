/**
 * @file operations.routes.js
 * @description Express routing definitions for operations, rechain engine, and live dashboard telemetry.
 */

const express = require('express');
const { authenticate } = require('../../middleware/auth');
const { setTenantContext } = require('../../middleware/tenancy');
const { checkPermission } = require('../../middleware/rbac');
const { validate } = require('../../middleware/validator');
const operationsController = require('./operations.controller');
const { rechainSchema, previewQuerySchema } = require('./operations.validation');

const router = express.Router();

router.use(authenticate, setTenantContext);

/**
 * @route POST /api/v1/operations/rechain
 * @desc Recycle incomplete/stalled data for specific date or all dates, clear orphaned outputs, reset to PENDING
 * @access Authenticated (submissions:update or projects:manage or master_admin)
 */
router.post(
  '/rechain',
  checkPermission('submissions', 'update'),
  validate(rechainSchema, 'body'),
  operationsController.rechain
);

/**
 * @route GET /api/v1/operations/rechain/preview
 * @desc Preview candidate count and records for rechain
 */
router.get(
  '/rechain/preview',
  checkPermission('submissions', 'read'),
  validate(previewQuerySchema, 'query'),
  operationsController.previewRechain
);

/**
 * @route GET /api/v1/operations/dashboard-insights
 * @desc Retrieve real-time throughput charts, vendor speedometers, AC distribution, and KPI summary
 */
router.get(
  '/dashboard-insights',
  checkPermission('reports', 'read'),
  operationsController.getDashboardInsights
);

module.exports = router;
