/**
 * @file ruleEngine.js
 * @description Safe, deterministic, isomorphic rule compiler and evaluator.
 * Supports declarative AST: 'all', 'any', 'not', and allowlisted operators.
 * Never executes arbitrary JavaScript, SQL or eval.
 */

const ALLOWED_OPERATORS = new Set([
  'eq',
  'ne',
  'in',
  'not_in',
  'is_empty',
  'not_empty',
  'contains',
  'gt',
  'gte',
  'lt',
  'lte',
]);

/**
 * Safely extracts a value from a nested context object using dot-notation.
 * Restricts paths to allowed namespaces: answers, input, questionAudit, answerAudit, actual, meta.
 * @param {object} context
 * @param {string} path
 * @returns {*}
 */
function getValueByPath(context, path) {
  if (!path || typeof path !== 'string') return undefined;
  const parts = path.split('.');
  const namespace = parts[0];
  const allowedNamespaces = ['answers', 'input', 'questionAudit', 'answerAudit', 'actual', 'meta'];

  // Default to answers if no recognized namespace is prefixed
  if (!allowedNamespaces.includes(namespace)) {
    return context.answers?.[path] !== undefined ? context.answers[path] : undefined;
  }

  let curr = context;
  for (const part of parts) {
    if (curr === null || curr === undefined || typeof curr !== 'object') {
      return undefined;
    }
    curr = curr[part];
  }
  return curr;
}

/**
 * Evaluates a single atomic condition node against a context.
 * @param {object} node - { path, operator, value, values }
 * @param {object} context - { answers, input, questionAudit, answerAudit, actual, meta }
 * @returns {boolean}
 */
function evaluateAtomicCondition(node, context) {
  if (!node || typeof node !== 'object') return true;
  const { path, operator, value, values } = node;

  if (!ALLOWED_OPERATORS.has(operator)) {
    console.warn(`[RuleEngine] Disallowed operator '${operator}' rejected.`);
    return false;
  }

  const actualValue = getValueByPath(context, path);

  switch (operator) {
    case 'eq':
      return actualValue === value;
    case 'ne':
      return actualValue !== value;
    case 'in':
      if (!Array.isArray(values)) return false;
      return values.includes(actualValue);
    case 'not_in':
      if (!Array.isArray(values)) return true;
      return !values.includes(actualValue);
    case 'is_empty':
      return actualValue === undefined || actualValue === null || actualValue === '' || (Array.isArray(actualValue) && actualValue.length === 0);
    case 'not_empty':
      return actualValue !== undefined && actualValue !== null && actualValue !== '' && (!Array.isArray(actualValue) || actualValue.length > 0);
    case 'contains':
      if (Array.isArray(actualValue)) {
        return actualValue.includes(value);
      }
      if (typeof actualValue === 'string') {
        return actualValue.includes(String(value));
      }
      return false;
    case 'gt':
      return typeof actualValue === 'number' && actualValue > value;
    case 'gte':
      return typeof actualValue === 'number' && actualValue >= value;
    case 'lt':
      return typeof actualValue === 'number' && actualValue < value;
    case 'lte':
      return typeof actualValue === 'number' && actualValue <= value;
    default:
      return false;
  }
}

/**
 * Recursively evaluates an AST rule expression.
 * AST Grammar:
 * - { all: [ subrules... ] }
 * - { any: [ subrules... ] }
 * - { not: subrule }
 * - { path, operator, value/values }
 * @param {object} expr
 * @param {object} context
 * @returns {boolean}
 */
function evaluateRule(expr, context) {
  if (!expr || typeof expr !== 'object') return true;

  if (Array.isArray(expr.all)) {
    if (expr.all.length === 0) return true;
    return expr.all.every((sub) => evaluateRule(sub, context));
  }

  if (Array.isArray(expr.any)) {
    if (expr.any.length === 0) return true;
    return expr.any.some((sub) => evaluateRule(sub, context));
  }

  if (expr.not) {
    return !evaluateRule(expr.not, context);
  }

  // Atomic condition
  return evaluateAtomicCondition(expr, context);
}

/**
 * Validates AST structure and verifies no disallowed operators or cyclic dependencies.
 * @param {object} expr
 * @param {number} depth
 * @returns {{ valid: boolean, error?: string }}
 */
function validateRuleAST(expr, depth = 0) {
  if (depth > 20) {
    return { valid: false, error: 'Maximum rule nesting depth exceeded (20 levels).' };
  }
  if (!expr || typeof expr !== 'object') {
    return { valid: false, error: 'Rule expression must be an object.' };
  }

  if (expr.all) {
    if (!Array.isArray(expr.all)) return { valid: false, error: "'all' must be an array." };
    for (const sub of expr.all) {
      const res = validateRuleAST(sub, depth + 1);
      if (!res.valid) return res;
    }
    return { valid: true };
  }

  if (expr.any) {
    if (!Array.isArray(expr.any)) return { valid: false, error: "'any' must be an array." };
    for (const sub of expr.any) {
      const res = validateRuleAST(sub, depth + 1);
      if (!res.valid) return res;
    }
    return { valid: true };
  }

  if (expr.not) {
    return validateRuleAST(expr.not, depth + 1);
  }

  if (!expr.operator || !ALLOWED_OPERATORS.has(expr.operator)) {
    return { valid: false, error: `Invalid or disallowed operator: ${expr.operator}` };
  }

  if (!expr.path || typeof expr.path !== 'string') {
    return { valid: false, error: 'Condition node must provide a string path.' };
  }

  return { valid: true };
}

/**
 * Evaluates visibility, enabled state, requiredness, and options for all questions in a schema.
 * Supports configurable clear-on-hide policy.
 * @param {Array<object>} questions - Normalized question definitions
 * @param {object} answers - Current answer dictionary
 * @param {object} extraContext - { input, questionAudit, answerAudit, actual, meta }
 * @param {object} [options] - { clearOnHide: true }
 * @returns {{
 *   visibleMap: Object<string, boolean>,
 *   enabledMap: Object<string, boolean>,
 *   requiredMap: Object<string, boolean>,
 *   escalateToSuperAudit: boolean,
 *   escalationReasons: Array<string>,
 *   clearedAnswers: Object<string, any>
 * }}
 */
function evaluateFormRules(questions, answers = {}, extraContext = {}, options = { clearOnHide: true }) {
  const context = {
    answers: { ...answers },
    input: extraContext.input || {},
    questionAudit: extraContext.questionAudit || {},
    answerAudit: extraContext.answerAudit || {},
    actual: extraContext.actual || {},
    meta: extraContext.meta || {},
  };

  const visibleMap = {};
  const enabledMap = {};
  const requiredMap = {};
  const escalationReasons = [];
  let escalateToSuperAudit = false;

  // Initial pass: evaluate rules
  for (const q of questions) {
    const qKey = q.t || q.sourceTag || q.code || q.id;

    // 1. Visibility
    let isVisible = q.defaultVisible !== false;
    if (q.visibilityRule && typeof q.visibilityRule === 'object') {
      isVisible = evaluateRule(q.visibilityRule, context);
    } else if (Array.isArray(q.conditions) && q.conditions.length > 0) {
      // Legacy condition adapter
      isVisible = q.conditions.every((c) => {
        const parentVal = context.answers[c.dependsOn];
        if (c.equals !== undefined) return parentVal === c.equals;
        if (Array.isArray(c.in)) return c.in.includes(parentVal);
        return Boolean(parentVal);
      });
    }
    visibleMap[q.id] = isVisible;
    if (qKey) visibleMap[qKey] = isVisible;

    // 2. Enabled
    let isEnabled = q.isEnabled !== false;
    if (q.enabledRule && typeof q.enabledRule === 'object') {
      isEnabled = evaluateRule(q.enabledRule, context);
    }
    enabledMap[q.id] = isEnabled;
    if (qKey) enabledMap[qKey] = isEnabled;

    // 3. Requiredness
    let isRequired = Boolean(q.defaultRequired || q.q?.important || q.a?.important);
    if (q.requiredRule && typeof q.requiredRule === 'object') {
      isRequired = evaluateRule(q.requiredRule, context);
    }
    requiredMap[q.id] = isRequired && isVisible && isEnabled;
    if (qKey) requiredMap[qKey] = requiredMap[q.id];

    // 4. Super Audit Escalation Trigger
    if (q.escalateRule && typeof q.escalateRule === 'object') {
      const shouldEscalate = evaluateRule(q.escalateRule, context);
      if (shouldEscalate) {
        escalateToSuperAudit = true;
        escalationReasons.push(q.escalateReason || `Escalation triggered by rule on ${qKey}`);
      }
    }
  }

  // Clear answers for questions that are newly hidden if clearOnHide is active
  const clearedAnswers = {};
  if (options.clearOnHide) {
    for (const q of questions) {
      const qKey = q.t || q.sourceTag || q.code || q.id;
      const isVisible = visibleMap[q.id];
      if (!isVisible) {
        if (context.answers[q.id] !== undefined) {
          delete context.answers[q.id];
          clearedAnswers[q.id] = null;
        }
        if (qKey && context.answers[qKey] !== undefined) {
          delete context.answers[qKey];
          clearedAnswers[qKey] = null;
        }
      }
    }
  }

  return {
    visibleMap,
    enabledMap,
    requiredMap,
    escalateToSuperAudit,
    escalationReasons,
    clearedAnswers,
    normalizedAnswers: context.answers,
  };
}

/**
 * Validates submission payload authoritatively on server.
 * Ensures:
 * - All visible, enabled, required fields have answers.
 * - Answers match allowed options for select/multi-select questions.
 * - Dependent lookup answers belong to the selected parent code.
 * - No illegal answers submitted for hidden questions.
 * @param {Array<object>} questions - Form definition questions
 * @param {object} submissionPayload - { answers, questionAudit, answerAudit, actual, disposition }
 * @param {object} [extraContext] - { input, lookupHierarchy }
 * @returns {{ valid: boolean, errors: Array<{ field: string, code: string, message: string }> }}
 */
function validateSubmissionPayload(questions, submissionPayload, extraContext = {}) {
  const { answers = {}, disposition } = submissionPayload;
  const errors = [];

  const evaluation = evaluateFormRules(questions, answers, extraContext, { clearOnHide: false });
  const { visibleMap, enabledMap, requiredMap } = evaluation;

  // Check required disposition
  if (!disposition) {
    errors.push({ field: 'disposition', code: 'REQUIRED_FIELD_MISSING', message: 'Disposition is required on submission.' });
  }

  for (const q of questions) {
    const qKey = q.t || q.sourceTag || q.code || q.id;
    const isVisible = visibleMap[q.id];
    const isEnabled = enabledMap[q.id];
    const isRequired = requiredMap[q.id];
    const answerVal = answers[q.id] !== undefined ? answers[q.id] : answers[qKey];

    // If question is hidden but an answer was submitted, flag or strip
    if (!isVisible && answerVal !== undefined && answerVal !== null && answerVal !== '') {
      errors.push({
        field: qKey,
        code: 'HIDDEN_FIELD_VALUE_DISALLOWED',
        message: `Field '${qKey}' is hidden under current branch rules but received value '${answerVal}'.`,
      });
      continue;
    }

    // Required check
    if (isVisible && isEnabled && isRequired) {
      if (answerVal === undefined || answerVal === null || answerVal === '') {
        errors.push({
          field: qKey,
          code: 'REQUIRED_FIELD_EMPTY',
          message: `Field '${q.q?.label || qKey}' is required and cannot be empty.`,
        });
      }
    }

    // Static Option validation (if select/multi_select with static options)
    if (isVisible && isEnabled && answerVal && q.a?.options?.length > 0 && !q.metadata?.isAcQuestion && !q.metadata?.isPcQuestion) {
      const allowedCodes = new Set(q.a.options.map((o) => (typeof o === 'string' ? o : o.value || o.label)));
      if (q.a.type === 'select') {
        if (!allowedCodes.has(answerVal)) {
          errors.push({
            field: qKey,
            code: 'INVALID_OPTION_VALUE',
            message: `Value '${answerVal}' is not a valid option for '${qKey}'.`,
          });
        }
      } else if (q.a.type === 'multi_select' && Array.isArray(answerVal)) {
        for (const item of answerVal) {
          if (!allowedCodes.has(item)) {
            errors.push({
              field: qKey,
              code: 'INVALID_OPTION_VALUE',
              message: `Option '${item}' is not a valid choice for '${qKey}'.`,
            });
          }
        }
      }
    }

    // Dependent Lookup Validation (e.g. Lok_Sabha -> vidhan_sabha)
    if (isVisible && isEnabled && answerVal && q.metadata?.isAcQuestion && extraContext.lookupHierarchy) {
      const parentKey = q.metadata.parentPcKey || 'Lok_Sabha';
      const parentAnswer = answers[parentKey] || answers['Q_LOK_SABHA'] || answers['PC_CODE'];
      if (!parentAnswer) {
        errors.push({
          field: qKey,
          code: 'PARENT_LOOKUP_MISSING',
          message: `Parent constituency '${parentKey}' must be selected before selecting '${qKey}'.`,
        });
      } else {
        const allowedChildren = extraContext.lookupHierarchy[parentAnswer] || [];
        const allowedChildNames = allowedChildren.map((c) => (typeof c === 'string' ? c : c.name || c.value || c.label));
        if (allowedChildNames.length > 0 && !allowedChildNames.includes(answerVal)) {
          errors.push({
            field: qKey,
            code: 'INVALID_DEPENDENT_LOOKUP_CHOICE',
            message: `Assembly constituency '${answerVal}' does not belong to Lok Sabha '${parentAnswer}'.`,
          });
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    evaluation,
  };
}

module.exports = {
  ALLOWED_OPERATORS,
  getValueByPath,
  evaluateAtomicCondition,
  evaluateRule,
  validateRuleAST,
  evaluateFormRules,
  validateSubmissionPayload,
};
