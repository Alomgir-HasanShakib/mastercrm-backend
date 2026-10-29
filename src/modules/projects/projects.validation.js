/**
 * @file projects.validation.js
 * @description Joi validation schemas for multi-vendor allocation and questionnaire binding.
 */

const Joi = require('joi');

const allocateLeadsSchema = Joi.object({
  vendorId: Joi.string().trim().allow(null, '').optional(),
  vendorIds: Joi.array().items(Joi.string().trim()).allow(null).optional(),
  reallocateAll: Joi.boolean().default(false),
  distributeRemainder: Joi.boolean().default(false),
  method: Joi.string().valid('EQUAL_SPLIT', 'PROPORTIONAL', 'EQUAL', 'SINGLE', 'SINGLE_VENDOR').default('EQUAL_SPLIT'),
});

const reallocateVendorLeadsSchema = Joi.object({
  fromVendorId: Joi.string().required(),
  toVendorId: Joi.string().required(),
  status: Joi.string().valid('ALL', 'PENDING', 'ASSIGNED', 'IN_PROGRESS').default('PENDING'),
});

const bindQuestionnaireSchema = Joi.object({
  questionnaireId: Joi.string().required(),
  module: Joi.string().valid('CATI', 'CAPI', 'SUPER_AUDIT', 'TVC', 'FA', 'EXAM').default('CATI'),
  isPrimary: Joi.boolean().default(true),
});

const createCampaignQuestionnaireSchema = Joi.object({
  name: Joi.string().trim().min(3).max(255).required(),
  module: Joi.string().valid('CATI', 'CAPI', 'SUPER_AUDIT', 'TVC', 'FA', 'EXAM').default('CATI'),
  status: Joi.string().valid('DRAFT', 'PUBLISHED').default('DRAFT'),
  description: Joi.string().allow('', null).optional(),
});

const surveyLeadSchema = Joi.object({
  responses: Joi.object().required(),
  disposition: Joi.string().allow('', null).optional(),
  dispositionNotes: Joi.string().allow('', null).optional(),
  notes: Joi.string().allow('', null).optional(),
  callDurationSec: Joi.number().integer().min(0).optional(),
  duration: Joi.number().optional(),
}).unknown(true);

module.exports = {
  allocateLeadsSchema,
  reallocateVendorLeadsSchema,
  bindQuestionnaireSchema,
  createCampaignQuestionnaireSchema,
  surveyLeadSchema,
};
