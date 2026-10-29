/**
 * @file reports.validation.js
 * @description Joi validation schemas for report query parameters, filters, pagination, and export requests.
 */

const Joi = require('joi');

const commonFilterSchema = Joi.object({
  clientId: Joi.string().uuid().allow(null, '').optional(),
  vendorId: Joi.string().uuid().allow(null, '').optional(),
  projectId: Joi.string().uuid().allow(null, '').optional(),
  stateId: Joi.alternatives().try(Joi.string(), Joi.number()).allow(null, '').optional(),
  userId: Joi.string().uuid().allow(null, '').optional(),
  agentId: Joi.string().uuid().allow(null, '').optional(),
  sourceChannel: Joi.string().max(50).allow(null, '').optional(),
  status: Joi.string().max(50).allow(null, '').optional(),
  disposition: Joi.string().max(100).allow(null, '').optional(),
  dateFrom: Joi.date().iso().allow(null, '').optional(),
  dateTo: Joi.date().iso().allow(null, '').optional(),
  page: Joi.number().integer().min(1).default(1).optional(),
  limit: Joi.number().integer().min(1).max(500).default(20).optional(),
  sortBy: Joi.string().max(50).allow(null, '').optional(),
  sortOrder: Joi.string().valid('asc', 'desc', 'ASC', 'DESC').default('desc').optional(),
  interval: Joi.string().valid('day', 'week', 'month', 'hour').default('day').optional(),
  search: Joi.string().max(100).allow('', null).optional(),
});

const exportSchema = Joi.object({
  reportType: Joi.string()
    .valid(
      'cati_production',
      'cati_apr',
      'capi_production',
      'capi_apr',
      'super_audit_production',
      'super_audit_apr',
      'tvc_cpr',
      'tvc_apr',
      'fa_cdr',
      'fa_apr',
      'unified_apr'
    )
    .required(),
  format: Joi.string().valid('csv', 'xlsx').default('xlsx').optional(),
  filters: Joi.object({
    clientId: Joi.string().uuid().allow(null, '').optional(),
    vendorId: Joi.string().uuid().allow(null, '').optional(),
    projectId: Joi.string().uuid().allow(null, '').optional(),
    stateId: Joi.alternatives().try(Joi.string(), Joi.number()).allow(null, '').optional(),
    userId: Joi.string().uuid().allow(null, '').optional(),
    agentId: Joi.string().uuid().allow(null, '').optional(),
    sourceChannel: Joi.string().max(50).allow(null, '').optional(),
    status: Joi.string().max(50).allow(null, '').optional(),
    disposition: Joi.string().max(100).allow(null, '').optional(),
    dateFrom: Joi.date().iso().allow(null, '').optional(),
    dateTo: Joi.date().iso().allow(null, '').optional(),
    search: Joi.string().max(100).allow('', null).optional(),
  }).default({}).optional(),
});

module.exports = {
  commonFilterSchema,
  exportSchema,
};
