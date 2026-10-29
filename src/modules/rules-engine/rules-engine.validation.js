/**
 * @file rules-engine.validation.js
 * @description Joi validation schemas for creating, updating, testing, and evaluating rules.
 */

const Joi = require('joi');

const idParamSchema = Joi.object({
  id: Joi.string().uuid().required(),
});

const listRulesQuerySchema = Joi.object({
  projectId: Joi.string().uuid().optional(),
  module: Joi.string().valid('CATI', 'CAPI', 'SUPER_AUDIT', 'TVC', 'FA', 'EXAM').optional(),
  scope: Joi.string().valid('QUESTION', 'SECTION', 'SUBMISSION', 'ROUTING').optional(),
  isEnabled: Joi.boolean().optional(),
});

// AST Clause Condition schema
const conditionAstSchema = Joi.alternatives().try(
  Joi.object({
    and: Joi.array().items(Joi.link('#conditionGroup')).min(1),
  }),
  Joi.object({
    or: Joi.array().items(Joi.link('#conditionGroup')).min(1),
  }),
  Joi.object({
    not: Joi.link('#conditionGroup'),
  }),
  Joi.object({
    source: Joi.string().valid('QUESTION', 'TAG', 'CONTEXT').required(),
    field: Joi.string().required(),
    operator: Joi.string().valid(
      'EQ',
      'NE',
      'GT',
      'GTE',
      'LT',
      'LTE',
      'IN',
      'NOT_IN',
      'CONTAINS',
      'EMPTY',
      'NOT_EMPTY'
    ).required(),
    value: Joi.any().optional(),
  })
).id('conditionGroup');

const actionItemSchema = Joi.object({
  action: Joi.string().valid(
    'SHOW',
    'HIDE',
    'ENABLE',
    'DISABLE',
    'SKIP_TO',
    'TERMINATE',
    'SET_VALUE',
    'SET_REQUIRED',
    'FLAG_RISK',
    'ROUTE_TO'
  ).required(),
  target: Joi.string().required(),
  value: Joi.any().optional(),
});

const createRuleSchema = Joi.object({
  projectId: Joi.string().uuid().required(),
  module: Joi.string().valid('CATI', 'CAPI', 'SUPER_AUDIT', 'TVC', 'FA', 'EXAM').required(),
  scope: Joi.string().valid('QUESTION', 'SECTION', 'SUBMISSION', 'ROUTING').required(),
  ruleCode: Joi.string().max(100).required(),
  conditionAst: conditionAstSchema.required(),
  actions: Joi.array().items(actionItemSchema).min(1).required(),
  priority: Joi.number().integer().min(0).default(0),
  isEnabled: Joi.boolean().default(true),
  effectiveFrom: Joi.date().iso().allow(null).optional(),
  effectiveTo: Joi.date().iso().allow(null).optional(),
});

const updateRuleSchema = Joi.object({
  scope: Joi.string().valid('QUESTION', 'SECTION', 'SUBMISSION', 'ROUTING').optional(),
  ruleCode: Joi.string().max(100).optional(),
  conditionAst: conditionAstSchema.optional(),
  actions: Joi.array().items(actionItemSchema).min(1).optional(),
  priority: Joi.number().integer().min(0).optional(),
  isEnabled: Joi.boolean().optional(),
  effectiveFrom: Joi.date().iso().allow(null).optional(),
  effectiveTo: Joi.date().iso().allow(null).optional(),
}).min(1);

const testRuleSchema = Joi.object({
  sampleInput: Joi.object().required(),
});

const evaluateSchema = Joi.object({
  projectId: Joi.string().uuid().required(),
  module: Joi.string().valid('CATI', 'CAPI', 'SUPER_AUDIT', 'TVC', 'FA', 'EXAM').required(),
  questionnaireVersionId: Joi.string().uuid().optional(),
  context: Joi.object().required(), // { answers: { [tag]: val }, tags: {}, context: {} }
});

module.exports = {
  idParamSchema,
  listRulesQuerySchema,
  createRuleSchema,
  updateRuleSchema,
  testRuleSchema,
  evaluateSchema,
};
