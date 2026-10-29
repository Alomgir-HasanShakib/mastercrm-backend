/**
 * @file super-audit.validation.js
 * @description Joi validation schemas for Super Audit and QC routing requests.
 */

const Joi = require('joi');

const idParamSchema = Joi.object({
  id: Joi.string().uuid().required(),
});

const listSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  projectId: Joi.string().uuid().optional(),
  vendorId: Joi.string().uuid().optional(),
  superAuditorId: Joi.string().uuid().optional(),
  status: Joi.string().valid('PENDING', 'ASSIGNED', 'IN_PROGRESS', 'CONFIRMED', 'OVERRULED', 'COMPLETED').optional(),
  decision: Joi.string().valid('CONFIRM', 'OVERRULE', 'RE_AUDIT', 'ESCALATE', 'PENDING').optional(),
  routingReason: Joi.string().max(100).optional(),
  dateFrom: Joi.date().iso().optional(),
  dateTo: Joi.date().iso().optional(),
  search: Joi.string().max(100).optional(),
  sortBy: Joi.string().valid('created_at', 'super_audit_score', 'variance_score', 'status', 'decision').default('created_at'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
});

const routeSubmissionSchema = Joi.object({
  submissionId: Joi.string().uuid().required(),
  capiAuditId: Joi.string().uuid().allow(null).optional(),
  routingReason: Joi.string().valid('RANDOM_SAMPLING', 'CAPI_FAIL_ESCALATION', 'HIGH_RISK_FLAG', 'DISPUTED_FEEDBACK', 'MANUAL_TRIGGER').default('RANDOM_SAMPLING'),
  superAuditorId: Joi.string().uuid().allow(null).optional(),
  notes: Joi.string().allow('', null).optional(),
});

const assignAuditorSchema = Joi.object({
  superAuditorId: Joi.string().uuid().required(),
});

const auditItemEvaluationSchema = Joi.object({
  questionId: Joi.string().uuid().allow(null).optional(),
  questionTag: Joi.string().max(100).required(),
  originalResponse: Joi.any().allow(null).optional(),
  capiEvalStatus: Joi.string().valid('PASS', 'FAIL', 'AMBIGUOUS', 'SKIPPED').allow(null).optional(),
  superEvalStatus: Joi.string().valid('AGREE', 'DISAGREE', 'OVERRULE').required(),
  overruleReason: Joi.string().allow('', null).optional(),
});

const saveItemsSchema = Joi.object({
  items: Joi.array().items(auditItemEvaluationSchema).min(1).required(),
});

const submitDecisionSchema = Joi.object({
  decision: Joi.string().valid('CONFIRM', 'OVERRULE', 'RE_AUDIT', 'ESCALATE').required(),
  finalDecision: Joi.string().valid('PASS', 'FAIL', 'SUSPICIOUS').default('PASS'),
  superAuditScore: Joi.number().precision(2).min(0).max(100).optional(),
  notes: Joi.string().allow('', null).optional(),
  items: Joi.array().items(auditItemEvaluationSchema).optional(),
});

const sampleRoutingBatchSchema = Joi.object({
  projectId: Joi.string().uuid().required(),
  samplingPercentage: Joi.number().precision(2).min(1).max(100).default(10),
  limit: Joi.number().integer().min(1).max(500).default(50),
  includeFailedCapi: Joi.boolean().default(true),
});

const metricsQuerySchema = Joi.object({
  projectId: Joi.string().uuid().optional(),
  vendorId: Joi.string().uuid().optional(),
  superAuditorId: Joi.string().uuid().optional(),
  dateFrom: Joi.date().iso().optional(),
  dateTo: Joi.date().iso().optional(),
});

module.exports = {
  idParamSchema,
  listSchema,
  routeSubmissionSchema,
  assignAuditorSchema,
  saveItemsSchema,
  submitDecisionSchema,
  sampleRoutingBatchSchema,
  metricsQuerySchema,
};
