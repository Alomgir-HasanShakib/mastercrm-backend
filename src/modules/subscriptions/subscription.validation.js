/**
 * @file subscription.validation.js
 * @description Joi validation schemas for subscription routes and payloads.
 */

const Joi = require('joi');

const listSubscriptionsSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  organizationId: Joi.string().uuid().optional(),
  status: Joi.string().valid('ACTIVE', 'EXPIRED', 'PENDING', 'SUSPENDED').optional(),
  planName: Joi.string().trim().optional(),
  search: Joi.string().trim().allow('').optional(),
});

const createSubscriptionSchema = Joi.object({
  organizationId: Joi.string().uuid().optional(),
  planName: Joi.string().trim().uppercase().default('ENTERPRISE'),
  billingCycle: Joi.string().valid('MONTHLY', 'ANNUAL').default('MONTHLY'),
  hasAiAudit: Joi.boolean().default(true),
  currency: Joi.string().trim().uppercase().max(10).optional(),
  basePrice: Joi.number().positive().optional(),
  aiAuditPrice: Joi.number().min(0).optional(),
  paymentMethod: Joi.string().trim().default('CREDIT_CARD'),
  autoRenew: Joi.boolean().default(true),
});

const updatePricingSchema = Joi.object({
  basePrice: Joi.number().positive().optional(),
  aiAuditPrice: Joi.number().min(0).optional(),
  currency: Joi.string().trim().uppercase().max(10).optional(),
}).min(1);

const listInvoicesSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  organizationId: Joi.string().uuid().optional(),
  paymentStatus: Joi.string().valid('PAID', 'PENDING').optional(),
  search: Joi.string().trim().allow('').optional(),
});

module.exports = {
  listSubscriptionsSchema,
  createSubscriptionSchema,
  updatePricingSchema,
  listInvoicesSchema,
};
