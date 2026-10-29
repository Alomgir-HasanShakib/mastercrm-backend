/**
 * @file rules-engine.routes.js
 * @description Express routing definitions for rules engine CRUD, testing, and context evaluation.
 */

const express = require('express');
const { authenticate } = require('../../middleware/auth');
const { setTenantContext } = require('../../middleware/tenancy');
const { checkPermission } = require('../../middleware/rbac');
const { validate } = require('../../middleware/validator');
const rulesEngineController = require('./rules-engine.controller');
const {
  idParamSchema,
  listRulesQuerySchema,
  createRuleSchema,
  updateRuleSchema,
  testRuleSchema,
  evaluateSchema,
} = require('./rules-engine.validation');

const router = express.Router();

router.use(authenticate, setTenantContext);

/**
 * @route GET /api/v1/rules-engine/evaluate
 * @desc Evaluate applicable rules for a context
 */
router.get(
  '/evaluate',
  rulesEngineController.evaluateRules
);

router.post(
  '/evaluate',
  validate(evaluateSchema, 'body'),
  rulesEngineController.evaluateRules
);

/**
 * @route GET /api/v1/rules-engine
 * @desc List rules
 */
router.get(
  '/',
  validate(listRulesQuerySchema, 'query'),
  rulesEngineController.listRules
);

/**
 * @route GET /api/v1/rules-engine/:id
 * @desc Get rule by ID
 */
router.get(
  '/:id',
  validate(idParamSchema, 'params'),
  rulesEngineController.getRuleById
);

/**
 * @route POST /api/v1/rules-engine
 * @desc Create rule
 */
router.post(
  '/',
  checkPermission('rules', 'create'),
  validate(createRuleSchema, 'body'),
  rulesEngineController.createRule
);

/**
 * @route PUT /api/v1/rules-engine/:id
 * @desc Update rule
 */
router.put(
  '/:id',
  checkPermission('rules', 'update'),
  validate(idParamSchema, 'params'),
  validate(updateRuleSchema, 'body'),
  rulesEngineController.updateRule
);

/**
 * @route DELETE /api/v1/rules-engine/:id
 * @desc Delete rule
 */
router.delete(
  '/:id',
  checkPermission('rules', 'delete'),
  validate(idParamSchema, 'params'),
  rulesEngineController.deleteRule
);

/**
 * @route POST /api/v1/rules-engine/:id/test
 * @desc Test rule against sample input
 */
router.post(
  '/:id/test',
  validate(idParamSchema, 'params'),
  validate(testRuleSchema, 'body'),
  rulesEngineController.testRule
);

module.exports = router;
