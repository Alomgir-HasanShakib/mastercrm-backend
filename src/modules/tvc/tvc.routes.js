/**
 * @file tvc.routes.js
 * @description Express routing definitions for Tele-verification calling engine.
 */

const express = require('express');
const { authenticate } = require('../../middleware/auth');
const { setTenantContext } = require('../../middleware/tenancy');
const { checkPermission } = require('../../middleware/rbac');
const { validate } = require('../../middleware/validator');
const tvcController = require('./tvc.controller');
const {
  idParamSchema,
  listSchema,
  createLeadSchema,
  assignLeadSchema,
  logAttemptSchema,
  metricsQuerySchema,
} = require('./tvc.validation');

const router = express.Router();

router.use(authenticate, setTenantContext);

/**
 * @route GET /api/v1/tvc/metrics
 * @desc Get TVC call performance metrics
 */
router.get(
  '/metrics',
  checkPermission('tvc', 'read'),
  validate(metricsQuerySchema, 'query'),
  tvcController.getMetrics
);

/**
 * @route GET /api/v1/tvc/my-completed
 * @route GET /api/v1/tvc/leads/my-completed
 * @desc Get completed verifications for current agent
 */
router.get(
  '/my-completed',
  checkPermission('tvc', 'read'),
  tvcController.getMyCompleted
);

router.get(
  '/leads/my-completed',
  checkPermission('tvc', 'read'),
  tvcController.getMyCompleted
);

/**
 * @route GET /api/v1/tvc
 * @route GET /api/v1/tvc/leads
 * @desc List TVC leads with filtering and pagination
 */
router.get(
  '/',
  checkPermission('tvc', 'read'),
  validate(listSchema, 'query'),
  tvcController.list
);

router.get(
  '/leads',
  checkPermission('tvc', 'read'),
  validate(listSchema, 'query'),
  tvcController.list
);

/**
 * @route GET /api/v1/tvc/next
 * @route GET /api/v1/tvc/leads/next
 * @desc Fetch next queued lead for caller agent (Enforces 1 lead per agent and 20m lock)
 */
router.get(
  '/next',
  checkPermission('tvc', 'read'),
  tvcController.getNext
);

router.get(
  '/leads/next',
  checkPermission('tvc', 'read'),
  tvcController.getNext
);

router.post(
  '/next',
  checkPermission('tvc', 'read'),
  tvcController.getNext
);

router.post(
  '/leads/next',
  checkPermission('tvc', 'read'),
  tvcController.getNext
);

/**
 * @route POST /api/v1/tvc
 * @route POST /api/v1/tvc/leads
 * @desc Enqueue a new TVC lead
 */
router.post(
  '/',
  checkPermission('tvc', 'create'),
  validate(createLeadSchema, 'body'),
  tvcController.create
);

router.post(
  '/leads',
  checkPermission('tvc', 'create'),
  validate(createLeadSchema, 'body'),
  tvcController.create
);

/**
 * @route POST /api/v1/tvc/:id/start
 * @route POST /api/v1/tvc/leads/:id/start
 * @desc Begin TVC lead processing session (stops 20-min countdown timer)
 */
router.post(
  '/:id/start',
  checkPermission('tvc', 'update'),
  validate(idParamSchema, 'params'),
  tvcController.startProcess
);

router.post(
  '/leads/:id/start',
  checkPermission('tvc', 'update'),
  validate(idParamSchema, 'params'),
  tvcController.startProcess
);

/**
 * @route POST /api/v1/tvc/:id/release
 * @route POST /api/v1/tvc/leads/:id/release
 * @desc Release an in-progress lead lock back to queue
 */
router.post(
  '/:id/release',
  checkPermission('tvc', 'update'),
  validate(idParamSchema, 'params'),
  tvcController.releaseLead
);

router.post(
  '/leads/:id/release',
  checkPermission('tvc', 'update'),
  validate(idParamSchema, 'params'),
  tvcController.releaseLead
);

/**
 * @route GET /api/v1/tvc/:id
 * @route GET /api/v1/tvc/leads/:id
 * @desc Get single TVC lead details
 */
router.get(
  '/:id',
  checkPermission('tvc', 'read'),
  validate(idParamSchema, 'params'),
  tvcController.getById
);

router.get(
  '/leads/:id',
  checkPermission('tvc', 'read'),
  validate(idParamSchema, 'params'),
  tvcController.getById
);

/**
 * @route POST /api/v1/tvc/:id/assign
 * @route POST /api/v1/tvc/leads/:id/assign
 * @desc Assign lead to specific caller agent
 */
router.post(
  '/:id/assign',
  checkPermission('tvc', 'update'),
  validate(idParamSchema, 'params'),
  validate(assignLeadSchema, 'body'),
  tvcController.assignLead
);

router.post(
  '/leads/:id/assign',
  checkPermission('tvc', 'update'),
  validate(idParamSchema, 'params'),
  validate(assignLeadSchema, 'body'),
  tvcController.assignLead
);

/**
 * @route POST /api/v1/tvc/:id/attempts
 * @route POST /api/v1/tvc/leads/:id/attempts
 * @desc Log a call attempt with disposition and verification outcome
 */
router.post(
  '/:id/attempts',
  checkPermission('tvc', 'update'),
  validate(idParamSchema, 'params'),
  validate(logAttemptSchema, 'body'),
  tvcController.logAttempt
);

router.post(
  '/leads/:id/attempts',
  checkPermission('tvc', 'update'),
  validate(idParamSchema, 'params'),
  validate(logAttemptSchema, 'body'),
  tvcController.logAttempt
);

/**
 * @route GET /api/v1/tvc/:id/attempts
 * @route GET /api/v1/tvc/leads/:id/attempts
 * @desc Get call attempt history for a lead
 */
router.get(
  '/:id/attempts',
  checkPermission('tvc', 'read'),
  validate(idParamSchema, 'params'),
  tvcController.getAttempts
);

router.get(
  '/leads/:id/attempts',
  checkPermission('tvc', 'read'),
  validate(idParamSchema, 'params'),
  tvcController.getAttempts
);

module.exports = router;
