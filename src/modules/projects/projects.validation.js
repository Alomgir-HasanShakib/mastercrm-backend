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
  module: Joi.string().valid('CAPI', 'CATI', 'SUPER_AUDIT', 'AI_AUDIT', 'AUDIT', 'TVC', 'FA').default('CAPI'),
  isPrimary: Joi.boolean().default(true),
}).unknown(true);

const createCampaignQuestionnaireSchema = Joi.object({
  name: Joi.string().trim().min(1).max(255).required(),
  module: Joi.string().valid('CAPI', 'CATI', 'SUPER_AUDIT', 'AI_AUDIT', 'AUDIT', 'TVC', 'FA').default('CAPI'),
  status: Joi.string().valid('DRAFT', 'PUBLISHED').default('DRAFT'),
  description: Joi.string().allow('', null).optional(),
}).unknown(true);

const surveyLeadSchema = Joi.object({
  responses: Joi.object().required(),
  disposition: Joi.string().allow('', null).optional(),
  dispositionNotes: Joi.string().allow('', null).optional(),
  notes: Joi.string().allow('', null).optional(),
  callDurationSec: Joi.number().integer().min(0).optional(),
  duration: Joi.number().optional(),
}).unknown(true);

const assignProjectCodeSchema = Joi.object({
  projectCode: Joi.string().trim().required(),
  vendorId: Joi.string().trim().required(),
  options: Joi.object().optional(),
});

module.exports = {
  allocateLeadsSchema,
  reallocateVendorLeadsSchema,
  bindQuestionnaireSchema,
  createCampaignQuestionnaireSchema,
  surveyLeadSchema,
  assignProjectCodeSchema,
};
