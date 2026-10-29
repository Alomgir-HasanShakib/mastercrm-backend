/**
 * @file rules-engine.model.js
 * @description Knex database query methods for rule_definitions table.
 */

const { db, withDbFallback } = require('../../database/connection');
const mockStore = require('../../database/mockStore');

const rulesEngineModel = {
  /**
   * Find rules matching filters
   * @param {object} filters
   * @returns {Promise<Array<object>>}
   */
  async findRules(filters = {}) {
    let query = db('rule_definitions')
      .select('rule_definitions.*', 'projects.name as project_name')
      .leftJoin('projects', 'rule_definitions.project_id', 'projects.id')
      .orderBy('priority', 'asc')
      .orderBy('rule_definitions.created_at', 'asc');

    if (filters.projectId) {
      query = query.where('rule_definitions.project_id', filters.projectId);
    }
    if (filters.module) {
      query = query.where('rule_definitions.module', filters.module);
    }
    if (filters.scope) {
      query = query.where('rule_definitions.scope', filters.scope);
    }
    if (filters.isEnabled !== undefined) {
      query = query.where('rule_definitions.is_enabled', filters.isEnabled);
    }

    return query;
  },

  /**
   * Find a single rule by ID
   * @param {string} id
   * @returns {Promise<object|null>}
   */
  async findRuleById(id) {
    return db('rule_definitions')
      .select('rule_definitions.*', 'projects.name as project_name')
      .leftJoin('projects', 'rule_definitions.project_id', 'projects.id')
      .where('rule_definitions.id', id)
      .first();
  },

  /**
   * Find a rule by project and rule_code
   * @param {string} projectId
   * @param {string} ruleCode
   * @returns {Promise<object|null>}
   */
  async findRuleByCode(projectId, ruleCode) {
    return db('rule_definitions')
      .where({ project_id: projectId, rule_code: ruleCode })
      .first();
  },

  /**
   * Create a new rule definition
   * @param {object} data
   * @returns {Promise<object>}
   */
  async createRule(data) {
    const [created] = await db('rule_definitions').insert(data).returning('*');
    return created;
  },

  /**
   * Update a rule definition
   * @param {string} id
   * @param {object} data
   * @returns {Promise<object>}
   */
  async updateRule(id, data) {
    const [updated] = await db('rule_definitions')
      .where({ id })
      .update({
        ...data,
        updated_at: db.fn.now(),
      })
      .returning('*');
    return updated;
  },

  /**
   * Delete a rule definition
   * @param {string} id
   * @returns {Promise<number>}
   */
  async deleteRule(id) {
    return db('rule_definitions').where({ id }).del();
  },

  /**
   * Load active rules for runtime evaluation
   * @param {string} projectId
   * @param {string} module
   * @returns {Promise<Array<object>>}
   */
  async findApplicableRules(projectId, module) {
    const now = new Date();
    return db('rule_definitions')
      .where({
        project_id: projectId,
        module,
        is_enabled: true,
      })
      .where((builder) => {
        builder.whereNull('effective_from').orWhere('effective_from', '<=', now);
      })
      .where((builder) => {
        builder.whereNull('effective_to').orWhere('effective_to', '>=', now);
      })
      .orderBy('priority', 'asc');
  },
};

const wrappedRulesEngineModel = {
  ...rulesEngineModel,
  async findRules(filters = {}) {
    return withDbFallback(
      () => rulesEngineModel.findRules(filters),
      () => mockStore.find('rule_definitions', filters)
    );
  },
  async findRuleById(id) {
    return withDbFallback(
      () => rulesEngineModel.findRuleById(id),
      () => mockStore.findById('rule_definitions', id)
    );
  },
  async findRuleByCode(projectId, ruleCode) {
    return withDbFallback(
      () => rulesEngineModel.findRuleByCode(projectId, ruleCode),
      () => mockStore.findOne('rule_definitions', { project_id: projectId, rule_code: ruleCode })
    );
  },
  async createRule(data) {
    return withDbFallback(
      () => rulesEngineModel.createRule(data),
      () => mockStore.insert('rule_definitions', data)
    );
  },
  async updateRule(id, data) {
    return withDbFallback(
      () => rulesEngineModel.updateRule(id, data),
      () => mockStore.updateById('rule_definitions', id, data)
    );
  },
  async deleteRule(id) {
    return withDbFallback(
      () => rulesEngineModel.deleteRule(id),
      () => (mockStore.deleteById('rule_definitions', id) ? 1 : 0)
    );
  },
  async findApplicableRules(projectId, module) {
    return withDbFallback(
      () => rulesEngineModel.findApplicableRules(projectId, module),
      () => mockStore.find('rule_definitions', { project_id: projectId, module, is_enabled: true })
    );
  },
};

module.exports = wrappedRulesEngineModel;
