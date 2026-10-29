/**
 * @file ai.validation.js
 * @description Joi validation schemas for AI orchestration module endpoints.
 */

const Joi = require('joi');

/**
 * Route parameter validation schema for submissionId.
 */
const submissionIdParamSchema = Joi.object({
  submissionId: Joi.string().required().messages({
    'string.empty': 'submissionId is required',
    'any.required': 'submissionId is required in path parameters',
  }),
});

/**
 * Schema for triggering an AI audit on a submission.
 */
const triggerAuditSchema = Joi.object({
  audioUrl: Joi.string().uri().optional().allow(null, '').messages({
    'string.uri': 'audioUrl must be a valid URL',
  }),
  language: Joi.string().max(20).optional().default('en'),
  strictness: Joi.string().valid('STANDARD', 'STRICT', 'RELAXED', 'HIGH', 'MEDIUM', 'LOW').optional().default('STANDARD'),
  forceReprocess: Joi.boolean().optional().default(false),
  metadata: Joi.object().optional(),
});

/**
 * Schema for Voice KYC enrollment.
 */
const enrollVoiceSchema = Joi.object({
  userId: Joi.string().required().messages({
    'string.empty': 'userId is required',
    'any.required': 'userId is required for voice enrollment',
  }),
  sampleAudioUrl: Joi.string().optional().allow('', null),
  audioBase64: Joi.string().optional().allow('', null),
  embeddingRef: Joi.string().optional().allow('', null),
  qualityScore: Joi.number().optional(),
  fullName: Joi.string().max(200).optional(),
  role: Joi.string().optional().default('ENUMERATOR'),
  metadata: Joi.object().optional(),
}).unknown(true);

/**
 * Schema for Voice KYC verification against enrolled reference profile.
 */
const verifyVoiceSchema = Joi.object({
  userId: Joi.string().required().messages({
    'string.empty': 'userId is required',
    'any.required': 'userId is required for voice verification',
  }),
  audioUrl: Joi.string().optional().allow('', null),
  audioBase64: Joi.string().optional().allow('', null),
  confidenceThreshold: Joi.number().min(0).max(1).optional().default(0.82),
}).unknown(true);

/**
 * Schema for AI TVC conversational turn.
 */
const tvcTurnSchema = Joi.object({
  conversationId: Joi.string().required().messages({
    'string.empty': 'conversationId is required',
    'any.required': 'conversationId is required for conversational turn tracking',
  }),
  submissionId: Joi.string().optional().allow(null, ''),
  leadId: Joi.string().optional().allow(null, ''),
  userInput: Joi.string().required().messages({
    'string.empty': 'userInput cannot be empty',
    'any.required': 'userInput is required',
  }),
  turnNumber: Joi.number().integer().min(1).optional().default(1),
  context: Joi.object({
    respondentName: Joi.string().optional(),
    phoneNumber: Joi.string().optional(),
    projectName: Joi.string().optional(),
    verifiedFields: Joi.array().items(Joi.string()).optional(),
    pendingFields: Joi.array().items(Joi.string()).optional(),
  }).optional().default({}),
});

/**
 * Schema for AI FA (Field Agent) feedback conversational turn.
 */
const faTurnSchema = Joi.object({
  conversationId: Joi.string().required().messages({
    'string.empty': 'conversationId is required',
    'any.required': 'conversationId is required for feedback conversational tracking',
  }),
  submissionId: Joi.string().optional().allow(null, ''),
  leadId: Joi.string().optional().allow(null, ''),
  userInput: Joi.string().required().messages({
    'string.empty': 'userInput cannot be empty',
    'any.required': 'userInput is required',
  }),
  turnNumber: Joi.number().integer().min(1).optional().default(1),
  context: Joi.object({
    agentName: Joi.string().optional(),
    violationType: Joi.string().optional(),
    discrepancyDescription: Joi.string().optional(),
    questionTag: Joi.string().optional(),
    previousAdmissions: Joi.array().items(Joi.string()).optional(),
  }).optional().default({}),
});

module.exports = {
  submissionIdParamSchema,
  triggerAuditSchema,
  enrollVoiceSchema,
  verifyVoiceSchema,
  tvcTurnSchema,
  faTurnSchema,
};
