/**
 * @file capi.validation.js
 * @description Joi validation schemas for CAPI audio-first audit requests.
 */

const Joi = require('joi');

const idParamSchema = Joi.object({
  id: Joi.string().required(),
});

const listSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  projectId: Joi.string().allow(null, '').optional(),
  vendorId: Joi.string().allow(null, '').optional(),
  auditorId: Joi.string().allow(null, '').optional(),
  status: Joi.string().allow(null, '').optional(),
  decision: Joi.string().allow(null, '').optional(),
  auditType: Joi.string().allow(null, '').optional(),
  dateFrom: Joi.date().iso().optional(),
  dateTo: Joi.date().iso().optional(),
  search: Joi.string().max(100).optional(),
  sortBy: Joi.string().default('created_at'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
}).unknown(true);

const createSchema = Joi.object({
  submissionId: Joi.string().uuid().required(),
  projectId: Joi.string().uuid().required(),
  vendorId: Joi.string().uuid().allow(null).optional(),
  auditorId: Joi.string().uuid().allow(null).optional(),
  auditType: Joi.string().valid('AUDIO_FIRST', 'STANDARD', 'SPOT_CHECK').default('AUDIO_FIRST'),
  audioUrl: Joi.string().uri().allow('', null).optional(),
  audioDuration: Joi.number().integer().min(0).default(0),
  gpsLat: Joi.number().min(-90).max(90).allow(null).optional(),
  gpsLng: Joi.number().min(-180).max(180).allow(null).optional(),
  gpsAccuracy: Joi.number().min(0).allow(null).optional(),
  metadata: Joi.object().default({}),
});

const assignAuditorSchema = Joi.object({
  auditorId: Joi.string().uuid().required(),
});

const auditItemEvaluationSchema = Joi.object({
  questionId: Joi.alternatives().try(Joi.string(), Joi.number()).allow(null).optional(),
  questionTag: Joi.string().max(255).allow('', null).optional(),
  questionCode: Joi.string().max(255).allow('', null).optional(),
  code: Joi.string().max(255).allow('', null).optional(),
  title: Joi.string().allow('', null).optional(),
  originalValue: Joi.any().allow(null).optional(),
  auditedValue: Joi.any().allow(null).optional(),
  status: Joi.string().valid('PASS', 'FAIL', 'AMBIGUOUS', 'SKIPPED').allow('', null).optional(),
  questionDecision: Joi.string().allow('', null).optional(),
  answerDecision: Joi.string().allow('', null).optional(),
  auditorDecision: Joi.string().allow('', null).optional(),
  actualAnswer: Joi.any().allow('', null).optional(),
  auditorNotes: Joi.string().allow('', null).optional(),
  isMismatch: Joi.boolean().optional(),
  audioTimestampStart: Joi.number().integer().min(0).allow(null).optional(),
  audioTimestampEnd: Joi.number().integer().min(0).allow(null).optional(),
  notes: Joi.string().allow('', null).optional(),
}).unknown(true);

const saveItemsSchema = Joi.object({
  items: Joi.array().items(auditItemEvaluationSchema).min(1).required(),
}).unknown(true);

const submitDecisionSchema = Joi.object({
  decision: Joi.string().valid('PASS', 'FAIL', 'ESCALATE', 'FLAG_SUPER_AUDIT').required(),
  score: Joi.number().min(0).max(100).optional(),
  audioQualityScore: Joi.number().min(0).max(100).optional(),
  audioStatus: Joi.string().allow('', null).optional(),
  audioDisposition: Joi.string().allow('', null).optional(),
  gpsStatus: Joi.string().valid('MATCH', 'MISMATCH', 'MISSING', 'OUT_OF_GEOFENCE').allow('', null).optional(),
  feedback: Joi.string().allow('', null).optional(),
  flags: Joi.array().items(Joi.string()).default([]),
  durationSeconds: Joi.number().min(0).optional(),
  items: Joi.array().items(auditItemEvaluationSchema).allow(null).optional(),
}).unknown(true);

const metricsQuerySchema = Joi.object({
  projectId: Joi.string().uuid().optional(),
  vendorId: Joi.string().uuid().optional(),
  auditorId: Joi.string().uuid().optional(),
  dateFrom: Joi.date().iso().optional(),
  dateTo: Joi.date().iso().optional(),
});

const resolveReviewSchema = Joi.object({
  decision: Joi.string().valid('PASS', 'FAIL', 'pass', 'fail').required(),
  score: Joi.number().min(0).max(100).optional(),
  remarks: Joi.string().allow('', null).optional(),
  supervisor_remarks: Joi.string().allow('', null).optional(),
}).unknown(true);

module.exports = {
  idParamSchema,
  listSchema,
  createSchema,
  assignAuditorSchema,
  saveItemsSchema,
  submitDecisionSchema,
  metricsQuerySchema,
  resolveReviewSchema,
};
