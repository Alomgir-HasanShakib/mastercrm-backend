/**
 * @file exam.controller.js
 * @description HTTP Controller handling Exam listing, interactive quiz sessions, answer evaluation, score calculation, and certification issuance.
 */

const { success } = require('../../utils/response');
const examService = require('./exam.service');

const examController = {
  /**
   * Retrieve list of exams with current user's progress and certificates
   * @route GET /api/v1/exam
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async listExams(req, res, next) {
    try {
      const userId = req.user ? req.user.userId : null;
      const exams = await examService.listExams(req.query, userId);
      return success(res, exams, 'Exams retrieved successfully', 200);
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Retrieve exam definition by ID
   * @route GET /api/v1/exam/:id
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async getExamById(req, res, next) {
    try {
      const exam = await examService.getExamById(req.params.id);
      return success(res, exam, 'Exam details retrieved successfully', 200);
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Start or resume an exam attempt session
   * @route POST /api/v1/exam/:examId/start
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async startAttempt(req, res, next) {
    try {
      const userId = req.user.userId;
      const { examId } = req.params;
      const attemptSession = await examService.startAttempt(examId, userId);
      return success(res, attemptSession, 'Exam session started successfully', 200);
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Submit exam answers and evaluate score with pass/fail certificate
   * @route POST /api/v1/exam/submit
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async submitAnswers(req, res, next) {
    try {
      const userId = req.user.userId;
      const { attemptId, answers, submissionCode } = req.body;
      const result = await examService.submitAttempt(attemptId, userId, answers, submissionCode);
      return success(res, result, 'Exam answers evaluated successfully', 200);
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Get graded attempt outcome and question review
   * @route GET /api/v1/exam/attempt/:attemptId
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async getAttemptResult(req, res, next) {
    try {
      const userId = req.user.userId;
      const { attemptId } = req.params;
      const result = await examService.getAttemptResult(attemptId, userId);
      return success(res, result, 'Attempt results retrieved successfully', 200);
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Get list of certificates issued to user
   * @route GET /api/v1/exam/certificates
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async getUserCertificates(req, res, next) {
    try {
      const userId = req.user.userId;
      const certificates = await examService.getUserCertificates(userId);
      return success(res, certificates, 'User certificates retrieved successfully', 200);
    } catch (err) {
      return next(err);
    }
  },
};

module.exports = examController;
