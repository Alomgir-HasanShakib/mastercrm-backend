/**
 * @file audit-log.validation.js
 * @description Joi validation schemas for audit-log module.
 */

const Joi = require('joi');

const listAuditLogsSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(1000).default(25),
  organizationId: Joi.string().uuid().allow('', null).optional(),
  userId: Joi.string().allow('', null).optional(),
  action: Joi.string().max(100).allow('', null).optional(),
  entityType: Joi.string().max(100).allow('', null).optional(),
  entityId: Joi.string().max(100).allow('', null).optional(),
  module: Joi.string().max(100).allow('', null).optional(),
  dateFrom: Joi.string().allow('', null).optional(),
  dateTo: Joi.string().allow('', null).optional(),
  search: Joi.string().max(255).allow('', null).optional(),
  q: Joi.string().max(255).allow('', null).optional(),
  sortBy: Joi.string().valid('created_at', 'action', 'module').default('created_at'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
});

const entityHistoryParamsSchema = Joi.object({
  entityType: Joi.string().max(100).required(),
  entityId: Joi.string().max(100).required(),
});

module.exports = {
  listAuditLogsSchema,
  entityHistoryParamsSchema,
};
