/**
 * @file capi.model.js
 * @description Knex database query methods for capi_audits and capi_audit_items tables with mockStore resilience.
 */

const { db, withDbFallback } = require('../../database/connection');
const mockStore = require('../../database/mockStore');

const capiModel = {
  /**
   * Builds filter query for CAPI audits with joins
   * @param {object} filters
   * @returns {import('knex').Knex.QueryBuilder}
   */
  buildFilterQuery(filters = {}) {
    let query = db('capi_audits')
      .leftJoin('submissions', 'capi_audits.submission_id', 'submissions.id')
      .leftJoin('projects', 'capi_audits.project_id', 'projects.id')
      .leftJoin('vendors', 'capi_audits.vendor_id', 'vendors.id')
      .leftJoin('users as auditors', 'capi_audits.auditor_id', 'auditors.id')
      .leftJoin('users as field_agents', 'submissions.source_agent_id', 'field_agents.id')
      .select(
        'capi_audits.*',
        'submissions.submission_id as business_submission_id',
        'submissions.respondent_name',
        'submissions.respondent_phone',
        'submissions.source_channel',
        'projects.name as project_name',
        'projects.code as project_code',
        'vendors.name as vendor_name',
        'vendors.code as vendor_code',
        'auditors.first_name as auditor_first_name',
        'auditors.last_name as auditor_last_name',
        'auditors.email as auditor_email',
        'field_agents.first_name as field_agent_first_name',
        'field_agents.last_name as field_agent_last_name'
      );

    if (filters.projectId) {
      query = query.where('capi_audits.project_id', filters.projectId);
    }
    if (filters.vendorId) {
      query = query.where('capi_audits.vendor_id', filters.vendorId);
    }
    if (filters.auditorId) {
      query = query.where('capi_audits.auditor_id', filters.auditorId);
    }
    if (filters.status) {
      query = query.where('capi_audits.status', filters.status);
    }
    if (filters.decision) {
      query = query.where('capi_audits.decision', filters.decision);
    }
    if (filters.auditType) {
      query = query.where('capi_audits.audit_type', filters.auditType);
    }
    if (filters.dateFrom) {
      query = query.where('capi_audits.created_at', '>=', filters.dateFrom);
    }
    if (filters.dateTo) {
      query = query.where('capi_audits.created_at', '<=', filters.dateTo);
    }
    if (filters.search) {
      const term = `%${filters.search.toLowerCase()}%`;
      query = query.where((builder) => {
        builder
          .whereRaw('LOWER(submissions.submission_id) LIKE ?', [term])
          .orWhereRaw('LOWER(submissions.respondent_name) LIKE ?', [term])
          .orWhere('submissions.respondent_phone', 'LIKE', `%${filters.search}%`)
          .orWhereRaw('LOWER(auditors.first_name) LIKE ?', [term])
          .orWhereRaw('LOWER(auditors.last_name) LIKE ?', [term]);
      });
    }

    return query;
  },

  /**
   * Find CAPI audits with pagination
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
          query.orderBy(`capi_audits.${pagination.sortBy}`, order);
        } else {
          query.orderBy('capi_audits.created_at', 'desc');
        }

        if (pagination.limit) {
          query.limit(pagination.limit);
        }
        if (pagination.offset !== undefined) {
          query.offset(pagination.offset);
        }

        return query;
      },
      () => mockStore.getCapiAuditsList(filters, pagination)
    );
  },

  /**
   * Count total CAPI audits matching filters
   * @param {object} filters
   * @returns {Promise<number>}
   */
  async count(filters = {}) {
    return withDbFallback(
      async () => {
        let query = db('capi_audits')
          .leftJoin('submissions', 'capi_audits.submission_id', 'submissions.id')
          .leftJoin('users as auditors', 'capi_audits.auditor_id', 'auditors.id');

        if (filters.projectId) query = query.where('capi_audits.project_id', filters.projectId);
        if (filters.vendorId) query = query.where('capi_audits.vendor_id', filters.vendorId);
        if (filters.auditorId) query = query.where('capi_audits.auditor_id', filters.auditorId);
        if (filters.status) query = query.where('capi_audits.status', filters.status);
        if (filters.decision) query = query.where('capi_audits.decision', filters.decision);
        if (filters.auditType) query = query.where('capi_audits.audit_type', filters.auditType);
        if (filters.dateFrom) query = query.where('capi_audits.created_at', '>=', filters.dateFrom);
        if (filters.dateTo) query = query.where('capi_audits.created_at', '<=', filters.dateTo);
        if (filters.search) {
          const term = `%${filters.search.toLowerCase()}%`;
          query = query.where((builder) => {
            builder
              .whereRaw('LOWER(submissions.submission_id) LIKE ?', [term])
              .orWhereRaw('LOWER(submissions.respondent_name) LIKE ?', [term])
              .orWhere('submissions.respondent_phone', 'LIKE', `%${filters.search}%`)
              .orWhereRaw('LOWER(auditors.first_name) LIKE ?', [term])
              .orWhereRaw('LOWER(auditors.last_name) LIKE ?', [term]);
          });
        }

        const result = await query.count('* as count').first();
        return result ? parseInt(result.count, 10) : 0;
      },
      () => mockStore.count('capi_audits', filters)
    );
  },

  /**
   * Find audit by ID
   * @param {string} id
   * @returns {Promise<object|null>}
   */
  async findById(id) {
    return withDbFallback(
      async () => {
        return db('capi_audits')
          .leftJoin('submissions', 'capi_audits.submission_id', 'submissions.id')
          .leftJoin('projects', 'capi_audits.project_id', 'projects.id')
          .leftJoin('vendors', 'capi_audits.vendor_id', 'vendors.id')
          .leftJoin('users as auditors', 'capi_audits.auditor_id', 'auditors.id')
          .leftJoin('users as field_agents', 'submissions.source_agent_id', 'field_agents.id')
          .select(
            'capi_audits.*',
            'submissions.submission_id as business_submission_id',
            'submissions.respondent_name',
            'submissions.respondent_phone',
            'submissions.source_channel',
            'projects.name as project_name',
            'projects.code as project_code',
            'vendors.name as vendor_name',
            'vendors.code as vendor_code',
            'auditors.first_name as auditor_first_name',
            'auditors.last_name as auditor_last_name',
            'auditors.email as auditor_email',
            'field_agents.first_name as field_agent_first_name',
            'field_agents.last_name as field_agent_last_name'
          )
          .where('capi_audits.id', id)
          .first();
      },
      () => mockStore.getCapiAuditById(id)
    );
  },

  /**
   * Find audit by submission ID
   * @param {string} submissionId
   * @returns {Promise<object|null>}
   */
  async findBySubmissionId(submissionId) {
    return withDbFallback(
      async () => {
        return db('capi_audits').where('submission_id', submissionId).first();
      },
      () => mockStore.findOne('capi_audits', { submission_id: submissionId })
    );
  },

  /**
   * Create new CAPI audit
   * @param {object} data
   * @param {import('knex').Knex.Transaction} [trx]
   * @returns {Promise<object>}
   */
  async create(data, trx = null) {
    return withDbFallback(
      async () => {
        const query = db('capi_audits').insert(data).returning('*');
        if (trx) query.transacting(trx);
        const [created] = await query;
        return created;
      },
      () => mockStore.insert('capi_audits', data)
    );
  },

  /**
   * Update audit record
   * @param {string} id
   * @param {object} data
   * @param {import('knex').Knex.Transaction} [trx]
   * @returns {Promise<object>}
   */
  async update(id, data, trx = null) {
    return withDbFallback(
      async () => {
        const query = db('capi_audits')
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
      () => mockStore.update('capi_audits', id, data)
    );
  },

  /**
   * Find audit items by audit ID
   * @param {string} capiAuditId
   * @returns {Promise<Array<object>>}
   */
  async findAuditItems(capiAuditId) {
    return withDbFallback(
      async () => {
        return db('capi_audit_items')
          .where('capi_audit_id', capiAuditId)
          .orderBy('created_at', 'asc');
      },
      () => mockStore.find('capi_audit_items', { capi_audit_id: capiAuditId })
    );
  },

  /**
   * Upsert audit evaluation items
   * @param {string} capiAuditId
   * @param {Array<object>} items
   * @param {import('knex').Knex.Transaction} [trx]
   * @returns {Promise<Array<object>>}
   */
  async saveAuditItems(capiAuditId, items, trx = null) {
    return withDbFallback(
      async () => {
        const runner = trx || db;
        const results = [];

        for (const item of items) {
          const existing = await runner('capi_audit_items')
            .where({
              capi_audit_id: capiAuditId,
              question_tag: item.questionTag,
            })
            .first();

          if (existing) {
            const [updated] = await runner('capi_audit_items')
              .where({ id: existing.id })
              .update({
                question_id: item.questionId || existing.question_id,
                original_value: item.originalValue !== undefined ? String(item.originalValue) : existing.original_value,
                audited_value: item.auditedValue !== undefined ? String(item.auditedValue) : existing.audited_value,
                status: item.status || existing.status,
                is_mismatch: item.isMismatch !== undefined ? item.isMismatch : (item.status === 'FAIL'),
                audio_timestamp_start: item.audioTimestampStart !== undefined ? item.audioTimestampStart : existing.audio_timestamp_start,
                audio_timestamp_end: item.audioTimestampEnd !== undefined ? item.audioTimestampEnd : existing.audio_timestamp_end,
                notes: item.notes !== undefined ? item.notes : existing.notes,
                updated_at: db.fn.now(),
              })
              .returning('*');
            results.push(updated);
          } else {
            const [created] = await runner('capi_audit_items')
              .insert({
                capi_audit_id: capiAuditId,
                question_id: item.questionId || null,
                question_tag: item.questionTag,
                original_value: item.originalValue !== undefined ? String(item.originalValue) : null,
                audited_value: item.auditedValue !== undefined ? String(item.auditedValue) : null,
                status: item.status || 'PASS',
                is_mismatch: item.isMismatch !== undefined ? item.isMismatch : (item.status === 'FAIL'),
                audio_timestamp_start: item.audioTimestampStart || null,
                audio_timestamp_end: item.audioTimestampEnd || null,
                notes: item.notes || null,
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
          const existing = mockStore.findOne('capi_audit_items', {
            capi_audit_id: capiAuditId,
            question_tag: item.questionTag,
          });
          if (existing) {
            const updated = mockStore.update('capi_audit_items', existing.id, {
              original_value: item.originalValue !== undefined ? String(item.originalValue) : existing.original_value,
              audited_value: item.auditedValue !== undefined ? String(item.auditedValue) : existing.audited_value,
              status: item.status || existing.status,
              is_mismatch: item.isMismatch !== undefined ? item.isMismatch : item.status === 'FAIL',
              notes: item.notes || existing.notes,
            });
            results.push(updated);
          } else {
            const created = mockStore.insert('capi_audit_items', {
              capi_audit_id: capiAuditId,
              question_id: item.questionId || null,
              question_tag: item.questionTag,
              original_value: item.originalValue !== undefined ? String(item.originalValue) : null,
              audited_value: item.auditedValue !== undefined ? String(item.auditedValue) : null,
              status: item.status || 'PASS',
              is_mismatch: item.isMismatch !== undefined ? item.isMismatch : item.status === 'FAIL',
              notes: item.notes || null,
            });
            results.push(created);
          }
        }
        return results;
      }
    );
  },

  /**
   * Get CAPI audit performance metrics
   * @param {object} filters
   * @returns {Promise<object>}
   */
  async getMetrics(filters = {}) {
    return withDbFallback(
      async () => {
        let base = db('capi_audits');
        if (filters.projectId) base = base.where('project_id', filters.projectId);
        if (filters.vendorId) base = base.where('vendor_id', filters.vendorId);
        if (filters.auditorId) base = base.where('auditor_id', filters.auditorId);
        if (filters.dateFrom) base = base.where('created_at', '>=', filters.dateFrom);
        if (filters.dateTo) base = base.where('created_at', '<=', filters.dateTo);

        const counts = await base.clone()
          .select(
            db.raw('COUNT(*) as total_audits'),
            db.raw("COUNT(*) FILTER (WHERE status = 'COMPLETED') as completed_audits"),
            db.raw("COUNT(*) FILTER (WHERE status = 'PENDING') as pending_audits"),
            db.raw("COUNT(*) FILTER (WHERE decision = 'PASS') as passed_audits"),
            db.raw("COUNT(*) FILTER (WHERE decision = 'FAIL') as failed_audits"),
            db.raw("COUNT(*) FILTER (WHERE decision = 'ESCALATE') as escalated_audits"),
            db.raw('AVG(score) as avg_score'),
            db.raw('AVG(duration_seconds) as avg_duration_seconds')
          )
          .first();

        return {
          totalAudits: parseInt(counts?.total_audits || 0, 10),
          completedAudits: parseInt(counts?.completed_audits || 0, 10),
          pendingAudits: parseInt(counts?.pending_audits || 0, 10),
          passedAudits: parseInt(counts?.passed_audits || 0, 10),
          failedAudits: parseInt(counts?.failed_audits || 0, 10),
          escalatedAudits: parseInt(counts?.escalated_audits || 10),
          avgScore: counts?.avg_score ? parseFloat(Number(counts.avg_score).toFixed(2)) : 0,
          avgDurationSeconds: counts?.avg_duration_seconds ? Math.round(Number(counts.avg_duration_seconds)) : 0,
        };
      },
      () => {
        const audits = mockStore.find('capi_audits', filters);
        const completed = audits.filter((a) => a.status === 'COMPLETED').length;
        const pending = audits.filter((a) => a.status === 'PENDING').length;
        const passed = audits.filter((a) => a.decision === 'PASS').length;
        const failed = audits.filter((a) => a.decision === 'FAIL').length;
        const avgScore = audits.length > 0 ? audits.reduce((acc, a) => acc + (Number(a.score) || 0), 0) / audits.length : 0;
        return {
          totalAudits: audits.length,
          completedAudits: completed,
          pendingAudits: pending,
          passedAudits: passed,
          failedAudits: failed,
          escalatedAudits: 0,
          avgScore: parseFloat(avgScore.toFixed(2)),
          avgDurationSeconds: 850,
        };
      }
    );
  },
};

module.exports = capiModel;
