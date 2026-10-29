/**
 * @file exam.routes.js
 * @description Express routing definitions for Surveyor and Agent Exam Management, Certification Quizzes, and Result Evaluation.
 */

const express = require('express');
const { authenticate } = require('../../middleware/auth');
const { setTenantContext } = require('../../middleware/tenancy');
const { validate } = require('../../middleware/validator');
const examController = require('./exam.controller');
const {
  listExamsQuerySchema,
  startAttemptParamsSchema,
  submitAnswersSchema,
} = require('./exam.validation');

const router = express.Router();

// Require authentication for all exam routes
router.use(authenticate, setTenantContext);

/**
 * @route GET /api/v1/exam
 * @desc List active exams with current user's progress and certificates
 * @access Authenticated Surveyor / Agent / Admin
 */
router.get('/', validate(listExamsQuerySchema, 'query'), examController.listExams);

/**
 * @route GET /api/v1/exam/certificates
 * @desc Get all issued certification credentials for the authenticated user
 * @access Authenticated Surveyor / Agent
 */
router.get('/certificates', examController.getUserCertificates);

/**
 * @route GET /api/v1/exam/attempt/:attemptId
 * @desc Get evaluated quiz results and review
 * @access Authenticated Surveyor / Agent
 */
router.get('/attempt/:attemptId', examController.getAttemptResult);

/**
 * @route GET /api/v1/exam/:id
 * @desc Get detailed exam configuration
 * @access Authenticated Surveyor / Admin
 */
router.get('/:id', examController.getExamById);

/**
 * @route POST /api/v1/exam/:examId/start
 * @desc Start or resume a timed exam attempt session
 * @access Authenticated Surveyor / Agent
 */
router.post(
  '/:examId/start',
  validate(startAttemptParamsSchema, 'params'),
  examController.startAttempt
);

/**
 * @route POST /api/v1/exam/submit
 * @desc Submit exam answers, evaluate score, and issue certificate if passed
 * @access Authenticated Surveyor / Agent
 */
router.post(
  '/submit',
  validate(submitAnswersSchema, 'body'),
  examController.submitAnswers
);

module.exports = router;
