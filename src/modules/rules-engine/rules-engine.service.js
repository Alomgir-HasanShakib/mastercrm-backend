/**
 * @file rules-engine.service.js
 * @description Business logic layer for rules engine: AST evaluation, recursive tree parser, dependency validation, and runtime execution.
 */

const { NotFoundError, ConflictError, ValidationError } = require('../../utils/errors');
const rulesEngineModel = require('./rules-engine.model');

const rulesEngineService = {
  /**
   * List rules with optional filters
   * @param {object} filters
   * @returns {Promise<Array<object>>}
   */
  async listRules(filters = {}) {
    return rulesEngineModel.findRules(filters);
  },

  /**
   * Get single rule by ID
   * @param {string} id
   * @returns {Promise<object>}
   */
  async getRuleById(id) {
    const rule = await rulesEngineModel.findRuleById(id);
    if (!rule) {
      throw new NotFoundError(`Rule with ID '${id}' not found`);
    }
    return rule;
  },

  /**
   * Create a new rule definition
   * @param {object} data
   * @param {string} userId
   * @returns {Promise<object>}
   */
  async createRule(data, userId) {
    const existing = await rulesEngineModel.findRuleByCode(data.projectId, data.ruleCode);
    if (existing) {
      throw new ConflictError(`Rule with code '${data.ruleCode}' already exists for this project.`);
    }

    this.validateAstIntegrity(data.conditionAst);

    const payload = {
      project_id: data.projectId,
      module: data.module,
      scope: data.scope,
      rule_code: data.ruleCode,
      condition_ast: data.conditionAst,
      actions: JSON.stringify(data.actions),
      priority: data.priority !== undefined ? data.priority : 0,
      is_enabled: data.isEnabled !== undefined ? data.isEnabled : true,
      effective_from: data.effectiveFrom || null,
      effective_to: data.effectiveTo || null,
      created_by: userId || null,
    };

    return rulesEngineModel.createRule(payload);
  },

  /**
   * Update an existing rule definition
   * @param {string} id
   * @param {object} data
   * @returns {Promise<object>}
   */
  async updateRule(id, data) {
    const rule = await this.getRuleById(id);

    if (data.ruleCode && data.ruleCode !== rule.rule_code) {
      const existing = await rulesEngineModel.findRuleByCode(rule.project_id, data.ruleCode);
      if (existing && existing.id !== id) {
        throw new ConflictError(`Rule with code '${data.ruleCode}' already exists in this project.`);
      }
    }

    if (data.conditionAst) {
      this.validateAstIntegrity(data.conditionAst);
    }

    const payload = {};
    if (data.scope !== undefined) payload.scope = data.scope;
    if (data.ruleCode !== undefined) payload.rule_code = data.ruleCode;
    if (data.conditionAst !== undefined) payload.condition_ast = data.conditionAst;
    if (data.actions !== undefined) payload.actions = JSON.stringify(data.actions);
    if (data.priority !== undefined) payload.priority = data.priority;
    if (data.isEnabled !== undefined) payload.is_enabled = data.isEnabled;
    if (data.effectiveFrom !== undefined) payload.effective_from = data.effectiveFrom;
    if (data.effectiveTo !== undefined) payload.effective_to = data.effectiveTo;

    return rulesEngineModel.updateRule(id, payload);
  },

  /**
   * Delete a rule definition
   * @param {string} id
   * @returns {Promise<void>}
   */
  async deleteRule(id) {
    await this.getRuleById(id);
    await rulesEngineModel.deleteRule(id);
  },

  /**
   * Validates AST tree structure recursively
   * @param {object} ast
   */
  validateAstIntegrity(ast) {
    if (!ast || typeof ast !== 'object') {
      throw new ValidationError('Invalid Condition AST: must be a non-null object.');
    }

    if (ast.and) {
      if (!Array.isArray(ast.and) || ast.and.length === 0) {
        throw new ValidationError("Invalid AST: 'and' group must be a non-empty array.");
      }
      ast.and.forEach((child) => this.validateAstIntegrity(child));
      return;
    }

    if (ast.or) {
      if (!Array.isArray(ast.or) || ast.or.length === 0) {
        throw new ValidationError("Invalid AST: 'or' group must be a non-empty array.");
      }
      ast.or.forEach((child) => this.validateAstIntegrity(child));
      return;
    }

    if (ast.not) {
      this.validateAstIntegrity(ast.not);
      return;
    }

    // Leaf clause
    if (!ast.source || !ast.field || !ast.operator) {
      throw new ValidationError("Invalid AST leaf node: must contain 'source', 'field', and 'operator'.");
    }
  },

  /**
   * Resolves field value from context based on source
   * @param {string} source - 'QUESTION' | 'TAG' | 'CONTEXT'
   * @param {string} field - tag or key
   * @param {object} context - { answers, tags, context, respondent, ... }
   * @returns {any}
   */
  resolveSourceValue(source, field, context = {}) {
    if (!context) return undefined;

    switch (source) {
      case 'QUESTION': {
        const answers = context.answers || context.responses || context;
        return answers[field];
      }
      case 'TAG': {
        const tags = context.tags || {};
        return tags[field] !== undefined ? tags[field] : (context[field]);
      }
      case 'CONTEXT': {
        const ctx = context.context || context;
        return ctx[field];
      }
      default:
        return context[field];
    }
  },

  /**
   * Evaluates comparison operator
   * @param {string} operator
   * @param {any} actual
   * @param {any} expected
   * @returns {boolean}
   */
  evaluateOperator(operator, actual, expected) {
    switch (operator) {
      case 'EQ':
        return String(actual).toLowerCase() === String(expected).toLowerCase();
      case 'NE':
        return String(actual).toLowerCase() !== String(expected).toLowerCase();
      case 'GT':
        return Number(actual) > Number(expected);
      case 'GTE':
        return Number(actual) >= Number(expected);
      case 'LT':
        return Number(actual) < Number(expected);
      case 'LTE':
        return Number(actual) <= Number(expected);
      case 'IN': {
        const list = Array.isArray(expected) ? expected : [expected];
        const stringList = list.map((item) => String(item).toLowerCase());
        return stringList.includes(String(actual).toLowerCase());
      }
      case 'NOT_IN': {
        const list = Array.isArray(expected) ? expected : [expected];
        const stringList = list.map((item) => String(item).toLowerCase());
        return !stringList.includes(String(actual).toLowerCase());
      }
      case 'CONTAINS': {
        if (Array.isArray(actual)) {
          return actual.some((item) => String(item).toLowerCase() === String(expected).toLowerCase());
        }
        return String(actual || '').toLowerCase().includes(String(expected || '').toLowerCase());
      }
      case 'EMPTY':
        return actual === null || actual === undefined || actual === '' || (Array.isArray(actual) && actual.length === 0);
      case 'NOT_EMPTY':
        return actual !== null && actual !== undefined && actual !== '' && (!Array.isArray(actual) || actual.length > 0);
      default:
        return false;
    }
  },

  /**
   * Recursively evaluates condition AST against context
   * @param {object} ast
   * @param {object} context
   * @returns {{ result: boolean, details: Array<object> }}
   */
  evaluateConditionAst(ast, context) {
    if (!ast || typeof ast !== 'object') {
      return { result: true, details: [] };
    }

    if (ast.and) {
      const childDetails = [];
      let allTrue = true;
      for (const child of ast.and) {
        const res = this.evaluateConditionAst(child, context);
        childDetails.push(res);
        if (!res.result) {
          allTrue = false;
        }
      }
      return {
        result: allTrue,
        type: 'AND',
        children: childDetails,
      };
    }

    if (ast.or) {
      const childDetails = [];
      let anyTrue = false;
      for (const child of ast.or) {
        const res = this.evaluateConditionAst(child, context);
        childDetails.push(res);
        if (res.result) {
          anyTrue = true;
        }
      }
      return {
        result: anyTrue,
        type: 'OR',
        children: childDetails,
      };
    }

    if (ast.not) {
      const childRes = this.evaluateConditionAst(ast.not, context);
      return {
        result: !childRes.result,
        type: 'NOT',
        child: childRes,
      };
    }

    // Leaf clause
    const actualValue = this.resolveSourceValue(ast.source, ast.field, context);
    const passed = this.evaluateOperator(ast.operator, actualValue, ast.value);

    return {
      result: passed,
      clause: {
        source: ast.source,
        field: ast.field,
        operator: ast.operator,
        expectedValue: ast.value,
        actualValue,
      },
    };
  },

  /**
   * Tests a single rule against sample input
   * @param {string} ruleId
   * @param {object} sampleInput
   * @returns {Promise<object>}
   */
  async testRule(ruleId, sampleInput) {
    const rule = await this.getRuleById(ruleId);
    const evaluation = this.evaluateConditionAst(rule.condition_ast, sampleInput);

    const rawActions = typeof rule.actions === 'string' ? JSON.parse(rule.actions) : rule.actions;
    const triggeredActions = evaluation.result ? rawActions : [];

    return {
      ruleId: rule.id,
      ruleCode: rule.rule_code,
      matched: evaluation.result,
      evaluationTree: evaluation,
      triggeredActions,
    };
  },

  /**
   * Evaluates all applicable rules for a project/module context
   * @param {object} params - { projectId, module, questionnaireVersionId, context }
   * @returns {Promise<object>}
   */
  async evaluateRules({ projectId, module, questionnaireVersionId, context }) {
    const rules = await rulesEngineModel.findApplicableRules(projectId, module);

    const matchedRules = [];
    const aggregatedActions = [];
    const visibilityMap = {}; // target -> SHOW | HIDE
    let terminationTriggered = false;
    let skipToTarget = null;

    for (const rule of rules) {
      const evaluation = this.evaluateConditionAst(rule.condition_ast, context);

      if (evaluation.result) {
        const actions = typeof rule.actions === 'string' ? JSON.parse(rule.actions) : rule.actions;
        matchedRules.push({
          ruleId: rule.id,
          ruleCode: rule.rule_code,
          priority: rule.priority,
          scope: rule.scope,
          actions,
        });

        for (const act of actions) {
          aggregatedActions.push(act);

          if (act.action === 'HIDE') {
            visibilityMap[act.target] = false;
          } else if (act.action === 'SHOW') {
            visibilityMap[act.target] = true;
          } else if (act.action === 'TERMINATE') {
            terminationTriggered = true;
          } else if (act.action === 'SKIP_TO' && !skipToTarget) {
            skipToTarget = act.target;
          }
        }
      }
    }

    return {
      evaluatedCount: rules.length,
      matchedCount: matchedRules.length,
      matchedRules,
      actions: aggregatedActions,
      runtimeState: {
        visibility: visibilityMap,
        terminate: terminationTriggered,
        skipTo: skipToTarget,
      },
    };
  },

  /**
   * Validates rule dependencies for circular references
   * @param {string} ruleId
   * @returns {Promise<{ hasCircularDependency: boolean, dependencies: Array<string> }>}
   */
  async validateRuleDependencies(ruleId) {
    const rule = await this.getRuleById(ruleId);
    const dependencies = [];

    // Extract target dependencies from condition AST
    const extractFields = (ast) => {
      if (!ast) return;
      if (ast.and) ast.and.forEach(extractFields);
      else if (ast.or) ast.or.forEach(extractFields);
      else if (ast.not) extractFields(ast.not);
      else if (ast.field) dependencies.push(ast.field);
    };

    extractFields(rule.condition_ast);

    // Extract target outputs
    const rawActions = typeof rule.actions === 'string' ? JSON.parse(rule.actions) : rule.actions;
    const actionTargets = rawActions.map((a) => a.target);

    // Check if any output target is directly consumed as condition input
    const circular = dependencies.some((dep) => actionTargets.includes(dep));

    return {
      ruleId,
      hasCircularDependency: circular,
      conditionFields: dependencies,
      actionTargets,
    };
  },
};

module.exports = rulesEngineService;
