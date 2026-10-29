/**
 * @file feedback.validation.js
 * @description Joi validation schemas for Field Agent (FA) feedback calling and dispute workflows.
 */

const Joi = require('joi');

const idParamSchema = Joi.object({
  id: Joi.string().required(),
});

const listSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(50),
  projectId: Joi.string().allow(null, '').optional(),
  vendorId: Joi.string().allow(null, '').optional(),
  fieldAgentId: Joi.string().allow(null, '').optional(),
  feedbackCallerId: Joi.string().allow(null, '').optional(),
  status: Joi.string().allow(null, '').optional(),
  resolution: Joi.string().allow(null, '').optional(),
  originModule: Joi.string().allow(null, '').optional(),
  table: Joi.string().allow(null, '').optional(),
  tableName: Joi.string().allow(null, '').optional(),
  search: Joi.string().allow(null, '').optional(),
  sortBy: Joi.string().allow(null, '').default('created_at'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
}).unknown(true);

const createLeadSchema = Joi.object({
  submissionId: Joi.string().uuid().required(),
  projectId: Joi.string().uuid().required(),
  vendorId: Joi.string().uuid().allow(null).optional(),
  fieldAgentId: Joi.string().uuid().allow(null).optional(),
  originModule: Joi.string().valid('CAPI', 'TVC', 'SUPER_AUDIT', 'MANUAL').default('CAPI'),
  reasonForFeedback: Joi.string().required(),
  discrepancySummary: Joi.object().default({}),
  maxAttempts: Joi.number().integer().min(1).max(10).default(3),
  metadata: Joi.object().default({}),
});

const assignCallerSchema = Joi.object({
  callerId: Joi.string().uuid().required(),
});

const logAttemptSchema = Joi.object({
  callStatus: Joi.string().valid('CONNECTED', 'RINGING', 'NO_ANSWER', 'BUSY', 'FAILED').default('CONNECTED'),
  disposition: Joi.string().valid(
    'AGENT_CONTACTED',
    'NO_ANSWER',
    'BUSY',
    'CALLBACK',
    'PHONE_OFF',
    'CALL_REJECTED'
  ).required(),
  dialerCallId: Joi.string().max(100).allow(null, '').optional(),
  callDuration: Joi.number().integer().min(0).default(0),
  mistakeAdmitted: Joi.boolean().allow(null).optional(),
  mistakeReason: Joi.string().max(255).allow(null, '').optional(),
  disputeNotes: Joi.string().allow(null, '').optional(),
  evidenceUrls: Joi.array().items(Joi.string().uri()).default([]),
  correctiveAction: Joi.string().valid('WARNING_ISSUED', 'RETRAINING_SCHEDULED', 'TERMINATED', 'DISPUTE_UPHELD', 'DISMISSED', 'NONE').default('NONE'),
  resolution: Joi.string().valid('MISTAKE_ADMITTED', 'DISPUTED', 'RETRAINED', 'ESCALATED', 'INCONCLUSIVE').optional(),
  notes: Joi.string().allow('', null).optional(),
  recordingUrl: Joi.string().uri().allow(null, '').optional(),
});

const updateResolutionSchema = Joi.object({
  resolution: Joi.string().allow(null, '').optional(),
  resolutionStatus: Joi.string().allow(null, '').optional(),
  correctiveAction: Joi.string().allow(null, '').optional(),
  sanctionsAmount: Joi.number().optional(),
  supervisorNotes: Joi.string().allow('', null).optional(),
  agentAdmission: Joi.string().allow('', null).optional(),
  audioRecordedSeconds: Joi.number().optional(),
  hasAudioRecording: Joi.boolean().optional(),
  notes: Joi.string().allow('', null).optional(),
}).unknown(true);

const metricsQuerySchema = Joi.object({
  projectId: Joi.string().uuid().optional(),
  vendorId: Joi.string().uuid().optional(),
  fieldAgentId: Joi.string().uuid().optional(),
  feedbackCallerId: Joi.string().uuid().optional(),
  dateFrom: Joi.date().iso().optional(),
  dateTo: Joi.date().iso().optional(),
});

module.exports = {
  idParamSchema,
  listSchema,
  createLeadSchema,
  assignCallerSchema,
  logAttemptSchema,
  updateResolutionSchema,
  metricsQuerySchema,
};
