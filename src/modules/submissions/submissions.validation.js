/**
 * @file submissions.validation.js
 * @description Joi validation schemas for submission lifecycle, status updates, batch responses, and offline sync.
 */

const Joi = require('joi');

const idParamSchema = Joi.object({
  id: Joi.string().required(), // Can be UUID or business code (SUB-...)
});

const createSchema = Joi.object({
  submissionId: Joi.string().max(100).allow(null, '').optional(),
  leadId: Joi.string().allow(null, '').optional(),
  projectId: Joi.string().uuid().required(),
  vendorId: Joi.string().uuid().allow(null).optional(),
  stateId: Joi.string().max(50).allow(null, '').optional(),
  sourceChannel: Joi.string().valid('FIELD_CATI', 'REMOTE_CATI', 'IMPORT').default('REMOTE_CATI'),
  questionnaireVersionId: Joi.string().uuid().allow(null).optional(),
  respondentName: Joi.string().max(255).allow(null, '').optional(),
  respondentPhone: Joi.string().max(50).allow(null, '').optional(),
  respondentMetadata: Joi.object().default({}),
  answers: Joi.object().optional(),
  disposition: Joi.string().allow('', null).optional(),
  dispositionNotes: Joi.string().allow('', null).optional(),
  duration: Joi.number().optional(),
  isDualAudioCaptured: Joi.boolean().optional(),
  geographyData: Joi.object().default({}),
  sourceDeviceId: Joi.string().max(100).allow(null, '').optional(),
  sourceCallId: Joi.string().max(100).allow(null, '').optional(),
  priority: Joi.number().integer().min(0).max(100).default(50),
}).unknown(true);

const updateSchema = Joi.object({
  vendorId: Joi.string().uuid().allow(null).optional(),
  stateId: Joi.string().max(50).allow(null, '').optional(),
  sourceChannel: Joi.string().valid('FIELD_CATI', 'REMOTE_CATI', 'IMPORT').optional(),
  questionnaireVersionId: Joi.string().uuid().allow(null).optional(),
  respondentName: Joi.string().max(255).allow(null, '').optional(),
  respondentPhone: Joi.string().max(50).allow(null, '').optional(),
  respondentMetadata: Joi.object().optional(),
  geographyData: Joi.object().optional(),
  sourceDeviceId: Joi.string().max(100).allow(null, '').optional(),
  sourceCallId: Joi.string().max(100).allow(null, '').optional(),
  priority: Joi.number().integer().min(0).max(100).optional(),
  riskScore: Joi.number().precision(2).min(0).max(100).optional(),
  labels: Joi.array().items(Joi.string()).optional(),
}).min(1);

const statusSchema = Joi.object({
  sourceStatus: Joi.string().valid('STARTED', 'SUBMITTED', 'COMPLETED', 'INCOMPLETE', 'INVALID', 'SYNC_PENDING').optional(),
  capiStatus: Joi.string().valid('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'PASSED', 'NOT_REQUIRED').optional(),
  superAuditStatus: Joi.string().max(50).optional(),
  tvcStatus: Joi.string().max(50).optional(),
  faStatus: Joi.string().max(50).optional(),
  reason: Joi.string().allow('', null).optional(),
}).min(1);

const responseItemSchema = Joi.object({
  questionId: Joi.string().uuid().allow(null).optional(),
  questionTag: Joi.string().max(100).required(),
  responseValue: Joi.any().allow(null).required(),
  responseMetadata: Joi.object().default({}),
  answeredAt: Joi.date().iso().optional(),
});

const responsesSchema = Joi.object({
  responses: Joi.array().items(responseItemSchema).min(1).required(),
});

const syncSchema = Joi.object({
  submissions: Joi.array().items(
    Joi.object({
      clientSubmissionId: Joi.string().required(),
      submissionId: Joi.string().optional(),
      projectId: Joi.string().uuid().required(),
      vendorId: Joi.string().uuid().allow(null).optional(),
      stateId: Joi.string().max(50).allow(null, '').optional(),
      sourceChannel: Joi.string().valid('FIELD_CATI', 'REMOTE_CATI', 'IMPORT').default('FIELD_CATI'),
      questionnaireVersionId: Joi.string().uuid().allow(null).optional(),
      respondentName: Joi.string().max(255).allow(null, '').optional(),
      respondentPhone: Joi.string().max(50).allow(null, '').optional(),
      respondentMetadata: Joi.object().default({}),
      geographyData: Joi.object().default({}),
      sourceDeviceId: Joi.string().max(100).allow(null, '').optional(),
      sourceStatus: Joi.string().valid('STARTED', 'SUBMITTED', 'COMPLETED', 'INCOMPLETE', 'INVALID', 'SYNC_PENDING').default('SUBMITTED'),
      startedAt: Joi.date().iso().allow(null).optional(),
      completedAt: Joi.date().iso().allow(null).optional(),
      responses: Joi.array().items(responseItemSchema).default([]),
    })
  ).min(1).required(),
});

const listSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  projectId: Joi.string().uuid().optional(),
  vendorId: Joi.string().uuid().optional(),
  stateId: Joi.string().max(50).optional(),
  sourceChannel: Joi.string().valid('FIELD_CATI', 'REMOTE_CATI', 'IMPORT').optional(),
  sourceStatus: Joi.string().valid('STARTED', 'SUBMITTED', 'COMPLETED', 'INCOMPLETE', 'INVALID', 'SYNC_PENDING').optional(),
  capiStatus: Joi.string().valid('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'PASSED', 'NOT_REQUIRED').optional(),
  agentId: Joi.string().uuid().optional(),
  dateFrom: Joi.date().iso().optional(),
  dateTo: Joi.date().iso().optional(),
  search: Joi.string().max(100).optional(),
  sortBy: Joi.string().valid('created_at', 'priority', 'risk_score', 'submission_id').default('created_at'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
});

const searchQuerySchema = Joi.object({
  q: Joi.string().min(1).required(),
});

module.exports = {
  idParamSchema,
  createSchema,
  updateSchema,
  statusSchema,
  responsesSchema,
  syncSchema,
  listSchema,
  searchQuerySchema,
};
