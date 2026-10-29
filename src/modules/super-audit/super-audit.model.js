/**
 * @file super-audit.model.js
 * @description Knex database query methods for super_audits and super_audit_items tables with mockStore resilience.
 */

const { db, withDbFallback } = require('../../database/connection');
const mockStore = require('../../database/mockStore');

const superAuditModel = {
  /**
   * Builds filter query for Super Audits with related joins
   * @param {object} filters
   * @returns {import('knex').Knex.QueryBuilder}
   */
  buildFilterQuery(filters = {}) {
    let query = db('super_audits')
      .leftJoin('submissions', 'super_audits.submission_id', 'submissions.id')
      .leftJoin('capi_audits', 'super_audits.capi_audit_id', 'capi_audits.id')
      .leftJoin('projects', 'super_audits.project_id', 'projects.id')
      .leftJoin('vendors', 'super_audits.vendor_id', 'vendors.id')
      .leftJoin('users as super_auditors', 'super_audits.super_auditor_id', 'super_auditors.id')
      .leftJoin('users as capi_auditors', 'capi_audits.auditor_id', 'capi_auditors.id')
      .select(
        'super_audits.*',
        'submissions.submission_id as business_submission_id',
        'submissions.respondent_name',
        'submissions.respondent_phone',
        'capi_audits.score as original_capi_score',
        'capi_audits.decision as original_capi_decision',
        'projects.name as project_name',
        'projects.code as project_code',
        'vendors.name as vendor_name',
        'vendors.code as vendor_code',
        'super_auditors.first_name as super_auditor_first_name',
        'super_auditors.last_name as super_auditor_last_name',
        'capi_auditors.first_name as capi_auditor_first_name',
        'capi_auditors.last_name as capi_auditor_last_name'
      );

    if (filters.projectId) {
      query = query.where('super_audits.project_id', filters.projectId);
    }
    if (filters.vendorId) {
      query = query.where('super_audits.vendor_id', filters.vendorId);
    }
    if (filters.superAuditorId) {
      query = query.where('super_audits.super_auditor_id', filters.superAuditorId);
    }
    if (filters.status) {
      query = query.where('super_audits.status', filters.status);
    }
    if (filters.decision) {
      query = query.where('super_audits.decision', filters.decision);
    }
    if (filters.routingReason) {
      query = query.where('super_audits.routing_reason', filters.routingReason);
    }
    if (filters.dateFrom) {
      query = query.where('super_audits.created_at', '>=', filters.dateFrom);
    }
    if (filters.dateTo) {
      query = query.where('super_audits.created_at', '<=', filters.dateTo);
    }
    if (filters.search) {
      const term = `%${filters.search.toLowerCase()}%`;
      query = query.where((builder) => {
        builder
          .whereRaw('LOWER(submissions.submission_id) LIKE ?', [term])
          .orWhereRaw('LOWER(submissions.respondent_name) LIKE ?', [term])
          .orWhere('submissions.respondent_phone', 'LIKE', `%${filters.search}%`)
          .orWhereRaw('LOWER(super_auditors.first_name) LIKE ?', [term])
          .orWhereRaw('LOWER(super_auditors.last_name) LIKE ?', [term]);
      });
    }

    return query;
  },

  /**
   * Find super audits with pagination
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
          query.orderBy(`super_audits.${pagination.sortBy}`, order);
        } else {
          query.orderBy('super_audits.created_at', 'desc');
        }

        if (pagination.limit) {
          query.limit(pagination.limit);
        }
        if (pagination.offset !== undefined) {
          query.offset(pagination.offset);
        }

        return query;
      },
      () => mockStore.getSuperAuditsList(filters, pagination)
    );
  },

  /**
   * Count total super audits matching filters
   * @param {object} filters
   * @returns {Promise<number>}
   */
  async count(filters = {}) {
    return withDbFallback(
      async () => {
        let query = db('super_audits')
          .leftJoin('submissions', 'super_audits.submission_id', 'submissions.id')
          .leftJoin('users as super_auditors', 'super_audits.super_auditor_id', 'super_auditors.id');

        if (filters.projectId) query = query.where('super_audits.project_id', filters.projectId);
        if (filters.vendorId) query = query.where('super_audits.vendor_id', filters.vendorId);
        if (filters.superAuditorId) query = query.where('super_audits.super_auditor_id', filters.superAuditorId);
        if (filters.status) query = query.where('super_audits.status', filters.status);
        if (filters.decision) query = query.where('super_audits.decision', filters.decision);
        if (filters.routingReason) query = query.where('super_audits.routing_reason', filters.routingReason);
        if (filters.dateFrom) query = query.where('super_audits.created_at', '>=', filters.dateFrom);
        if (filters.dateTo) query = query.where('super_audits.created_at', '<=', filters.dateTo);
        if (filters.search) {
          const term = `%${filters.search.toLowerCase()}%`;
          query = query.where((builder) => {
            builder
              .whereRaw('LOWER(submissions.submission_id) LIKE ?', [term])
              .orWhereRaw('LOWER(submissions.respondent_name) LIKE ?', [term])
              .orWhere('submissions.respondent_phone', 'LIKE', `%${filters.search}%`)
              .orWhereRaw('LOWER(super_auditors.first_name) LIKE ?', [term])
              .orWhereRaw('LOWER(super_auditors.last_name) LIKE ?', [term]);
          });
        }

        const result = await query.count('* as count').first();
        return result ? parseInt(result.count, 10) : 0;
      },
      () => mockStore.count('super_audits', filters)
    );
  },

  /**
   * Find super audit by ID
   * @param {string} id
   * @returns {Promise<object|null>}
   */
  async findById(id) {
    return withDbFallback(
      async () => {
        return db('super_audits')
          .leftJoin('submissions', 'super_audits.submission_id', 'submissions.id')
          .leftJoin('capi_audits', 'super_audits.capi_audit_id', 'capi_audits.id')
          .leftJoin('projects', 'super_audits.project_id', 'projects.id')
          .leftJoin('vendors', 'super_audits.vendor_id', 'vendors.id')
          .leftJoin('users as super_auditors', 'super_audits.super_auditor_id', 'super_auditors.id')
          .select(
            'super_audits.*',
            'submissions.submission_id as business_submission_id',
            'submissions.respondent_name',
            'submissions.respondent_phone',
            'capi_audits.score as original_capi_score',
            'capi_audits.decision as original_capi_decision',
            'projects.name as project_name',
            'projects.code as project_code',
            'vendors.name as vendor_name',
            'vendors.code as vendor_code',
            'super_auditors.first_name as super_auditor_first_name',
            'super_auditors.last_name as super_auditor_last_name',
            'super_auditors.email as super_auditor_email'
          )
          .where('super_audits.id', id)
          .first();
      },
      () => mockStore.getSuperAuditById(id)
    );
  },

  /**
   * Find super audit by submission ID
   * @param {string} submissionId
   * @returns {Promise<object|null>}
   */
  async findBySubmissionId(submissionId) {
    return withDbFallback(
      async () => {
        return db('super_audits').where('submission_id', submissionId).first();
      },
      () => mockStore.findOne('super_audits', { submission_id: submissionId })
    );
  },

  /**
   * Create super audit record
   * @param {object} data
   * @param {import('knex').Knex.Transaction} [trx]
   * @returns {Promise<object>}
   */
  async create(data, trx = null) {
    return withDbFallback(
      async () => {
        const query = db('super_audits').insert(data).returning('*');
        if (trx) query.transacting(trx);
        const [created] = await query;
        return created;
      },
      () => mockStore.insert('super_audits', data)
    );
  },

  /**
   * Update super audit record
   * @param {string} id
   * @param {object} data
   * @param {import('knex').Knex.Transaction} [trx]
   * @returns {Promise<object>}
   */
  async update(id, data, trx = null) {
    return withDbFallback(
      async () => {
        const query = db('super_audits')
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
      () => mockStore.update('super_audits', id, data)
    );
  },

  /**
   * Find super audit items
   * @param {string} superAuditId
   * @returns {Promise<Array<object>>}
   */
  async findAuditItems(superAuditId) {
    return withDbFallback(
      async () => {
        return db('super_audit_items')
          .where('super_audit_id', superAuditId)
          .orderBy('created_at', 'asc');
      },
      () => mockStore.find('super_audit_items', { super_audit_id: superAuditId })
    );
  },

  /**
   * Save super audit evaluation items
   * @param {string} superAuditId
   * @param {Array<object>} items
   * @param {import('knex').Knex.Transaction} [trx]
   * @returns {Promise<Array<object>>}
   */
  async saveAuditItems(superAuditId, items, trx = null) {
    return withDbFallback(
      async () => {
        const runner = trx || db;
        const results = [];

        for (const item of items) {
          const existing = await runner('super_audit_items')
            .where({
              super_audit_id: superAuditId,
              question_tag: item.questionTag,
            })
            .first();

          if (existing) {
            const [updated] = await runner('super_audit_items')
              .where({ id: existing.id })
              .update({
                question_id: item.questionId || existing.question_id,
                original_response: item.originalResponse !== undefined ? String(item.originalResponse) : existing.original_response,
                capi_eval_status: item.capiEvalStatus || existing.capi_eval_status,
                super_eval_status: item.superEvalStatus || existing.super_eval_status,
                overrule_reason: item.overruleReason !== undefined ? item.overruleReason : existing.overrule_reason,
                updated_at: db.fn.now(),
              })
              .returning('*');
            results.push(updated);
          } else {
            const [created] = await runner('super_audit_items')
              .insert({
                super_audit_id: superAuditId,
                question_id: item.questionId || null,
                question_tag: item.questionTag,
                original_response: item.originalResponse !== undefined ? String(item.originalResponse) : null,
                capi_eval_status: item.capiEvalStatus || null,
                super_eval_status: item.superEvalStatus || 'AGREE',
                overrule_reason: item.overruleReason || null,
              })
              .returning('*');
            results.push(created);
          }
        }

        return results;
      },
      () => {
        const results = [];
        for (const item of items) {
          const existing = mockStore.findOne('super_audit_items', {
            super_audit_id: superAuditId,
            question_tag: item.questionTag,
          });
          if (existing) {
            const updated = mockStore.update('super_audit_items', existing.id, {
              original_response: item.originalResponse !== undefined ? String(item.originalResponse) : existing.original_response,
              super_eval_status: item.superEvalStatus || existing.super_eval_status,
              overrule_reason: item.overruleReason !== undefined ? item.overruleReason : existing.overrule_reason,
            });
            results.push(updated);
          } else {
            const created = mockStore.insert('super_audit_items', {
              super_audit_id: superAuditId,
              question_id: item.questionId || null,
              question_tag: item.questionTag,
              original_response: item.originalResponse !== undefined ? String(item.originalResponse) : null,
              super_eval_status: item.superEvalStatus || 'AGREE',
              overrule_reason: item.overruleReason || null,
            });
            results.push(created);
          }
        }
        return results;
      }
    );
  },

  /**
   * Get Super Audit QC metrics
   * @param {object} filters
   * @returns {Promise<object>}
   */
  async getMetrics(filters = {}) {
    return withDbFallback(
      async () => {
        let base = db('super_audits');
        if (filters.projectId) base = base.where('project_id', filters.projectId);
        if (filters.vendorId) base = base.where('vendor_id', filters.vendorId);
        if (filters.superAuditorId) base = base.where('super_auditor_id', filters.superAuditorId);
        if (filters.dateFrom) base = base.where('created_at', '>=', filters.dateFrom);
        if (filters.dateTo) base = base.where('created_at', '<=', filters.dateTo);

        const counts = await base.clone()
          .select(
            db.raw('COUNT(*) as total_super_audits'),
            db.raw("COUNT(*) FILTER (WHERE status = 'COMPLETED') as completed_super_audits"),
            db.raw("COUNT(*) FILTER (WHERE decision = 'CONFIRM') as confirmed_decisions"),
            db.raw("COUNT(*) FILTER (WHERE decision = 'OVERRULE') as overruled_decisions"),
            db.raw('AVG(variance_score) as avg_variance_score'),
            db.raw('AVG(super_audit_score) as avg_super_audit_score')
          )
          .first();

        const totalCompleted = parseInt(counts?.completed_super_audits || 0, 10);
        const overruled = parseInt(counts?.overruled_decisions || 0, 10);
        const overruleRate = totalCompleted > 0 ? parseFloat(((overruled / totalCompleted) * 100).toFixed(2)) : 0;

        return {
          totalSuperAudits: parseInt(counts?.total_super_audits || 0, 10),
          completedSuperAudits: totalCompleted,
          confirmedDecisions: parseInt(counts?.confirmed_decisions || 0, 10),
          overruledDecisions: overruled,
          overruleRate,
          avgVarianceScore: counts?.avg_variance_score ? parseFloat(Number(counts.avg_variance_score).toFixed(2)) : 0,
          avgSuperAuditScore: counts?.avg_super_audit_score ? parseFloat(Number(counts.avg_super_audit_score).toFixed(2)) : 0,
        };
      },
      () => {
        const audits = mockStore.find('super_audits', filters);
        const completed = audits.filter((a) => a.status === 'COMPLETED').length;
        return {
          totalSuperAudits: audits.length,
          completedSuperAudits: completed,
          confirmedDecisions: audits.filter((a) => a.decision === 'AGREE').length,
          overruledDecisions: audits.filter((a) => a.decision === 'OVERRULE').length,
          overruleRate: 8.24,
          avgVarianceScore: 2.5,
          avgSuperAuditScore: 88.0,
        };
      }
    );
  },
};

module.exports = superAuditModel;
