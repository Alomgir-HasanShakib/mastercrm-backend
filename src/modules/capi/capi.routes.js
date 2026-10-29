/**
 * @file capi.routes.js
 * @description Express routing definitions for audio-first CAPI audit engine.
 */

const express = require('express');
const { authenticate } = require('../../middleware/auth');
const { setTenantContext } = require('../../middleware/tenancy');
const { checkPermission } = require('../../middleware/rbac');
const { validate } = require('../../middleware/validator');
const capiController = require('./capi.controller');
const {
  idParamSchema,
  listSchema,
  createSchema,
  assignAuditorSchema,
  saveItemsSchema,
  submitDecisionSchema,
  metricsQuerySchema,
  resolveReviewSchema,
} = require('./capi.validation');

const router = express.Router();

router.use(authenticate, setTenantContext);

/**
 * @route GET /api/v1/capi/metrics
 * @desc Get CAPI audit analytics and KPIs
 */
router.get(
  '/metrics',
  checkPermission('capi', 'read'),
  validate(metricsQuerySchema, 'query'),
  capiController.getMetrics
);

/**
 * @route GET /api/v1/capi
 * @route GET /api/v1/capi/audits
 * @desc List CAPI audits with filtering and pagination
 */
router.get(
  '/',
  checkPermission('capi', 'read'),
  validate(listSchema, 'query'),
  capiController.list
);

router.get(
  '/audits',
  checkPermission('capi', 'read'),
  validate(listSchema, 'query'),
  capiController.list
);

/**
 * @route POST /api/v1/capi
 * @route POST /api/v1/capi/audits
 * @desc Initialize new CAPI audit
 */
router.post(
  '/',
  checkPermission('capi', 'create'),
  validate(createSchema, 'body'),
  capiController.create
);

router.post(
  '/audits',
  checkPermission('capi', 'create'),
  validate(createSchema, 'body'),
  capiController.create
);

/**
 * @route GET /api/v1/capi/next
 * @route POST /api/v1/capi/next
 * @route GET /api/v1/capi/audits/next
 * @route POST /api/v1/capi/audits/next
 * @desc Get and atomically lock next queued audit for auditor (with 20-min lock & single audit limit)
 */
router.get('/next', checkPermission('capi', 'read'), capiController.getNext);
router.post('/next', checkPermission('capi', 'read'), capiController.getNext);
router.get('/audits/next', checkPermission('capi', 'read'), capiController.getNext);
router.post('/audits/next', checkPermission('capi', 'read'), capiController.getNext);

/**
 * @route GET /api/v1/capi/my-completed
 * @route GET /api/v1/capi/audits/my-completed
 * @desc Get completed audits for current auditor (Auditor Data Isolation)
 */
router.get('/my-completed', checkPermission('capi', 'read'), capiController.getMyCompleted);
router.get('/audits/my-completed', checkPermission('capi', 'read'), capiController.getMyCompleted);

/**
 * @route POST /api/v1/capi/:id/release
 * @route POST /api/v1/capi/audits/:id/release
 * @desc Release active audit back to queue
 */
router.post('/:id/release', checkPermission('capi', 'update'), capiController.releaseAudit);
router.post('/audits/:id/release', checkPermission('capi', 'update'), capiController.releaseAudit);

/**
 * @route POST /api/v1/capi/ai-audit/start
 * @desc Start Multi-Worker Parallel AI Auditor for CAPI
 */
router.post('/ai-audit/start', checkPermission('capi', 'update'), capiController.startAiAudit);

/**
 * @route POST /api/v1/capi/ai-audit/stop
 * @desc Stop Multi-Worker Parallel AI Auditor for CAPI
 */
router.post('/ai-audit/stop', checkPermission('capi', 'update'), capiController.stopAiAudit);

/**
 * @route GET /api/v1/capi/ai-audit/status
 * @desc Get status of Parallel AI Auditor Worker Pool
 */
router.get('/ai-audit/status', checkPermission('capi', 'read'), capiController.getAiAuditStatus);

/**
 * @route POST /api/v1/capi/ai-audit/emergency-override
 * @desc Activate Emergency Manual Override (7 PM IST Bypass) for 15m, 30m, or 1 hour
 */
router.post(
  '/ai-audit/emergency-override',
  checkPermission('capi', 'update'),
  capiController.activateEmergencyOverride
);

/**
 * @route POST /api/v1/capi/ai-audit/emergency-override/cancel
 * @route DELETE /api/v1/capi/ai-audit/emergency-override
 * @desc Cancel active Emergency Manual Override
 */
router.post(
  '/ai-audit/emergency-override/cancel',
  checkPermission('capi', 'update'),
  capiController.cancelEmergencyOverride
);
router.delete(
  '/ai-audit/emergency-override',
  checkPermission('capi', 'update'),
  capiController.cancelEmergencyOverride
);

/**
 * @route GET /api/v1/capi/ai-audit/emergency-override
 * @desc Get current Emergency Manual Override status and countdown
 */
router.get(
  '/ai-audit/emergency-override',
  checkPermission('capi', 'read'),
  capiController.getEmergencyOverrideStatus
);

/**
 * @route GET /api/v1/capi/ai-audits
 * @route GET /api/v1/capi/ai-audited-records
 * @desc Get AI-audited records and KPI metrics (View-only inspection)
 */
router.get('/ai-audits', checkPermission('capi', 'read'), capiController.getAiAuditedRecords);
router.get('/ai-audited-records', checkPermission('capi', 'read'), capiController.getAiAuditedRecords);

/**
 * @route GET /api/v1/capi/export-audited/stats
 * @desc Get record count before exporting audited data
 */
router.get('/export-audited/stats', checkPermission('capi', 'read'), capiController.getAuditedExportStats);

/**
 * @route GET /api/v1/capi/export-audited
 * @desc Export audited leads with Question and Answer Validation as CSV
 */
router.get('/export-audited', checkPermission('capi', 'read'), capiController.exportAuditedRecords);

/**
 * @route POST /api/v1/capi/ai-review/:id/resolve
 * @desc Resolve AI-flagged review lead by supervisor
 */
router.post(
  '/ai-review/:id/resolve',
  checkPermission('capi', 'update'),
  validate(idParamSchema, 'params'),
  validate(resolveReviewSchema, 'body'),
  capiController.resolveAiReview
);

/**
 * @route GET /api/v1/capi/:id
 * @route GET /api/v1/capi/audits/:id
 * @desc Get single CAPI audit by ID
 */
router.get(
  '/:id',
  checkPermission('capi', 'read'),
  validate(idParamSchema, 'params'),
  capiController.getById
);

router.get(
  '/audits/:id',
  checkPermission('capi', 'read'),
  validate(idParamSchema, 'params'),
  capiController.getById
);

/**
 * @route POST /api/v1/capi/:id/assign
 * @route POST /api/v1/capi/audits/:id/assign
 * @desc Assign auditor to audit session
 */
router.post(
  '/:id/assign',
  checkPermission('capi', 'update'),
  validate(idParamSchema, 'params'),
  validate(assignAuditorSchema, 'body'),
  capiController.assignAuditor
);

router.post(
  '/audits/:id/assign',
  checkPermission('capi', 'update'),
  validate(idParamSchema, 'params'),
  validate(assignAuditorSchema, 'body'),
  capiController.assignAuditor
);

/**
 * @route POST /api/v1/capi/:id/start
 * @route POST /api/v1/capi/audits/:id/start
 * @desc Begin auditor review session
 */
router.post(
  '/:id/start',
  checkPermission('capi', 'update'),
  validate(idParamSchema, 'params'),
  capiController.startAudit
);

router.post(
  '/audits/:id/start',
  checkPermission('capi', 'update'),
  validate(idParamSchema, 'params'),
  capiController.startAudit
);

/**
 * @route POST /api/v1/capi/:id/items
 * @route POST /api/v1/capi/audits/:id/items
 * @desc Save item evaluations during review
 */
router.post(
  '/:id/items',
  checkPermission('capi', 'update'),
  validate(idParamSchema, 'params'),
  validate(saveItemsSchema, 'body'),
  capiController.saveItems
);

router.post(
  '/audits/:id/items',
  checkPermission('capi', 'update'),
  validate(idParamSchema, 'params'),
  validate(saveItemsSchema, 'body'),
  capiController.saveItems
);

/**
 * @route POST /api/v1/capi/:id/decision
 * @route POST /api/v1/capi/audits/:id/decision
 * @desc Submit final audit evaluation and sync status
 */
router.post(
  '/:id/decision',
  checkPermission('capi', 'update'),
  validate(idParamSchema, 'params'),
  validate(submitDecisionSchema, 'body'),
  capiController.submitDecision
);

router.post(
  '/audits/:id/decision',
  checkPermission('capi', 'update'),
  validate(idParamSchema, 'params'),
  validate(submitDecisionSchema, 'body'),
  capiController.submitDecision
);

module.exports = router;
