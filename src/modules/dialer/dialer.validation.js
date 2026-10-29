/**
 * @file dialer.validation.js
 * @description Joi validation schemas for Dialer Click-to-call, webhooks, and CDR ingestion.
 */

const Joi = require('joi');

const idParamSchema = Joi.object({
  id: Joi.string().required(),
});

const clickToCallSchema = Joi.object({
  destinationNumber: Joi.string().max(50).required(),
  callerNumber: Joi.string().max(50).optional(),
  agentExtension: Joi.string().max(50).optional(),
  provider: Joi.string().valid('ASTERISK', 'REST', 'MOCK', 'TATA', 'SMARTFLO', 'ACEFONE').default('MOCK'),
  module: Joi.string().valid('TVC', 'FEEDBACK', 'CATI', 'GENERAL').default('GENERAL'),
  referenceId: Joi.string().uuid().allow(null).optional(),
  projectId: Joi.string().uuid().allow(null).optional(),
});

const hangupCallSchema = Joi.object({
  callId: Joi.string().required(),
  reason: Joi.string().default('NORMAL_CLEARING'),
});

const webhookParamSchema = Joi.object({
  provider: Joi.string().valid('asterisk', 'rest', 'mock', 'twilio', 'vicidial', 'tata', 'smartflo', 'acefone').default('mock'),
});

const cdrIngestSchema = Joi.object({
  callId: Joi.string().required(),
  provider: Joi.string().default('GENERIC_REST'),
  direction: Joi.string().valid('INBOUND', 'OUTBOUND').default('OUTBOUND'),
  callerNumber: Joi.string().max(50).allow(null, '').optional(),
  destinationNumber: Joi.string().max(50).required(),
  agentId: Joi.string().uuid().allow(null).optional(),
  projectId: Joi.string().uuid().allow(null).optional(),
  module: Joi.string().max(50).allow(null, '').optional(),
  referenceId: Joi.string().uuid().allow(null).optional(),
  status: Joi.string().valid('INITIATED', 'RINGING', 'ANSWERED', 'ENDED', 'FAILED', 'BUSY', 'NO_ANSWER').required(),
  durationSeconds: Joi.number().integer().min(0).default(0),
  billableSeconds: Joi.number().integer().min(0).default(0),
  recordingUrl: Joi.string().uri().allow(null, '').optional(),
  hangupCause: Joi.string().max(100).allow(null, '').optional(),
  startedAt: Joi.date().iso().allow(null).optional(),
  answeredAt: Joi.date().iso().allow(null).optional(),
  endedAt: Joi.date().iso().allow(null).optional(),
  rawPayload: Joi.object().default({}),
});

const listCdrSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  projectId: Joi.string().uuid().optional(),
  agentId: Joi.string().uuid().optional(),
  module: Joi.string().optional(),
  status: Joi.string().optional(),
  provider: Joi.string().optional(),
  direction: Joi.string().valid('INBOUND', 'OUTBOUND').optional(),
  dateFrom: Joi.date().iso().optional(),
  dateTo: Joi.date().iso().optional(),
  search: Joi.string().max(100).optional(),
  sortBy: Joi.string().valid('created_at', 'duration_seconds', 'billable_seconds', 'status').default('created_at'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
});

const statsQuerySchema = Joi.object({
  projectId: Joi.string().uuid().optional(),
  agentId: Joi.string().uuid().optional(),
  module: Joi.string().optional(),
  dateFrom: Joi.date().iso().optional(),
  dateTo: Joi.date().iso().optional(),
});

module.exports = {
  idParamSchema,
  clickToCallSchema,
  hangupCallSchema,
  webhookParamSchema,
  cdrIngestSchema,
  listCdrSchema,
  statsQuerySchema,
};
