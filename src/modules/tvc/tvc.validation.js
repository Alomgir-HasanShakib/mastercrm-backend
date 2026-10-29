/**
 * @file tvc.validation.js
 * @description Joi validation schemas for Tele-verification (TVC) requests.
 */

const Joi = require('joi');

const idParamSchema = Joi.object({
  id: Joi.string().required(),
});

const listSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  projectId: Joi.string().uuid().optional(),
  vendorId: Joi.string().uuid().optional(),
  agentId: Joi.string().uuid().optional(),
  status: Joi.string().valid('QUEUED', 'IN_PROGRESS', 'VERIFIED', 'REJECTED', 'MAX_ATTEMPTS_EXCEEDED', 'CALLBACK_SCHEDULED').optional(),
  verificationStatus: Joi.string().valid('VERIFIED', 'FAILED', 'PENDING', 'UNREACHABLE').optional(),
  dueCallback: Joi.boolean().optional(),
  search: Joi.string().max(100).optional(),
  sortBy: Joi.string().valid('created_at', 'priority', 'total_attempts', 'last_attempt_at').default('priority'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
});

const createLeadSchema = Joi.object({
  submissionId: Joi.string().uuid().required(),
  projectId: Joi.string().uuid().required(),
  vendorId: Joi.string().uuid().allow(null).optional(),
  respondentName: Joi.string().max(255).allow(null, '').optional(),
  phoneNumber: Joi.string().max(50).required(),
  priority: Joi.number().integer().min(0).max(100).default(50),
  maxAttempts: Joi.number().integer().min(1).max(10).default(3),
  metadata: Joi.object().default({}),
});

const assignLeadSchema = Joi.object({
  agentId: Joi.string().uuid().required(),
});

const logAttemptSchema = Joi.object({
  callStatus: Joi.string().valid('INITIATED', 'RINGING', 'ANSWERED', 'BUSY', 'NO_ANSWER', 'FAILED').default('ANSWERED'),
  disposition: Joi.string().valid(
    'Call Disconnected',
    'Ringing',
    'Not Reachable',
    'Invalid Number',
    'Number Busy',
    'Voice Issue',
    'Incomplete Form',
    'Switched Off',
    'Not A Voter',
    'Complete',
    'Multiple Survey',
    'CONNECTED_VERIFIED',
    'CONNECTED_DISCREPANCY',
    'BUSY',
    'NO_ANSWER',
    'WRONG_NUMBER',
    'REFUSED',
    'CALLBACK_REQUESTED',
    'SWITCHED_OFF'
  ).required(),
  dialerCallId: Joi.string().max(100).allow(null, '').optional(),
  callDuration: Joi.number().integer().min(0).default(0),
  recordingUrl: Joi.string().uri().allow(null, '').optional(),
  verificationAnswers: Joi.object().default({}),
  verificationScore: Joi.number().precision(2).min(0).max(100).optional(),
  callbackTime: Joi.date().iso().allow(null).optional(),
  notes: Joi.string().allow('', null).optional(),
}).unknown(true);

const metricsQuerySchema = Joi.object({
  projectId: Joi.string().uuid().optional(),
  vendorId: Joi.string().uuid().optional(),
  agentId: Joi.string().uuid().optional(),
  dateFrom: Joi.date().iso().optional(),
  dateTo: Joi.date().iso().optional(),
});

module.exports = {
  idParamSchema,
  listSchema,
  createLeadSchema,
  assignLeadSchema,
  logAttemptSchema,
  metricsQuerySchema,
};
