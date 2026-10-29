/**
 * @file submissions.routes.js
 * @description Express routing definitions for canonical submission lifecycle.
 */

const express = require('express');
const { authenticate } = require('../../middleware/auth');
const { setTenantContext } = require('../../middleware/tenancy');
const { checkPermission } = require('../../middleware/rbac');
const { validate } = require('../../middleware/validator');
const submissionsController = require('./submissions.controller');
const {
  idParamSchema,
  createSchema,
  updateSchema,
  statusSchema,
  responsesSchema,
  syncSchema,
  listSchema,
  searchQuerySchema,
} = require('./submissions.validation');

const router = express.Router();

router.use(authenticate, setTenantContext);

/**
 * @route GET /api/v1/submissions/search
 * @route POST /api/v1/submissions/search
 * @desc Search submissions by text query or multi-field search
 */
router.get(
  '/search',
  checkPermission('submissions', 'read'),
  validate(searchQuerySchema, 'query'),
  submissionsController.search
);

router.post(
  '/search',
  checkPermission('submissions', 'read'),
  (req, res, next) => {
    const q = req.body?.q || req.body?.query || req.body?.search || '';
    req.query.q = q;
    return submissionsController.search(req, res, next);
  }
);

/**
 * @route POST /api/v1/submissions/sync
 * @desc Idempotent offline submissions sync (batch)
 */
router.post(
  '/sync',
  checkPermission('submissions', 'create'),
  validate(syncSchema, 'body'),
  submissionsController.syncOffline
);

/**
 * @route GET /api/v1/submissions
 * @desc List submissions with filtering and pagination
 */
router.get(
  '/',
  checkPermission('submissions', 'read'),
  validate(listSchema, 'query'),
  submissionsController.list
);

/**
 * @route POST /api/v1/submissions/sql-dump
 * @desc Ingest single 47-column raw survey dump and auto-distribute to TVC, CAPI, AI Super Audit
 */
router.post(
  '/sql-dump',
  checkPermission('submissions', 'create'),
  submissionsController.ingestDump
);

/**
 * @route POST /api/v1/submissions/dumps/bulk
 * @desc Ingest bulk raw survey dumps
 */
router.post(
  '/dumps/bulk',
  checkPermission('submissions', 'create'),
  submissionsController.bulkDump
);

/**
 * @route GET /api/v1/submissions/:id
 * @desc Get submission with responses
 */
router.get(
  '/:id',
  checkPermission('submissions', 'read'),
  validate(idParamSchema, 'params'),
  submissionsController.getById
);

/**
 * @route POST /api/v1/submissions
 * @desc Create new submission (CATI start)
 */
router.post(
  '/',
  checkPermission('submissions', 'create'),
  validate(createSchema, 'body'),
  submissionsController.create
);

/**
 * @route PUT /api/v1/submissions/:id
 * @desc Update submission
 */
router.put(
  '/:id',
  checkPermission('submissions', 'update'),
  validate(idParamSchema, 'params'),
  validate(updateSchema, 'body'),
  submissionsController.update
);

/**
 * @route PATCH /api/v1/submissions/:id/status
 * @desc Update submission status
 */
router.patch(
  '/:id/status',
  checkPermission('submissions', 'update'),
  validate(idParamSchema, 'params'),
  validate(statusSchema, 'body'),
  submissionsController.updateStatus
);

/**
 * @route GET /api/v1/submissions/:id/responses
 * @desc Get all responses for a submission
 */
router.get(
  '/:id/responses',
  checkPermission('submissions', 'read'),
  validate(idParamSchema, 'params'),
  submissionsController.getResponses
);

/**
 * @route POST /api/v1/submissions/:id/responses
 * @desc Save/upsert responses batch
 */
router.post(
  '/:id/responses',
  checkPermission('submissions', 'update'),
  validate(idParamSchema, 'params'),
  validate(responsesSchema, 'body'),
  submissionsController.saveResponses
);

/**
 * @route GET /api/v1/submissions/:id/timeline
 * @desc Get lifecycle events timeline
 */
router.get(
  '/:id/timeline',
  checkPermission('submissions', 'read'),
  validate(idParamSchema, 'params'),
  submissionsController.getTimeline
);

/**
 * @route POST /api/v1/submissions/projects/:projectId/records/:recordId/submissions
 * @desc Authoritative dynamic form submission with server rule re-evaluation
 */
router.post(
  '/projects/:projectId/records/:recordId/submissions',
  checkPermission('submissions', 'create'),
  submissionsController.submitDynamicForm
);

/**
 * @route POST /api/v1/submissions/projects/:projectId/submissions/:submissionId/export
 * @desc Export record according to approved target layout (e.g. Output2 columns)
 */
router.post(
  '/projects/:projectId/submissions/:submissionId/export',
  checkPermission('submissions', 'read'),
  submissionsController.exportDynamicTarget
);

/**
 * @route POST /api/v1/submissions/rechain
 * @desc Data Rechain & Re-allocation endpoint (alias to operations/rechain)
 */
const operationsController = require('../operations/operations.controller');
const { rechainSchema } = require('../operations/operations.validation');
router.post(
  '/rechain',
  checkPermission('submissions', 'update'),
  validate(rechainSchema, 'body'),
  operationsController.rechain
);

module.exports = router;
