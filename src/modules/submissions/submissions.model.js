/**
 * @file submissions.model.js
 * @description Knex database query methods for submissions and submission_responses tables with mockStore resilience.
 */

const { db, withDbFallback } = require('../../database/connection');
const mockStore = require('../../database/mockStore');

const submissionsModel = {
  /**
   * Builds filter query for submissions
   * @param {object} filters
   * @returns {import('knex').Knex.QueryBuilder}
   */
  buildFilterQuery(filters = {}) {
    let query = db('submissions')
      .leftJoin('projects', 'submissions.project_id', 'projects.id')
      .leftJoin('vendors', 'submissions.vendor_id', 'vendors.id')
      .leftJoin('users as agents', 'submissions.source_agent_id', 'agents.id')
      .leftJoin('questionnaire_versions', 'submissions.questionnaire_version_id', 'questionnaire_versions.id')
      .select(
        'submissions.*',
        'projects.name as project_name',
        'projects.project_code as project_code',
        'vendors.name as vendor_name',
        'vendors.code as vendor_code',
        'agents.email as agent_email',
        'agents.first_name as agent_first_name',
        'agents.last_name as agent_last_name',
        'questionnaire_versions.name as questionnaire_name',
        'questionnaire_versions.version_number as questionnaire_version_number'
      );

    if (filters.projectId) {
      query = query.where('submissions.project_id', filters.projectId);
    }
    if (filters.vendorId) {
      query = query.where('submissions.vendor_id', filters.vendorId);
    }
    if (filters.stateId) {
      query = query.where('submissions.state_id', filters.stateId);
    }
    if (filters.sourceChannel) {
      query = query.where('submissions.source_channel', filters.sourceChannel);
    }
    if (filters.sourceStatus) {
      query = query.where('submissions.source_status', filters.sourceStatus);
    }
    if (filters.capiStatus) {
      query = query.where('submissions.capi_status', filters.capiStatus);
    }
    if (filters.agentId) {
      query = query.where('submissions.source_agent_id', filters.agentId);
    }
    if (filters.dateFrom) {
      query = query.where('submissions.created_at', '>=', filters.dateFrom);
    }
    if (filters.dateTo) {
      query = query.where('submissions.created_at', '<=', filters.dateTo);
    }
    if (filters.search) {
      const term = `%${filters.search.toLowerCase()}%`;
      query = query.where((builder) => {
        builder
          .whereRaw('LOWER(submissions.submission_id) LIKE ?', [term])
          .orWhereRaw('LOWER(submissions.respondent_name) LIKE ?', [term])
          .orWhere('submissions.respondent_phone', 'LIKE', `%${filters.search}%`)
          .orWhereRaw('LOWER(agents.first_name) LIKE ?', [term])
          .orWhereRaw('LOWER(agents.last_name) LIKE ?', [term]);
      });
    }

    return query;
  },

  /**
   * Find submissions with pagination
   * @param {object} filters
   * @param {object} pagination
   * @returns {Promise<Array<object>>}
   */
  async findAll(filters = {}, pagination = {}) {
    return withDbFallback(
      async () => {
        const query = this.buildFilterQuery(filters);

        if (pagination.sortBy) {
          const order = pagination.sortOrder || 'desc';
          query.orderBy(`submissions.${pagination.sortBy}`, order);
        } else {
          query.orderBy('submissions.created_at', 'desc');
        }

        if (pagination.limit) {
          query.limit(pagination.limit);
        }
        if (pagination.offset !== undefined) {
          query.offset(pagination.offset);
        }

        return query;
      },
      () => mockStore.getSubmissionsList(filters, pagination)
    );
  },

  /**
   * Count total submissions matching filters
   * @param {object} filters
   * @returns {Promise<number>}
   */
  async count(filters = {}) {
    return withDbFallback(
      async () => {
        let query = db('submissions')
          .leftJoin('users as agents', 'submissions.source_agent_id', 'agents.id');

        if (filters.projectId) query = query.where('submissions.project_id', filters.projectId);
        if (filters.vendorId) query = query.where('submissions.vendor_id', filters.vendorId);
        if (filters.stateId) query = query.where('submissions.state_id', filters.stateId);
        if (filters.sourceChannel) query = query.where('submissions.source_channel', filters.sourceChannel);
        if (filters.sourceStatus) query = query.where('submissions.source_status', filters.sourceStatus);
        if (filters.capiStatus) query = query.where('submissions.capi_status', filters.capiStatus);
        if (filters.agentId) query = query.where('submissions.source_agent_id', filters.agentId);
        if (filters.dateFrom) query = query.where('submissions.created_at', '>=', filters.dateFrom);
        if (filters.dateTo) query = query.where('submissions.created_at', '<=', filters.dateTo);
        if (filters.search) {
          const term = `%${filters.search.toLowerCase()}%`;
          query = query.where((builder) => {
            builder
              .whereRaw('LOWER(submissions.submission_id) LIKE ?', [term])
              .orWhereRaw('LOWER(submissions.respondent_name) LIKE ?', [term])
              .orWhere('submissions.respondent_phone', 'LIKE', `%${filters.search}%`)
              .orWhereRaw('LOWER(agents.first_name) LIKE ?', [term])
              .orWhereRaw('LOWER(agents.last_name) LIKE ?', [term]);
          });
        }

        const result = await query.count('* as count').first();
        return result ? parseInt(result.count, 10) : 0;
      },
      () => mockStore.count('submissions', filters)
    );
  },

  /**
   * Find submission by primary ID (UUID) or business submission_id
   * @param {string} id
   * @returns {Promise<object|null>}
   */
  async findById(id) {
    return withDbFallback(
      async () => {
        return db('submissions')
          .leftJoin('projects', 'submissions.project_id', 'projects.id')
          .leftJoin('vendors', 'submissions.vendor_id', 'vendors.id')
          .leftJoin('users as agents', 'submissions.source_agent_id', 'agents.id')
          .leftJoin('questionnaire_versions', 'submissions.questionnaire_version_id', 'questionnaire_versions.id')
          .select(
            'submissions.*',
            'projects.name as project_name',
            'projects.project_code as project_code',
            'vendors.name as vendor_name',
            'vendors.code as vendor_code',
            'agents.email as agent_email',
            'agents.first_name as agent_first_name',
            'agents.last_name as agent_last_name',
            'questionnaire_versions.name as questionnaire_name',
            'questionnaire_versions.version_number as questionnaire_version_number'
          )
          .where((builder) => {
            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
            if (isUuid) {
              builder.where('submissions.id', id).orWhere('submissions.submission_id', id);
            } else {
              builder.where('submissions.submission_id', id);
            }
          })
          .first();
      },
      () => mockStore.getSubmissionById(id)
    );
  },

  /**
   * Create a submission
   * @param {object} data
   * @param {import('knex').Knex.Transaction} [trx]
   * @returns {Promise<object>}
   */
  async create(data, trx = null) {
    return withDbFallback(
      async () => {
        const query = db('submissions').insert(data).returning('*');
        if (trx) query.transacting(trx);
        const [created] = await query;
        return created;
      },
      () => mockStore.insert('submissions', data)
    );
  },

  /**
   * Update a submission
   * @param {string} id
   * @param {object} data
   * @param {import('knex').Knex.Transaction} [trx]
   * @returns {Promise<object>}
   */
  async update(id, data, trx = null) {
    return withDbFallback(
      async () => {
        const query = db('submissions')
          .where('id', id)
          .update({
            ...data,
            updated_at: db.fn.now(),
          })
          .returning('*');
        if (trx) query.transacting(trx);
        const [updated] = await query;
        return updated;
      },
      () => mockStore.update('submissions', id, data)
    );
  },

  /**
   * Get responses for a submission
   * @param {string} submissionId
   * @returns {Promise<Array<object>>}
   */
  async findResponses(submissionId) {
    return withDbFallback(
      async () => {
        return db('submission_responses')
          .leftJoin('questions', 'submission_responses.question_id', 'questions.id')
          .select(
            'submission_responses.*',
            'questions.question_no as question_no',
            'questions.question_text as question_text',
            'questions.question_type as question_type'
          )
          .where('submission_responses.submission_id', submissionId)
          .orderBy('submission_responses.created_at', 'asc');
      },
      () => {
        const responses = mockStore.find('submission_responses', { submission_id: submissionId });
        return responses.map((r) => {
          const q = mockStore.findById('questions', r.question_id) || {};
          return {
            ...r,
            question_no: q.question_no,
            question_text: q.question_text,
            question_type: q.question_type,
          };
        });
      }
    );
  },

  /**
   * Upsert batch responses for a submission
   * @param {string} submissionId
   * @param {Array<object>} responses
   * @param {import('knex').Knex.Transaction} [trx]
   * @returns {Promise<Array<object>>}
   */
  async saveResponses(submissionId, responses, trx = null) {
    return withDbFallback(
      async () => {
        const runner = trx || db;
        const results = [];

        for (const r of responses) {
          const existing = await runner('submission_responses')
            .where({
              submission_id: submissionId,
              question_tag: r.questionTag,
            })
            .first();

          if (existing) {
            const [updated] = await runner('submission_responses')
              .where({ id: existing.id })
              .update({
                question_id: r.questionId || existing.question_id,
                response_value: r.responseValue !== undefined ? String(r.responseValue) : null,
                response_metadata: r.responseMetadata
                  ? typeof r.responseMetadata === 'object'
                    ? JSON.stringify(r.responseMetadata)
                    : r.responseMetadata
                  : existing.response_metadata,
                answered_at: r.answeredAt || existing.answered_at,
              })
              .returning('*');
            results.push(updated);
          } else {
            const [created] = await runner('submission_responses')
              .insert({
                submission_id: submissionId,
                question_id: r.questionId || null,
                question_tag: r.questionTag,
                response_value: r.responseValue !== undefined ? String(r.responseValue) : null,
                response_metadata: r.responseMetadata
                  ? typeof r.responseMetadata === 'object'
                    ? JSON.stringify(r.responseMetadata)
                    : r.responseMetadata
                  : '{}',
                answered_at: r.answeredAt || new Date(),
              })
              .returning('*');
            results.push(created);
          }
        }

        return results;
      },
      () => {
        const results = [];
        for (const r of responses) {
          const existing = mockStore.findOne('submission_responses', {
            submission_id: submissionId,
            question_tag: r.questionTag,
          });
          if (existing) {
            const updated = mockStore.update('submission_responses', existing.id, {
              question_id: r.questionId || existing.question_id,
              response_value: r.responseValue !== undefined ? String(r.responseValue) : null,
              answered_at: r.answeredAt || existing.answered_at,
            });
            results.push(updated);
          } else {
            const created = mockStore.insert('submission_responses', {
              submission_id: submissionId,
              question_id: r.questionId || null,
              question_tag: r.questionTag,
              response_value: r.responseValue !== undefined ? String(r.responseValue) : null,
              answered_at: r.answeredAt || new Date(),
            });
            results.push(created);
          }
        }
        return results;
      }
    );
  },

  /**
   * Count submissions created for project today (for sequence generation)
   * @param {string} projectId
   * @param {string} datePrefix - 'YYYYMMDD'
   * @returns {Promise<number>}
   */
  async countForSequence(projectId, datePrefix) {
    return withDbFallback(
      async () => {
        const pattern = `SUB-%-${datePrefix}-%`;
        const result = await db('submissions')
          .where('project_id', projectId)
          .where('submission_id', 'LIKE', pattern)
          .count('* as count')
          .first();

        return result ? parseInt(result.count, 10) : 0;
      },
      () => {
        const subs = mockStore.find('submissions', { project_id: projectId });
        return subs.length;
      }
    );
  },
};

module.exports = submissionsModel;
