/**
 * @file rules-engine.controller.js
 * @description Controller handling incoming HTTP requests for the rules engine module.
 */

const { success } = require('../../utils/response');
const rulesEngineService = require('./rules-engine.service');
const { auditLog } = require('../../services/auditLog');

const rulesEngineController = {
  async listRules(req, res, next) {
    try {
      const filters = {
        projectId: req.query.projectId,
        module: req.query.module,
        scope: req.query.scope,
        isEnabled: req.query.isEnabled !== undefined ? req.query.isEnabled === 'true' : undefined,
      };

      const rules = await rulesEngineService.listRules(filters);
      return success(res, rules, 'Rules retrieved successfully');
    } catch (err) {
      return next(err);
    }
  },

  async getRuleById(req, res, next) {
    try {
      const rule = await rulesEngineService.getRuleById(req.params.id);
      return success(res, rule, 'Rule retrieved successfully');
    } catch (err) {
      return next(err);
    }
  },

  async createRule(req, res, next) {
    try {
      const rule = await rulesEngineService.createRule(req.body, req.user?.id);

      await auditLog({
        userId: req.user?.id,
        organizationId: req.user?.organization_id,
        action: 'RULE_CREATE',
        resource: 'rule_definitions',
        resourceId: rule.id,
        details: { ruleCode: rule.rule_code, projectId: rule.project_id },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return success(res, rule, 'Rule definition created successfully', 201);
    } catch (err) {
      return next(err);
    }
  },

  async updateRule(req, res, next) {
    try {
      const updated = await rulesEngineService.updateRule(req.params.id, req.body);

      await auditLog({
        userId: req.user?.id,
        organizationId: req.user?.organization_id,
        action: 'RULE_UPDATE',
        resource: 'rule_definitions',
        resourceId: req.params.id,
        details: { changes: req.body },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return success(res, updated, 'Rule definition updated successfully');
    } catch (err) {
      return next(err);
    }
  },

  async deleteRule(req, res, next) {
    try {
      await rulesEngineService.deleteRule(req.params.id);

      await auditLog({
        userId: req.user?.id,
        organizationId: req.user?.organization_id,
        action: 'RULE_DELETE',
        resource: 'rule_definitions',
        resourceId: req.params.id,
        details: {},
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return success(res, null, 'Rule definition deleted successfully');
    } catch (err) {
      return next(err);
    }
  },

  async testRule(req, res, next) {
    try {
      const result = await rulesEngineService.testRule(req.params.id, req.body.sampleInput);
      return success(res, result, 'Rule evaluated against sample input');
    } catch (err) {
      return next(err);
    }
  },

  async evaluateRules(req, res, next) {
    try {
      // Support both GET query (if encoded) and POST body context
      const payload = {
        projectId: req.query.projectId || req.body.projectId,
        module: req.query.module || req.body.module,
        questionnaireVersionId: req.query.questionnaireVersionId || req.body.questionnaireVersionId,
        context: req.body.context || (req.query.context ? JSON.parse(req.query.context) : {}),
      };

      const result = await rulesEngineService.evaluateRules(payload);
      return success(res, result, 'Rules evaluated successfully for context');
    } catch (err) {
      return next(err);
    }
  },
};

module.exports = rulesEngineController;
