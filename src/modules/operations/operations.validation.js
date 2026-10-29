/**
 * @file operations.validation.js
 * @description Joi validation schemas for operational control panel and rechain engine.
 */

const Joi = require('joi');

const rechainSchema = Joi.object({
  targetDate: Joi.string()
    .pattern(/^\d{4}-\d{2}-\d{2}$/)
    .allow(null, '')
    .optional()
    .description('Target date in YYYY-MM-DD format (e.g. 2026-10-05)'),
  rechainAll: Joi.boolean()
    .default(false)
    .description('If true, processes incomplete records across all dates'),
  module: Joi.string()
    .valid('ALL', 'CATI', 'CAPI', 'TVC', 'SUPER_AUDIT', 'FA')
    .default('ALL')
    .description('Target module to rechain'),
  clearOrphanedOutputs: Joi.boolean()
    .default(true)
    .description('Whether to clear incomplete partial answers/responses so data re-assigns cleanly'),
  reason: Joi.string()
    .max(500)
    .allow('', null)
    .optional()
    .description('Operational audit justification note'),
  projectId: Joi.string().uuid().allow(null, '').optional(),
  vendorId: Joi.string().uuid().allow(null, '').optional(),
});

const previewQuerySchema = Joi.object({
  targetDate: Joi.string()
    .pattern(/^\d{4}-\d{2}-\d{2}$/)
    .allow(null, '')
    .optional(),
  rechainAll: Joi.alternatives().try(Joi.boolean(), Joi.string().valid('true', 'false')).default(false),
  module: Joi.string().valid('ALL', 'CATI', 'CAPI', 'TVC', 'SUPER_AUDIT', 'FA').default('ALL'),
  projectId: Joi.string().uuid().allow(null, '').optional(),
  vendorId: Joi.string().uuid().allow(null, '').optional(),
});

module.exports = {
  rechainSchema,
  previewQuerySchema,
};
