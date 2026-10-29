/**
 * @file client-db.validation.js
 * @description Joi validation schemas for Client DB sync endpoints.
 */

const Joi = require('joi');

const listConfigsSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  organizationId: Joi.string().uuid().optional(),
  dbType: Joi.string().valid('POSTGRES', 'MYSQL', 'REST_API').optional(),
  status: Joi.string().valid('IDLE', 'SYNCING', 'ERROR', 'SUCCESS').optional(),
  isActive: Joi.boolean().optional(),
});

const createConfigSchema = Joi.object({
  organizationId: Joi.string().uuid().optional(),
  name: Joi.string().trim().max(255).required().messages({
    'any.required': 'Sync configuration name is required',
  }),
  dbType: Joi.string().valid('POSTGRES', 'MYSQL', 'REST_API').default('REST_API'),
  connectionString: Joi.string().trim().allow(null, '').optional(),
  apiUrl: Joi.string().trim().allow(null, '').optional(),
  apiToken: Joi.string().trim().allow(null, '').optional(),
  syncInterval: Joi.string().valid('CONTINUOUS', '1_MIN', '5_MIN', '15_MIN', '1_HOUR').default('15_MIN'),
  isActive: Joi.boolean().default(true),
  mappingConfig: Joi.object().default({}),
});

const updateConfigSchema = Joi.object({
  name: Joi.string().trim().max(255).optional(),
  dbType: Joi.string().valid('POSTGRES', 'MYSQL', 'REST_API').optional(),
  connectionString: Joi.string().trim().allow(null, '').optional(),
  apiUrl: Joi.string().trim().allow(null, '').optional(),
  apiToken: Joi.string().trim().allow(null, '').optional(),
  syncInterval: Joi.string().valid('CONTINUOUS', '1_MIN', '5_MIN', '15_MIN', '1_HOUR').optional(),
  isActive: Joi.boolean().optional(),
  mappingConfig: Joi.object().optional(),
}).min(1);

const listLogsSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

const testConnectionSchema = Joi.object({
  configId: Joi.string().uuid().optional(),
  dbType: Joi.string().valid('POSTGRES', 'MYSQL', 'REST_API').default('POSTGRES'),
  host: Joi.string().trim().max(255).allow('', null).optional(),
  port: Joi.number().integer().min(1).max(65535).optional(),
  database: Joi.string().trim().max(255).allow('', null).optional(),
  user: Joi.string().trim().max(255).allow('', null).optional(),
  password: Joi.string().allow('', null).optional(),
  sslMode: Joi.string().trim().max(50).allow('', null).optional(),
  connectionString: Joi.string().trim().allow('', null).optional(),
});

const pullCampaignDataSchema = Joi.object({
  campaignId: Joi.string().uuid().optional(),
  projectId: Joi.string().uuid().optional(),
  tableName: Joi.string().trim().max(128).optional(),
  sqlQuery: Joi.string().trim().max(2000).allow('', null).optional(),
  limit: Joi.number().integer().min(1).max(50000).default(500),
});

const saveActiveConfigSchema = Joi.object({
  name: Joi.string().trim().max(255).default('Organization Database'),
  dbType: Joi.string().valid('POSTGRES', 'MYSQL', 'REST_API').default('POSTGRES'),
  host: Joi.string().trim().max(255).allow('', null).optional(),
  port: Joi.number().integer().min(1).max(65535).optional(),
  database: Joi.string().trim().max(255).allow('', null).optional(),
  user: Joi.string().trim().max(255).allow('', null).optional(),
  password: Joi.string().allow('', null).optional(),
  sslMode: Joi.string().trim().max(50).allow('', null).optional(),
  connectionString: Joi.string().trim().allow('', null).optional(),
  syncInterval: Joi.string().valid('CONTINUOUS', '1_MIN', '5_MIN', '15_MIN', '1_HOUR').default('15_MIN'),
  isActive: Joi.boolean().default(true),
  mappingConfig: Joi.object().optional(),
});

module.exports = {
  listConfigsSchema,
  createConfigSchema,
  updateConfigSchema,
  listLogsSchema,
  testConnectionSchema,
  pullCampaignDataSchema,
  saveActiveConfigSchema,
};
