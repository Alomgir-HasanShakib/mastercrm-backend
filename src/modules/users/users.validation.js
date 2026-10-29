/**
 * @file users.validation.js
 * @description Joi schemas for validating user management requests.
 */

const Joi = require('joi');

/**
 * Validation schema for listing users with query parameters.
 */
const listUsersSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  sortBy: Joi.string().valid('created_at', 'email', 'first_name', 'last_name', 'status', 'id').default('created_at'),
  sortOrder: Joi.string().valid('asc', 'desc', 'ASC', 'DESC').default('desc'),
  search: Joi.string().trim().allow('').optional(),
  roleId: Joi.alternatives().try(Joi.number().integer(), Joi.string().uuid()).optional(),
  vendorId: Joi.alternatives().try(Joi.number().integer(), Joi.string().uuid()).optional(),
  status: Joi.string().valid('ACTIVE', 'INACTIVE', 'SUSPENDED').optional(),
  projectId: Joi.alternatives().try(Joi.number().integer(), Joi.string().uuid()).optional(),
  organizationId: Joi.alternatives().try(Joi.number().integer(), Joi.string().uuid()).optional(),
});

/**
 * Validation schema for creating a new user.
 */
const createUserSchema = Joi.object({
  email: Joi.string().email().trim().lowercase().required().messages({
    'string.email': 'A valid email address is required',
    'any.required': 'Email is required',
  }),
  password: Joi.string().min(8).default('Password123!').optional(),
  firstName: Joi.string().trim().max(100).required().messages({
    'any.required': 'First name is required',
  }),
  lastName: Joi.string().trim().max(100).required().messages({
    'any.required': 'Last name is required',
  }),
  phone: Joi.string().trim().allow(null, '').optional(),
  roleId: Joi.alternatives().try(Joi.number().integer(), Joi.string().uuid(), Joi.string()).optional(),
  role: Joi.string().optional(),
  roleSlug: Joi.string().optional(),
  vendorId: Joi.alternatives().try(Joi.number().integer(), Joi.string().uuid(), Joi.string()).allow(null).optional(),
  organizationId: Joi.alternatives().try(Joi.number().integer(), Joi.string().uuid(), Joi.string()).optional(),
  status: Joi.string().valid('ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING_APPROVAL').default('ACTIVE'),
  userCode: Joi.string().allow(null, '').optional(),
  user_code: Joi.string().allow(null, '').optional(),
  language: Joi.string().allow(null, '').optional(),
  validityStart: Joi.string().allow(null, '').optional(),
  validity_start: Joi.string().allow(null, '').optional(),
  validityEnd: Joi.string().allow(null, '').optional(),
  validity_end: Joi.string().allow(null, '').optional(),
  isLifetime: Joi.boolean().allow(null).optional(),
  is_lifetime: Joi.boolean().allow(null).optional(),
  voiceKycStatus: Joi.string().valid('ENROLLED', 'PENDING', 'QUARANTINED').optional(),
  voice_kyc_status: Joi.string().valid('ENROLLED', 'PENDING', 'QUARANTINED').optional(),
  campaignAssignments: Joi.array().optional(),
  documents: Joi.array().optional(),
  moduleSetup: Joi.object().optional(),
}).unknown(true);

/**
 * Validation schema for updating user details.
 */
const updateUserSchema = Joi.object({
  firstName: Joi.string().trim().max(100).optional(),
  lastName: Joi.string().trim().max(100).optional(),
  phone: Joi.string().trim().allow(null, '').optional(),
  roleId: Joi.alternatives().try(Joi.number().integer(), Joi.string().uuid(), Joi.string()).optional(),
  role: Joi.string().optional(),
  roleSlug: Joi.string().optional(),
  vendorId: Joi.alternatives().try(Joi.number().integer(), Joi.string().uuid(), Joi.string()).allow(null).optional(),
  organizationId: Joi.alternatives().try(Joi.number().integer(), Joi.string().uuid(), Joi.string()).optional(),
  status: Joi.string().valid('ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING_APPROVAL').optional(),
  language: Joi.string().allow(null, '').optional(),
  validityStart: Joi.string().allow(null, '').optional(),
  validity_start: Joi.string().allow(null, '').optional(),
  validityEnd: Joi.string().allow(null, '').optional(),
  validity_end: Joi.string().allow(null, '').optional(),
  isLifetime: Joi.boolean().allow(null).optional(),
  is_lifetime: Joi.boolean().allow(null).optional(),
  voiceKycStatus: Joi.string().valid('ENROLLED', 'PENDING', 'QUARANTINED').optional(),
  voice_kyc_status: Joi.string().valid('ENROLLED', 'PENDING', 'QUARANTINED').optional(),
}).min(1).unknown(true);

/**
 * Validation schema for updating user status.
 */
const statusSchema = Joi.object({
  status: Joi.string().valid('ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING_APPROVAL').required().messages({
    'any.required': 'Status is required and must be ACTIVE, INACTIVE, SUSPENDED, or PENDING_APPROVAL',
  }),
});

/**
 * Validation schema for assigning user to a project.
 */
const assignmentSchema = Joi.object({
  projectId: Joi.alternatives().try(Joi.number().integer(), Joi.string().uuid()).required().messages({
    'any.required': 'Project ID is required',
  }),
  assignedModules: Joi.array().items(Joi.string().trim()).default([]),
  assignedStates: Joi.array().items(Joi.string().trim()).default([]),
});

/**
 * Schema for ID param validation.
 */
const idParamSchema = Joi.object({
  id: Joi.alternatives().try(Joi.number().integer(), Joi.string().uuid(), Joi.string()).required(),
});

/**
 * Schema for assignment ID param validation.
 */
const assignmentParamSchema = Joi.object({
  id: Joi.alternatives().try(Joi.number().integer(), Joi.string().uuid(), Joi.string()).required(),
  assignmentId: Joi.alternatives().try(Joi.number().integer(), Joi.string().uuid(), Joi.string()).required(),
});

module.exports = {
  listUsersSchema,
  createUserSchema,
  updateUserSchema,
  statusSchema,
  assignmentSchema,
  idParamSchema,
  assignmentParamSchema,
};
