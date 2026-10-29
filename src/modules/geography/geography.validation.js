/**
 * @file geography.validation.js
 * @description Joi validation schemas for Geography queries, tree hierarchy requests, and Excel upload metadata.
 */

const Joi = require('joi');

const hierarchyTreeQuerySchema = Joi.object({
  projectId: Joi.string().uuid().optional(),
  versionId: Joi.string().uuid().optional(),
  search: Joi.string().max(100).optional().allow(''),
});

const dependentAcsQuerySchema = Joi.object({
  pcCode: Joi.string().max(64).optional().allow(''),
  stateCode: Joi.string().max(32).optional().allow(''),
  versionId: Joi.string().uuid().optional(),
});

const pcsQuerySchema = Joi.object({
  stateCode: Joi.string().max(32).required(),
  versionId: Joi.string().uuid().optional(),
});

const sepsQuerySchema = Joi.object({
  acCode: Joi.string().max(64).required(),
  versionId: Joi.string().uuid().optional(),
});

const importMetadataSchema = Joi.object({
  versionName: Joi.string().max(255).optional(),
  description: Joi.string().max(1000).optional().allow(''),
  projectId: Joi.string().uuid().optional().allow(null, ''),
});

module.exports = {
  hierarchyTreeQuerySchema,
  dependentAcsQuerySchema,
  pcsQuerySchema,
  sepsQuerySchema,
  importMetadataSchema,
};
