/**
 * @file audit-log.routes.js
 * @description Express routing definitions for audit-log module.
 */

const express = require('express');
const { authenticate } = require('../../middleware/auth');
const { setTenantContext } = require('../../middleware/tenancy');
const { checkPermission } = require('../../middleware/rbac');
const { validate } = require('../../middleware/validator');
const auditLogController = require('./audit-log.controller');
const {
  listAuditLogsSchema,
  entityHistoryParamsSchema,
} = require('./audit-log.validation');

const router = express.Router();

router.use(authenticate, setTenantContext);

/**
 * @route GET /api/v1/audit-log/stats
 * @desc Retrieve audit log summary KPI counts
 */
router.get(
  '/stats',
  checkPermission('audit', 'read'),
  auditLogController.getStats
);

/**
 * @route GET /api/v1/audit-log/export
 * @desc Export filtered audit logs as CSV
 */
router.get(
  '/export',
  checkPermission('audit', 'read'),
  auditLogController.exportLogs
);

/**
 * @route GET /api/v1/audit-log
 * @desc List audit logs with filters and pagination
 */
router.get(
  '/',
  checkPermission('audit', 'read'),
  validate(listAuditLogsSchema, 'query'),
  auditLogController.list
);

/**
 * @route GET /api/v1/audit-log/:entityType/:entityId
 * @desc Get audit history for specific entity
 */
router.get(
  '/:entityType/:entityId',
  checkPermission('audit', 'read'),
  validate(entityHistoryParamsSchema, 'params'),
  auditLogController.getEntityHistory
);

module.exports = router;
