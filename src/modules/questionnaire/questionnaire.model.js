/**
 * @file questionnaire.model.js
 * @description Knex database query methods for questionnaire versions, sections, questions, options, and translations with mockStore resilience.
 */

const { db, withDbFallback } = require('../../database/connection');
const mockStore = require('../../database/mockStore');

/**
 * Questionnaire Versions Queries
 */
const questionnaireModel = {
  // --- VERSION OPERATIONS ---

  /**
   * Find versions matching filters
   * @param {object} filters
   * @returns {Promise<Array<object>>}
   */
  async findVersions(filters = {}) {
    return withDbFallback(
      async () => {
        let query = db('questionnaire_versions')
          .select(
            'questionnaire_versions.*',
            'projects.name as project_name',
            'projects.project_code as project_code',
            db.raw('(SELECT COUNT(*) FROM sections WHERE sections.questionnaire_version_id = questionnaire_versions.id)::int as sections_count'),
            db.raw('(SELECT COUNT(*) FROM questions WHERE questions.questionnaire_version_id = questionnaire_versions.id)::int as questions_count')
          )
          .leftJoin('projects', 'questionnaire_versions.project_id', 'projects.id')
          .orderBy('questionnaire_versions.created_at', 'desc');

        if (filters.projectId) {
          query = query.where('questionnaire_versions.project_id', filters.projectId);
        }
        if (filters.module) {
          query = query.where('questionnaire_versions.module', filters.module);
        }
        if (filters.status) {
          query = query.where('questionnaire_versions.status', filters.status);
        }

        return query;
      },
      () => {
        const versions = mockStore.find('questionnaire_versions', filters);
        return versions.map((qv) => {
          const proj = mockStore.findById('projects', qv.project_id) || {};
          const secCount = (mockStore.data?.sections || []).filter(s => s.questionnaire_version_id === qv.id).length;
          const qCount = (mockStore.data?.questions || []).filter(q => q.questionnaire_version_id === qv.id).length;
          return {
            ...qv,
            project_name: proj.name,
            project_code: proj.project_code || proj.code,
            sections_count: secCount,
            questions_count: qCount,
          };
        });
      }
    );
  },

  /**
   * Find a questionnaire version by ID
   * @param {string} id
   * @returns {Promise<object|null>}
   */
  async findVersionById(id) {
    return withDbFallback(
      async () => {
        return db('questionnaire_versions')
          .select(
            'questionnaire_versions.*',
            'projects.name as project_name',
            'projects.project_code as project_code'
          )
          .leftJoin('projects', 'questionnaire_versions.project_id', 'projects.id')
          .where('questionnaire_versions.id', id)
          .first();
      },
      () => {
        const qv = mockStore.findById('questionnaire_versions', id);
        if (!qv) return null;
        const proj = mockStore.findById('projects', qv.project_id) || {};
        return {
          ...qv,
          project_name: proj.name,
          project_code: proj.project_code || proj.code,
        };
      }
    );
  },

  /**
   * Find latest version number for a project and module
   * @param {string} projectId
   * @param {string} module
   * @returns {Promise<number>}
   */
  async getLatestVersionNumber(projectId, module) {
    return withDbFallback(
      async () => {
        const result = await db('questionnaire_versions')
          .where({ project_id: projectId, module })
          .max('version_number as maxVersion')
          .first();
        return result && result.maxVersion ? parseInt(result.maxVersion, 10) : 0;
      },
      () => {
        const versions = mockStore.find('questionnaire_versions', { project_id: projectId, module });
        if (!versions.length) return 0;
        return Math.max(...versions.map((v) => Number(v.version_number) || 0));
      }
    );
  },

  /**
   * Create a questionnaire version
   * @param {object} data
   * @param {import('knex').Knex.Transaction} [trx]
   * @returns {Promise<object>}
   */
  async createVersion(data, trx = null) {
    return withDbFallback(
      async () => {
        const query = db('questionnaire_versions').insert(data).returning('*');
        if (trx) query.transacting(trx);
        const [created] = await query;
        return created;
      },
      () => mockStore.insert('questionnaire_versions', data)
    );
  },

  /**
   * Update a questionnaire version
   * @param {string} id
   * @param {object} data
   * @param {import('knex').Knex.Transaction} [trx]
   * @returns {Promise<object>}
   */
  async updateVersion(id, data, trx = null) {
    return withDbFallback(
      async () => {
        const updateData = { ...data, updated_at: db.fn.now() };
        const query = db('questionnaire_versions').where({ id }).update(updateData).returning('*');
        if (trx) query.transacting(trx);
        const [updated] = await query;
        return updated;
      },
      () => mockStore.update('questionnaire_versions', id, data)
    );
  },

  /**
   * Delete a questionnaire version
   * @param {string} id
   * @param {import('knex').Knex.Transaction} [trx]
   * @returns {Promise<number>}
   */
  async deleteVersion(id, trx = null) {
    return withDbFallback(
      async () => {
        const query = db('questionnaire_versions').where({ id }).del();
        if (trx) query.transacting(trx);
        return query;
      },
      () => mockStore.delete('questionnaire_versions', id)
    );
  },

  // --- SECTIONS OPERATIONS ---

  /**
   * Find sections by questionnaire version ID
   * @param {string} questionnaireVersionId
   * @returns {Promise<Array<object>>}
   */
  async findSections(questionnaireVersionId) {
    return withDbFallback(
      async () => {
        return db('sections')
          .where({ questionnaire_version_id: questionnaireVersionId })
          .orderBy('display_order', 'asc');
      },
      () => mockStore.find('sections', { questionnaire_version_id: questionnaireVersionId }, { sortBy: 'display_order', sortOrder: 'asc' })
    );
  },

  /**
   * Find section by ID
   * @param {string} sectionId
   * @returns {Promise<object|null>}
   */
  async findSectionById(sectionId) {
    return withDbFallback(
      async () => {
        return db('sections').where({ id: sectionId }).first();
      },
      () => mockStore.findById('sections', sectionId)
    );
  },

  /**
   * Create section
   * @param {object} data
   * @param {import('knex').Knex.Transaction} [trx]
   * @returns {Promise<object>}
   */
  async createSection(data, trx = null) {
    return withDbFallback(
      async () => {
        const query = db('sections').insert(data).returning('*');
        if (trx) query.transacting(trx);
        const [created] = await query;
        return created;
      },
      () => mockStore.insert('sections', data)
    );
  },

  /**
   * Update section
   * @param {string} sectionId
   * @param {object} data
   * @param {import('knex').Knex.Transaction} [trx]
   * @returns {Promise<object>}
   */
  async updateSection(sectionId, data, trx = null) {
    return withDbFallback(
      async () => {
        const query = db('sections').where({ id: sectionId }).update(data).returning('*');
        if (trx) query.transacting(trx);
        const [updated] = await query;
        return updated;
      },
      () => mockStore.update('sections', sectionId, data)
    );
  },

  /**
   * Delete section
   * @param {string} sectionId
   * @param {import('knex').Knex.Transaction} [trx]
   * @returns {Promise<number>}
   */
  async deleteSection(sectionId, trx = null) {
    return withDbFallback(
      async () => {
        const query = db('sections').where({ id: sectionId }).del();
        if (trx) query.transacting(trx);
        return query;
      },
      () => mockStore.delete('sections', sectionId)
    );
  },

  /**
   * Reorder sections
   * @param {string} questionnaireVersionId
   * @param {Array<{ id: string, display_order: number }>} items
   * @returns {Promise<void>}
   */
  async reorderSections(questionnaireVersionId, items) {
    return withDbFallback(
      async () => {
        await db.transaction(async (trx) => {
          for (const item of items) {
            await trx('sections')
              .where({ id: item.id, questionnaire_version_id: questionnaireVersionId })
              .update({ display_order: item.display_order });
          }
        });
      },
      () => {
        for (const item of items) {
          mockStore.update('sections', item.id, { display_order: item.display_order });
        }
      }
    );
  },

  // --- QUESTIONS OPERATIONS ---

  /**
   * Find questions by questionnaire version ID
   * @param {string} questionnaireVersionId
   * @param {string} [sectionId]
   * @returns {Promise<Array<object>>}
   */
  async findQuestions(questionnaireVersionId, sectionId = null) {
    return withDbFallback(
      async () => {
        let query = db('questions')
          .where({ questionnaire_version_id: questionnaireVersionId })
          .orderBy('display_order', 'asc');

        if (sectionId) {
          query = query.where({ section_id: sectionId });
        }

        return query;
      },
      () => {
        const filter = { questionnaire_version_id: questionnaireVersionId };
        if (sectionId) filter.section_id = sectionId;
        return mockStore.find('questions', filter, { sortBy: 'display_order', sortOrder: 'asc' });
      }
    );
  },

  /**
   * Find question by ID
   * @param {string} questionId
   * @returns {Promise<object|null>}
   */
  async findQuestionById(questionId) {
    return withDbFallback(
      async () => {
        return db('questions').where({ id: questionId }).first();
      },
      () => mockStore.findById('questions', questionId)
    );
  },

  /**
   * Create question
   * @param {object} data
   * @param {import('knex').Knex.Transaction} [trx]
   * @returns {Promise<object>}
   */
  async createQuestion(data, trx = null) {
    return withDbFallback(
      async () => {
        const query = db('questions').insert(data).returning('*');
        if (trx) query.transacting(trx);
        const [created] = await query;
        return created;
      },
      () => mockStore.insert('questions', data)
    );
  },

  /**
   * Update question
   * @param {string} questionId
   * @param {object} data
   * @param {import('knex').Knex.Transaction} [trx]
   * @returns {Promise<object>}
   */
  async updateQuestion(questionId, data, trx = null) {
    return withDbFallback(
      async () => {
        const updateData = { ...data, updated_at: db.fn.now() };
        const query = db('questions').where({ id: questionId }).update(updateData).returning('*');
        if (trx) query.transacting(trx);
        const [updated] = await query;
        return updated;
      },
      () => mockStore.update('questions', questionId, data)
    );
  },

  /**
   * Delete question
   * @param {string} questionId
   * @param {import('knex').Knex.Transaction} [trx]
   * @returns {Promise<number>}
   */
  async deleteQuestion(questionId, trx = null) {
    return withDbFallback(
      async () => {
        const query = db('questions').where({ id: questionId }).del();
        if (trx) query.transacting(trx);
        return query;
      },
      () => mockStore.delete('questions', questionId)
    );
  },

  /**
   * Reorder questions
   * @param {string} questionnaireVersionId
   * @param {Array<{ id: string, display_order: number, section_id?: string }>} items
   * @returns {Promise<void>}
   */
  async reorderQuestions(questionnaireVersionId, items) {
    return withDbFallback(
      async () => {
        await db.transaction(async (trx) => {
          for (const item of items) {
            const updatePayload = { display_order: item.display_order };
            if (item.section_id !== undefined) {
              updatePayload.section_id = item.section_id;
            }
            await trx('questions')
              .where({ id: item.id, questionnaire_version_id: questionnaireVersionId })
              .update(updatePayload);
          }
        });
      },
      () => {
        for (const item of items) {
          const updatePayload = { display_order: item.display_order };
          if (item.section_id !== undefined) {
            updatePayload.section_id = item.section_id;
          }
          mockStore.update('questions', item.id, updatePayload);
        }
      }
    );
  },

  // --- OPTIONS OPERATIONS ---

  /**
   * Find options by question ID
   * @param {string} questionId
   * @returns {Promise<Array<object>>}
   */
  async findOptions(questionId) {
    return withDbFallback(
      async () => {
        return db('question_options')
          .where({ question_id: questionId })
          .orderBy('display_order', 'asc');
      },
      () => mockStore.find('question_options', { question_id: questionId }, { sortBy: 'display_order', sortOrder: 'asc' })
    );
  },

  /**
   * Find options for multiple questions
   * @param {Array<string>} questionIds
   * @returns {Promise<Array<object>>}
   */
  async findOptionsByQuestionIds(questionIds) {
    return withDbFallback(
      async () => {
        if (!questionIds || !questionIds.length) return [];
        return db('question_options')
          .whereIn('question_id', questionIds)
          .orderBy('display_order', 'asc');
      },
      () => {
        if (!questionIds || !questionIds.length) return [];
        const items = mockStore.data.question_options.filter((o) => questionIds.includes(o.question_id));
        return items.sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
      }
    );
  },

  /**
   * Find option by ID
   * @param {string} optionId
   * @returns {Promise<object|null>}
   */
  async findOptionById(optionId) {
    return withDbFallback(
      async () => {
        return db('question_options').where({ id: optionId }).first();
      },
      () => mockStore.findById('question_options', optionId)
    );
  },

  /**
   * Create question option
   * @param {object} data
   * @param {import('knex').Knex.Transaction} [trx]
   * @returns {Promise<object>}
   */
  async createOption(data, trx = null) {
    return withDbFallback(
      async () => {
        const query = db('question_options').insert(data).returning('*');
        if (trx) query.transacting(trx);
        const [created] = await query;
        return created;
      },
      () => mockStore.insert('question_options', data)
    );
  },

  /**
   * Update question option
   * @param {string} optionId
   * @param {object} data
   * @param {import('knex').Knex.Transaction} [trx]
   * @returns {Promise<object>}
   */
  async updateOption(optionId, data, trx = null) {
    return withDbFallback(
      async () => {
        const query = db('question_options').where({ id: optionId }).update(data).returning('*');
        if (trx) query.transacting(trx);
        const [updated] = await query;
        return updated;
      },
      () => mockStore.update('question_options', optionId, data)
    );
  },

  /**
   * Delete question option
   * @param {string} optionId
   * @param {import('knex').Knex.Transaction} [trx]
   * @returns {Promise<number>}
   */
  async deleteOption(optionId, trx = null) {
    return withDbFallback(
      async () => {
        const query = db('question_options').where({ id: optionId }).del();
        if (trx) query.transacting(trx);
        return query;
      },
      () => mockStore.delete('question_options', optionId)
    );
  },

  /**
   * Reorder options
   * @param {string} questionId
   * @param {Array<{ id: string, display_order: number }>} items
   * @returns {Promise<void>}
   */
  async reorderOptions(questionId, items) {
    return withDbFallback(
      async () => {
        await db.transaction(async (trx) => {
          for (const item of items) {
            await trx('question_options')
              .where({ id: item.id, question_id: questionId })
              .update({ display_order: item.display_order });
          }
        });
      },
      () => {
        for (const item of items) {
          mockStore.update('question_options', item.id, { display_order: item.display_order });
        }
      }
    );
  },

  // --- TRANSLATIONS OPERATIONS ---

  /**
   * Find translations by entity
   * @param {string} entityType
   * @param {string} entityId
   * @returns {Promise<Array<object>>}
   */
  async findTranslations(entityType, entityId) {
    return withDbFallback(
      async () => {
        return db('translations').where({ entity_type: entityType, entity_id: entityId });
      },
      () => mockStore.find('translations', { entity_type: entityType, entity_id: entityId })
    );
  },

  /**
   * Find translations for multiple entities
   * @param {string} entityType
   * @param {Array<string>} entityIds
   * @returns {Promise<Array<object>>}
   */
  async findTranslationsByEntityIds(entityType, entityIds) {
    return withDbFallback(
      async () => {
        if (!entityIds || !entityIds.length) return [];
        return db('translations').where({ entity_type: entityType }).whereIn('entity_id', entityIds);
      },
      () => {
        if (!entityIds || !entityIds.length) return [];
        return mockStore.data.translations.filter(
          (t) => t.entity_type === entityType && entityIds.includes(t.entity_id)
        );
      }
    );
  },

  /**
   * Find translation by ID
   * @param {string} id
   * @returns {Promise<object|null>}
   */
  async findTranslationById(id) {
    return withDbFallback(
      async () => {
        return db('translations').where({ id }).first();
      },
      () => mockStore.findById('translations', id)
    );
  },

  /**
   * Upsert translation (insert or update on conflict)
   * @param {object} data
   * @param {import('knex').Knex.Transaction} [trx]
   * @returns {Promise<object>}
   */
  async upsertTranslation(data, trx = null) {
    return withDbFallback(
      async () => {
        const query = db('translations')
          .insert({
            ...data,
            updated_at: db.fn.now(),
          })
          .onConflict(['entity_type', 'entity_id', 'language_code', 'field_name'])
          .merge({
            localized_text: data.localized_text,
            updated_at: db.fn.now(),
          })
          .returning('*');

        if (trx) query.transacting(trx);
        const [record] = await query;
        return record;
      },
      () => {
        const existing = mockStore.findOne('translations', {
          entity_type: data.entity_type,
          entity_id: data.entity_id,
          language_code: data.language_code,
          field_name: data.field_name,
        });
        if (existing) {
          return mockStore.update('translations', existing.id, { localized_text: data.localized_text });
        }
        return mockStore.insert('translations', data);
      }
    );
  },

  /**
   * Delete translation
   * @param {string} id
   * @param {import('knex').Knex.Transaction} [trx]
   * @returns {Promise<number>}
   */
  async deleteTranslation(id, trx = null) {
    return withDbFallback(
      async () => {
        const query = db('translations').where({ id }).del();
        if (trx) query.transacting(trx);
        return query;
      },
      () => mockStore.delete('translations', id)
    );
  },
};

module.exports = questionnaireModel;
