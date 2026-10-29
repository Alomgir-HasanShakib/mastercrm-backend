/**
 * @file tenancy.validation.js
 * @description Joi validation schemas for multi-tenancy entities (Organizations, Clients, Vendors, Projects).
 */

const Joi = require('joi');

/**
 * Common pagination and filtering query schema.
 */
const listQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  sortBy: Joi.string().trim().default('created_at'),
  sortOrder: Joi.string().valid('asc', 'desc', 'ASC', 'DESC').default('desc'),
  search: Joi.string().trim().allow('').optional(),
  status: Joi.string().trim().optional(),
  organizationId: Joi.alternatives().try(Joi.number().integer(), Joi.string().uuid()).optional(),
  clientId: Joi.alternatives().try(Joi.number().integer(), Joi.string().uuid()).optional(),
});

/**
 * ID path parameter schema.
 */
const idParamSchema = Joi.object({
  id: Joi.alternatives().try(Joi.number().integer(), Joi.string().uuid(), Joi.string()).required(),
});

/**
 * Project vendor assignment path parameters schema.
 */
const projectVendorParamSchema = Joi.object({
  id: Joi.alternatives().try(Joi.number().integer(), Joi.string().uuid(), Joi.string()).required(),
  vendorId: Joi.alternatives().try(Joi.number().integer(), Joi.string().uuid(), Joi.string()).required(),
});

/**
 * Toggle / update status body schema.
 */
const toggleStatusSchema = Joi.object({
  status: Joi.string().valid('ACTIVE', 'INACTIVE').optional(),
  isActive: Joi.boolean().optional(),
}).or('status', 'isActive');

// --- Organizations ---

const createOrganizationSchema = Joi.object({
  name: Joi.string().trim().max(150).required().messages({
    'any.required': 'Organization name is required',
  }),
  code: Joi.string().trim().uppercase().max(50).required().messages({
    'any.required': 'Organization code is required',
  }),
  email: Joi.string().email().trim().lowercase().allow(null, '').optional(),
  adminEmail: Joi.string().email().trim().lowercase().allow(null, '').optional(),
  adminName: Joi.string().trim().allow(null, '').optional(),
  adminPassword: Joi.string().trim().min(6).allow(null, '').optional(),
  phone: Joi.string().trim().allow(null, '').optional(),
  domain: Joi.string().trim().allow(null, '').optional(),
  status: Joi.string().valid('ACTIVE', 'INACTIVE', 'SUSPENDED').default('ACTIVE'),
  maxUsers: Joi.number().integer().min(1).default(50).optional(),
  maxConcurrentSeats: Joi.number().integer().optional(),
  auditAiLicenses: Joi.number().integer().optional(),
  voiceAiLicenses: Joi.number().integer().optional(),
  validityStart: Joi.string().allow(null, '').optional(),
  validityEnd: Joi.string().allow(null, '').optional(),
  enableAiAudit: Joi.boolean().default(true).optional(),
  enabled_modules: Joi.array().items(Joi.string().trim()).optional(),
  enabledModules: Joi.array().items(Joi.string().trim()).optional(),
  settings: Joi.object().default({}),
}).unknown(true);

const updateOrganizationSchema = Joi.object({
  name: Joi.string().trim().max(150).optional(),
  code: Joi.string().trim().uppercase().max(50).optional(),
  email: Joi.string().email().trim().lowercase().allow(null, '').optional(),
  adminEmail: Joi.string().email().trim().lowercase().allow(null, '').optional(),
  adminName: Joi.string().trim().allow(null, '').optional(),
  phone: Joi.string().trim().allow(null, '').optional(),
  domain: Joi.string().trim().allow(null, '').optional(),
  status: Joi.string().valid('ACTIVE', 'INACTIVE', 'SUSPENDED').optional(),
  maxUsers: Joi.number().integer().min(1).optional(),
  maxConcurrentSeats: Joi.number().integer().optional(),
  auditAiLicenses: Joi.number().integer().optional(),
  voiceAiLicenses: Joi.number().integer().optional(),
  validityStart: Joi.string().allow(null, '').optional(),
  validityEnd: Joi.string().allow(null, '').optional(),
  enableAiAudit: Joi.boolean().optional(),
  enable_ai_audit: Joi.boolean().optional(),
  enabled_modules: Joi.array().items(Joi.string().trim()).optional(),
  enabledModules: Joi.array().items(Joi.string().trim()).optional(),
  settings: Joi.object().optional(),
}).min(1).unknown(true);

const updateOrganizationModulesSchema = Joi.object({
  enabled_modules: Joi.array().items(Joi.string().trim()).optional(),
  enabledModules: Joi.array().items(Joi.string().trim()).optional(),
  modules: Joi.array().items(Joi.string().trim()).optional(),
}).or('enabled_modules', 'enabledModules', 'modules').unknown(true);


// --- Clients ---

const createClientSchema = Joi.object({
  organizationId: Joi.alternatives().try(Joi.number().integer(), Joi.string().uuid()).optional(),
  name: Joi.string().trim().max(150).required().messages({
    'any.required': 'Client name is required',
  }),
  code: Joi.string().trim().uppercase().max(50).required().messages({
    'any.required': 'Client code is required',
  }),
  email: Joi.string().email().trim().allow(null, '').optional(),
  phone: Joi.string().trim().max(30).allow(null, '').optional(),
  address: Joi.string().trim().allow(null, '').optional(),
  status: Joi.string().valid('ACTIVE', 'INACTIVE').default('ACTIVE'),
  isActive: Joi.boolean().optional(),
});

const updateClientSchema = Joi.object({
  organizationId: Joi.alternatives().try(Joi.number().integer(), Joi.string().uuid()).optional(),
  name: Joi.string().trim().max(150).optional(),
  code: Joi.string().trim().uppercase().max(50).optional(),
  email: Joi.string().email().trim().allow(null, '').optional(),
  phone: Joi.string().trim().max(30).allow(null, '').optional(),
  address: Joi.string().trim().allow(null, '').optional(),
  status: Joi.string().valid('ACTIVE', 'INACTIVE').optional(),
  isActive: Joi.boolean().optional(),
}).min(1);

// --- Vendors ---

const createVendorSchema = Joi.object({
  organizationId: Joi.alternatives().try(Joi.number().integer(), Joi.string().uuid()).optional(),
  name: Joi.string().trim().max(150).required().messages({
    'any.required': 'Vendor name is required',
  }),
  code: Joi.string().trim().uppercase().max(50).required().messages({
    'any.required': 'Vendor code is required',
  }),
  email: Joi.string().email().trim().allow(null, '').optional(),
  phone: Joi.string().trim().max(30).allow(null, '').optional(),
  contactPerson: Joi.string().trim().max(100).allow(null, '').optional(),
  status: Joi.string().valid('ACTIVE', 'INACTIVE').default('ACTIVE'),
  enableAiAudit: Joi.boolean().default(true).optional(),
  isActive: Joi.boolean().optional(),
});

const updateVendorSchema = Joi.object({
  organizationId: Joi.alternatives().try(Joi.number().integer(), Joi.string().uuid()).optional(),
  name: Joi.string().trim().max(150).optional(),
  code: Joi.string().trim().uppercase().max(50).optional(),
  email: Joi.string().email().trim().allow(null, '').optional(),
  phone: Joi.string().trim().max(30).allow(null, '').optional(),
  contactPerson: Joi.string().trim().max(100).allow(null, '').optional(),
  status: Joi.string().valid('ACTIVE', 'INACTIVE').optional(),
  enableAiAudit: Joi.boolean().optional(),
  isActive: Joi.boolean().optional(),
}).min(1);

// --- Projects (Campaigns) ---

const createProjectSchema = Joi.object({
  organizationId: Joi.alternatives().try(Joi.number().integer(), Joi.string().uuid(), Joi.string()).allow(null, '').optional(),
  clientId: Joi.alternatives().try(Joi.number().integer(), Joi.string().uuid(), Joi.string()).allow(null, '').optional(),
  clientName: Joi.string().trim().allow(null, '').optional(),
  name: Joi.string().trim().max(150).required().messages({
    'any.required': 'Project name is required',
  }),
  code: Joi.string().trim().uppercase().max(50).allow(null, '').optional(),
  project_code: Joi.string().trim().uppercase().max(50).allow(null, '').optional(),
  client_table_name: Joi.string().trim().max(128).allow(null, '').optional(),
  input_table_name: Joi.string().trim().max(128).allow(null, '').optional(),
  output1_table_name: Joi.string().trim().max(128).allow(null, '').optional(),
  output2_table_name: Joi.string().trim().max(128).allow(null, '').optional(),
  schemaTemplateId: Joi.string().trim().allow(null, '').optional(),
  schemaConfig: Joi.object().allow(null).optional(),
  inputColumns: Joi.array().allow(null).optional(),
  output1Columns: Joi.array().allow(null).optional(),
  output2Columns: Joi.array().allow(null).optional(),
  rawSql: Joi.string().allow(null, '').optional(),
  questionnaireId: Joi.alternatives().try(Joi.string(), Joi.number()).allow(null, '').optional(),
  questionnaire_id: Joi.alternatives().try(Joi.string(), Joi.number()).allow(null, '').optional(),
  description: Joi.string().trim().allow(null, '').optional(),
  type: Joi.string().trim().max(50).default('SURVEY'),
  status: Joi.string().valid('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED').default('DRAFT'),
  languages: Joi.array().items(Joi.string()).optional(),
  enabled_modules: Joi.array().items(Joi.string()).optional(),
  campaign_types: Joi.array().items(Joi.string()).optional(),
  campaignTypes: Joi.array().items(Joi.string()).optional(),
  start_date: Joi.string().allow(null, '').optional(),
  end_date: Joi.string().allow(null, '').optional(),
  config: Joi.object().default({}),
}).unknown(true);

const updateProjectSchema = Joi.object({
  clientId: Joi.alternatives().try(Joi.number().integer(), Joi.string().uuid(), Joi.string()).allow(null, '').optional(),
  name: Joi.string().trim().max(150).optional(),
  code: Joi.string().trim().uppercase().max(50).allow(null, '').optional(),
  client_table_name: Joi.string().trim().max(128).allow(null, '').optional(),
  input_table_name: Joi.string().trim().max(128).allow(null, '').optional(),
  output1_table_name: Joi.string().trim().max(128).allow(null, '').optional(),
  output2_table_name: Joi.string().trim().max(128).allow(null, '').optional(),
  schemaTemplateId: Joi.string().trim().allow(null, '').optional(),
  schemaConfig: Joi.object().allow(null).optional(),
  inputColumns: Joi.array().allow(null).optional(),
  output1Columns: Joi.array().allow(null).optional(),
  output2Columns: Joi.array().allow(null).optional(),
  rawSql: Joi.string().allow(null, '').optional(),
  questionnaireId: Joi.alternatives().try(Joi.string(), Joi.number()).allow(null, '').optional(),
  questionnaire_id: Joi.alternatives().try(Joi.string(), Joi.number()).allow(null, '').optional(),
  description: Joi.string().trim().allow(null, '').optional(),
  type: Joi.string().trim().max(50).optional(),
  status: Joi.string().valid('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED').optional(),
  config: Joi.object().optional(),
}).min(1).unknown(true);

const projectStatusSchema = Joi.object({
  status: Joi.string().valid('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED').required().messages({
    'any.required': 'Project status is required',
  }),
});

const assignProjectVendorSchema = Joi.object({
  vendorId: Joi.alternatives().try(Joi.number().integer(), Joi.string().uuid()).required().messages({
    'any.required': 'Vendor ID is required',
  }),
  status: Joi.string().valid('ACTIVE', 'INACTIVE').default('ACTIVE'),
});

const projectModulesSchema = Joi.object({
  modules: Joi.array().items(Joi.string().trim()).required().messages({
    'any.required': 'Modules list is required',
  }),
});

const projectLanguagesSchema = Joi.object({
  languages: Joi.array()
    .items(
      Joi.object({
        languageCode: Joi.string().trim().max(10).required(),
        languageName: Joi.string().trim().max(100).required(),
        isDefault: Joi.boolean().default(false),
        isActive: Joi.boolean().default(true),
      })
    )
    .min(1)
    .required()
    .messages({
      'any.required': 'At least one language configuration is required',
    }),
});

module.exports = {
  listQuerySchema,
  idParamSchema,
  projectVendorParamSchema,
  toggleStatusSchema,
  createOrganizationSchema,
  updateOrganizationSchema,
  updateOrganizationModulesSchema,
  createClientSchema,
  updateClientSchema,
  createVendorSchema,
  updateVendorSchema,
  createProjectSchema,
  updateProjectSchema,
  projectStatusSchema,
  assignProjectVendorSchema,
  projectModulesSchema,
  projectLanguagesSchema,
};
