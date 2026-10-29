/**
 * @file super-audit.routes.js
 * @description Express routing definitions for Super Audit and QC engine.
 */

const express = require('express');
const { authenticate } = require('../../middleware/auth');
const { setTenantContext } = require('../../middleware/tenancy');
const { checkPermission } = require('../../middleware/rbac');
const { validate } = require('../../middleware/validator');
const superAuditController = require('./super-audit.controller');
const {
  idParamSchema,
  listSchema,
  routeSubmissionSchema,
  assignAuditorSchema,
  saveItemsSchema,
  submitDecisionSchema,
  sampleRoutingBatchSchema,
  metricsQuerySchema,
} = require('./super-audit.validation');
const { requireAiAuditEnabled } = require('../../middleware/subscriptionGate');

const router = express.Router();

router.use(authenticate, setTenantContext, requireAiAuditEnabled);

/**
 * Autonomous AI Super Audit Worker routes (10:00 AM - 07:00 PM schedule)
 */
router.get('/auto-worker/status', superAuditController.getAutoWorkerStatus);
router.post('/auto-worker/toggle', superAuditController.toggleAutoWorker);
router.post('/auto-worker/force-run', superAuditController.forceRunWorker);

/**
 * Client DB Pull & Push routes (Triple Table: Input, Output 1, Output 2)
 */
router.post('/client-db/pull', superAuditController.pullClientDb);
router.post('/client-db/push', superAuditController.pushClientDb);
router.get('/client-db/stats', superAuditController.getClientDbStats);
router.get('/records', superAuditController.getRecordsFromDb);

/**
 * @route GET /api/v1/super-audit/metrics
 * @desc Get Super Audit QC metrics and overrule rates
 */
router.get(
  '/metrics',
  checkPermission('super-audit', 'read'),
  validate(metricsQuerySchema, 'query'),
  superAuditController.getMetrics
);

/**
 * @route POST /api/v1/super-audit/sampling-batch
 * @route POST /api/v1/super-audit/sample
 * @desc Auto-sample submissions into Super Audit queue
 */
router.post(
  '/sampling-batch',
  checkPermission('super-audit', 'create'),
  validate(sampleRoutingBatchSchema, 'body'),
  superAuditController.sampleBatch
);

router.post(
  '/sample',
  checkPermission('super-audit', 'create'),
  validate(sampleRoutingBatchSchema, 'body'),
  superAuditController.sampleBatch
);

/**
 * @route GET /api/v1/super-audit
 * @route GET /api/v1/super-audit/audits
 * @desc List Super Audits with filtering and pagination
 */
router.get(
  '/',
  checkPermission('super-audit', 'read'),
  validate(listSchema, 'query'),
  superAuditController.list
);

router.get(
  '/audits',
  checkPermission('super-audit', 'read'),
  validate(listSchema, 'query'),
  superAuditController.list
);

/**
 * @route GET /api/v1/super-audit/:id
 * @route GET /api/v1/super-audit/audits/:id
 * @desc Get single Super Audit by ID with side-by-side comparison
 */
router.get(
  '/:id',
  checkPermission('super-audit', 'read'),
  validate(idParamSchema, 'params'),
  superAuditController.getById
);

router.get(
  '/audits/:id',
  checkPermission('super-audit', 'read'),
  validate(idParamSchema, 'params'),
  superAuditController.getById
);

/**
 * @route POST /api/v1/super-audit/route
 * @desc Route specific submission into Super Audit
 */
router.post(
  '/route',
  checkPermission('super-audit', 'create'),
  validate(routeSubmissionSchema, 'body'),
  superAuditController.routeSubmission
);

/**
 * @route POST /api/v1/super-audit/:id/assign
 * @route POST /api/v1/super-audit/audits/:id/assign
 * @desc Assign Super Auditor
 */
router.post(
  '/:id/assign',
  checkPermission('super-audit', 'update'),
  validate(idParamSchema, 'params'),
  validate(assignAuditorSchema, 'body'),
  superAuditController.assignAuditor
);

router.post(
  '/audits/:id/assign',
  checkPermission('super-audit', 'update'),
  validate(idParamSchema, 'params'),
  validate(assignAuditorSchema, 'body'),
  superAuditController.assignAuditor
);

/**
 * @route POST /api/v1/super-audit/:id/start
 * @route POST /api/v1/super-audit/audits/:id/start
 * @desc Start review session
 */
router.post(
  '/:id/start',
  checkPermission('super-audit', 'update'),
  validate(idParamSchema, 'params'),
  superAuditController.startAudit
);

router.post(
  '/audits/:id/start',
  checkPermission('super-audit', 'update'),
  validate(idParamSchema, 'params'),
  superAuditController.startAudit
);

/**
 * @route POST /api/v1/super-audit/:id/items
 * @route POST /api/v1/super-audit/audits/:id/items
 * @desc Save item confirm/overrule evaluations
 */
router.post(
  '/:id/items',
  checkPermission('super-audit', 'update'),
  validate(idParamSchema, 'params'),
  validate(saveItemsSchema, 'body'),
  superAuditController.saveItems
);

router.post(
  '/audits/:id/items',
  checkPermission('super-audit', 'update'),
  validate(idParamSchema, 'params'),
  validate(saveItemsSchema, 'body'),
  superAuditController.saveItems
);

/**
 * @route POST /api/v1/super-audit/:id/decision
 * @route POST /api/v1/super-audit/audits/:id/decision
 * @desc Submit final Super Audit decision (Confirm vs Overrule)
 */
router.post(
  '/:id/decision',
  checkPermission('super-audit', 'update'),
  validate(idParamSchema, 'params'),
  validate(submitDecisionSchema, 'body'),
  superAuditController.submitDecision
);

router.post(
  '/audits/:id/decision',
  checkPermission('super-audit', 'update'),
  validate(idParamSchema, 'params'),
  validate(submitDecisionSchema, 'body'),
  superAuditController.submitDecision
);

module.exports = router;
