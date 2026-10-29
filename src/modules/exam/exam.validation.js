/**
 * @file exam.validation.js
 * @description Joi validation schemas for Exam operations, attempts, submissions, and question banks.
 */

const Joi = require('joi');

const listExamsQuerySchema = Joi.object({
  category: Joi.string().valid('CAPI', 'CATI', 'AUDIT', 'GENERAL', 'ALL').optional(),
  status: Joi.string().valid('ACTIVE', 'DRAFT', 'ARCHIVED', 'ALL').optional(),
  projectId: Joi.string().uuid().optional(),
});

const startAttemptParamsSchema = Joi.object({
  examId: Joi.string().uuid().required(),
});

const submitAnswersSchema = Joi.object({
  attemptId: Joi.string().uuid().required(),
  submissionCode: Joi.string().max(128).optional().allow('', null),
  answers: Joi.array()
    .items(
      Joi.object({
        question_id: Joi.string().required(),
        selected_answers: Joi.alternatives().try(
          Joi.array().items(Joi.string().allow('')),
          Joi.string().allow('')
        ).required(),
      })
    )
    .required(),
});

const createExamSchema = Joi.object({
  title: Joi.string().max(255).required(),
  description: Joi.string().max(2000).optional().allow('', null),
  category: Joi.string().valid('CAPI', 'CATI', 'AUDIT', 'GENERAL').default('CAPI'),
  duration_minutes: Joi.number().integer().min(1).max(240).default(30),
  passing_percentage: Joi.number().precision(2).min(1).max(100).default(70.0),
  total_questions_to_ask: Joi.number().integer().min(1).max(100).default(10),
  shuffle_questions: Joi.boolean().default(true),
  allow_retake: Joi.boolean().default(true),
  max_attempts: Joi.number().integer().min(1).max(20).default(5),
  project_id: Joi.string().uuid().optional().allow(null),
});

module.exports = {
  listExamsQuerySchema,
  startAttemptParamsSchema,
  submitAnswersSchema,
  createExamSchema,
};
