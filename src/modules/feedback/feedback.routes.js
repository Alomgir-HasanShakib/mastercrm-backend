/**
 * @file feedback.routes.js
 * @description Express routing definitions for Field Agent Feedback calling engine.
 */

const express = require('express');
const { authenticate } = require('../../middleware/auth');
const { setTenantContext } = require('../../middleware/tenancy');
const { checkPermission } = require('../../middleware/rbac');
const { validate } = require('../../middleware/validator');
const feedbackController = require('./feedback.controller');
const {
  idParamSchema,
  listSchema,
  createLeadSchema,
  assignCallerSchema,
  logAttemptSchema,
  updateResolutionSchema,
  metricsQuerySchema,
} = require('./feedback.validation');

const router = express.Router();

router.use(authenticate, setTenantContext);

/**
 * @route GET /api/v1/feedback/metrics
 * @desc Get Feedback calling metrics and mistake admission rates
 */
router.get(
  '/metrics',
  checkPermission('feedback', 'read'),
  validate(metricsQuerySchema, 'query'),
  feedbackController.getMetrics
);

/**
 * @route GET /api/v1/feedback/recurrence
 * @desc Get recurrent mistake patterns and field agent coaching analytics
 */
router.get(
  '/recurrence',
  checkPermission('feedback', 'read'),
  validate(metricsQuerySchema, 'query'),
  feedbackController.getMetrics
);

/**
 * @route GET /api/v1/feedback
 * @route GET /api/v1/feedback/leads
 * @desc List feedback leads with filtering and pagination
 */
router.get(
  '/',
  checkPermission('feedback', 'read'),
  validate(listSchema, 'query'),
  feedbackController.list
);

router.get(
  '/leads',
  checkPermission('feedback', 'read'),
  validate(listSchema, 'query'),
  feedbackController.list
);

/**
 * @route POST /api/v1/feedback
 * @route POST /api/v1/feedback/leads
 * @desc Create feedback lead for a field agent
 */
router.post(
  '/',
  checkPermission('feedback', 'create'),
  validate(createLeadSchema, 'body'),
  feedbackController.create
);

router.post(
  '/leads',
  checkPermission('feedback', 'create'),
  validate(createLeadSchema, 'body'),
  feedbackController.create
);

/**
 * @route GET /api/v1/feedback/:id
 * @route GET /api/v1/feedback/leads/:id
 * @desc Get single feedback lead details
 */
router.get(
  '/:id',
  checkPermission('feedback', 'read'),
  validate(idParamSchema, 'params'),
  feedbackController.getById
);

router.get(
  '/leads/:id',
  checkPermission('feedback', 'read'),
  validate(idParamSchema, 'params'),
  feedbackController.getById
);

/**
 * @route POST /api/v1/feedback/:id/assign
 * @route POST /api/v1/feedback/leads/:id/assign
 * @desc Assign caller executive to feedback lead
 */
router.post(
  '/:id/assign',
  checkPermission('feedback', 'update'),
  validate(idParamSchema, 'params'),
  validate(assignCallerSchema, 'body'),
  feedbackController.assignCaller
);

router.post(
  '/leads/:id/assign',
  checkPermission('feedback', 'update'),
  validate(idParamSchema, 'params'),
  validate(assignCallerSchema, 'body'),
  feedbackController.assignCaller
);

/**
 * @route POST /api/v1/feedback/:id/attempts
 * @route POST /api/v1/feedback/leads/:id/attempts
 * @desc Record call attempt with mistake admission or dispute notes
 */
router.post(
  '/:id/attempts',
  checkPermission('feedback', 'update'),
  validate(idParamSchema, 'params'),
  validate(logAttemptSchema, 'body'),
  feedbackController.logAttempt
);

router.post(
  '/leads/:id/attempts',
  checkPermission('feedback', 'update'),
  validate(idParamSchema, 'params'),
  validate(logAttemptSchema, 'body'),
  feedbackController.logAttempt
);

/**
 * @route GET /api/v1/feedback/:id/attempts
 * @route GET /api/v1/feedback/leads/:id/attempts
 * @desc Get attempt history for a feedback lead
 */
router.get(
  '/:id/attempts',
  checkPermission('feedback', 'read'),
  validate(idParamSchema, 'params'),
  feedbackController.getAttempts
);

router.get(
  '/leads/:id/attempts',
  checkPermission('feedback', 'read'),
  validate(idParamSchema, 'params'),
  feedbackController.getAttempts
);

/**
 * @route PATCH /api/v1/feedback/:id/resolution
 * @route PATCH /api/v1/feedback/leads/:id/resolution
 * @desc Update feedback resolution
 */
router.patch(
  '/:id/resolution',
  checkPermission('feedback', 'update'),
  validate(idParamSchema, 'params'),
  validate(updateResolutionSchema, 'body'),
  feedbackController.updateResolution
);

router.patch(
  '/leads/:id/resolution',
  checkPermission('feedback', 'update'),
  validate(idParamSchema, 'params'),
  validate(updateResolutionSchema, 'body'),
  feedbackController.updateResolution
);

module.exports = router;
