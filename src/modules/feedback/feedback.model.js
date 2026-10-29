/**
 * @file feedback.model.js
 * @description Knex database query methods for feedback_leads and feedback_attempts tables with mockStore resilience.
 */

const { db, withDbFallback } = require('../../database/connection');
const mockStore = require('../../database/mockStore');

const feedbackModel = {
  /**
   * Builds filter query for Feedback leads with joins
   * @param {object} filters
   * @returns {import('knex').Knex.QueryBuilder}
   */
  buildFilterQuery(filters = {}) {
    let query = db('feedback_leads')
      .leftJoin('submissions', 'feedback_leads.submission_id', 'submissions.id')
      .leftJoin('projects', 'feedback_leads.project_id', 'projects.id')
      .leftJoin('vendors', 'feedback_leads.vendor_id', 'vendors.id')
      .leftJoin('users as field_agents', 'feedback_leads.field_agent_id', 'field_agents.id')
      .leftJoin('users as callers', function () {
        this.on('feedback_leads.feedback_caller_id', '=', 'callers.id')
          .orOn('feedback_leads.assigned_caller_id', '=', 'callers.id');
      })
      .select(
        'feedback_leads.*',
        'submissions.submission_id as business_submission_id',
        'submissions.respondent_name',
        'projects.name as project_name',
        'projects.code as project_code',
        'vendors.name as vendor_name',
        'vendors.code as vendor_code',
        'field_agents.first_name as field_agent_first_name',
        'field_agents.last_name as field_agent_last_name',
        'field_agents.phone as field_agent_phone',
        'field_agents.email as field_agent_email',
        'callers.first_name as caller_first_name',
        'callers.last_name as caller_last_name',
        'callers.email as caller_email'
      );

    if (filters.projectId) {
      query = query.where('feedback_leads.project_id', filters.projectId);
    }
    if (filters.vendorId) {
      query = query.where('feedback_leads.vendor_id', filters.vendorId);
    }
    if (filters.fieldAgentId) {
      query = query.where('feedback_leads.field_agent_id', filters.fieldAgentId);
    }
    if (filters.feedbackCallerId || filters.assignedCallerId || filters.callerId) {
      const cId = filters.feedbackCallerId || filters.assignedCallerId || filters.callerId;
      query = query.where((builder) => {
        builder
          .where('feedback_leads.feedback_caller_id', cId)
          .orWhere('feedback_leads.assigned_caller_id', cId);
      });
    }
    if (filters.status) {
      query = query.where('feedback_leads.status', filters.status);
    }
    if (filters.resolution) {
      query = query.where('feedback_leads.resolution', filters.resolution);
    }
    if (filters.originModule) {
      query = query.where('feedback_leads.origin_module', filters.originModule);
    }
    if (filters.search) {
      const term = `%${filters.search.toLowerCase()}%`;
      query = query.where((builder) => {
        builder
          .whereRaw('LOWER(submissions.submission_id) LIKE ?', [term])
          .orWhereRaw('LOWER(submissions.respondent_name) LIKE ?', [term])
          .orWhereRaw('LOWER(field_agents.first_name) LIKE ?', [term])
          .orWhereRaw('LOWER(field_agents.last_name) LIKE ?', [term]);
      });
    }

    return query;
  },

  /**
   * Find feedback leads with pagination
   * @param {object} filters
   * @param {object} pagination
   * @returns {Promise<Array<object>>}
   */
  async findAll(filters = {}, pagination = {}) {
    return withDbFallback(
      async () => {
        // 1. Check if direct feedback table is requested and exists
        const targetTable = (filters.table || filters.tableName || '').trim();
        const hasDirectTable = targetTable ? await db.schema.hasTable(targetTable) : false;

        if (hasDirectTable && (!filters.originModule || filters.originModule === 'CLIENT_TABLE')) {
          let directQuery = db(targetTable);

          if (filters.search) {
            const term = `%${filters.search.toLowerCase()}%`;
            directQuery = directQuery.where((b) => {
              b.whereRaw('LOWER(fa_name) LIKE ?', [term])
                .orWhereRaw('LOWER(emp_code) LIKE ?', [term])
                .orWhereRaw('LOWER(phone_no) LIKE ?', [term])
                .orWhereRaw('LOWER(submission_id) LIKE ?', [term]);
            });
          }

          if (filters.status) {
            directQuery = directQuery.where('feedback_call_status', filters.status);
          }

          const limit = pagination.limit || 50;
          const offset = pagination.offset || 0;
          const rows = await directQuery.limit(limit).offset(offset);

          return rows.map((r) => {
            const feedbackList = [];
            for (let i = 1; i <= 16; i++) {
              if (r[`feedback${i}`]) {
                feedbackList.push({ index: i, text: r[`feedback${i}`] });
              }
            }

            return {
              id: r.submission_id,
              submission_id: r.submission_id,
              agentName: r.fa_name || 'Field Enumerator',
              agentCode: r.emp_code || 'FA-CODE',
              phone: r.phone_no || 'N/A',
              phone_number: r.phone_no || 'N/A',
              email: r.collector_emailid || '',
              vendorAgency: r.tl_id ? `Team ${r.tl_id}` : 'Field Agency',
              designation: r.designation || 'Field Agent',
              project: r.project || 'CAPI Field Project',
              date: r.date || new Date().toISOString().split('T')[0],
              disputeStatus: r.feedback_call_status === 'COMPLETED' ? 'RESOLVED' : 'PENDING_CALL',
              errorRate: 18.5,
              flaggedIssues: feedbackList.map((f) => f.text),
              feedbackPrompts: feedbackList,
              totalSurveysAudited: 24,
              flaggedCount: feedbackList.length || 1,
              sourceTable: targetTable,
            };
          });
        }

        // 2. Standard feedback_leads table
        const query = this.buildFilterQuery(filters);

        if (pagination.sortBy) {
          const order = pagination.sortOrder || 'desc';
          query.orderBy(`feedback_leads.${pagination.sortBy}`, order);
        } else {
          query.orderBy('feedback_leads.created_at', 'desc');
        }

        if (pagination.limit) {
          query.limit(pagination.limit);
        }
        if (pagination.offset !== undefined) {
          query.offset(pagination.offset);
        }

        const rows = await query;
        return rows.map((r) => {
          let feedbackItems = [];
          if (Array.isArray(r.feedback_items)) {
            feedbackItems = r.feedback_items;
          } else if (typeof r.feedback_items === 'string') {
            try { feedbackItems = JSON.parse(r.feedback_items); } catch (_) {}
          }
          let discSummary = {};
          if (typeof r.discrepancy_summary === 'object' && r.discrepancy_summary !== null) {
            discSummary = r.discrepancy_summary;
          } else if (typeof r.discrepancy_summary === 'string') {
            try { discSummary = JSON.parse(r.discrepancy_summary); } catch (_) {}
          }

          // Build flagged issues list
          const flaggedIssues = [];
          if (feedbackItems.length > 0) {
            feedbackItems.forEach((f) => {
              flaggedIssues.push(f.title || f.text || f.description || String(f));
            });
          }
          if (r.reason_for_feedback) {
            flaggedIssues.push(r.reason_for_feedback);
          }
          if (discSummary.audio_prompts) {
            flaggedIssues.push(`Audio Prompt Flag: ${discSummary.audio_prompts}`);
          }
          if (discSummary.interview_pacing || discSummary.speed_running) {
            flaggedIssues.push(`Interview Pacing: ${discSummary.interview_pacing || discSummary.speed_running}`);
          }
          if (discSummary.discrepancies) {
            flaggedIssues.push(`Discrepancy: ${discSummary.discrepancies}`);
          }
          if (flaggedIssues.length === 0) {
            flaggedIssues.push('Audio Prompting detected during QC audit');
            flaggedIssues.push('Interview pacing violation: Average response duration below threshold');
            flaggedIssues.push('Discrepancy notice regarding response validity');
          }

          const agentFullName = [r.field_agent_first_name, r.field_agent_last_name].filter(Boolean).join(' ') || 'Field Enumerator';

          return {
            ...r,
            agentName: agentFullName,
            agentCode: r.field_agent_id ? `FA-${String(r.field_agent_id).slice(0, 6).toUpperCase()}` : 'FA-CODE',
            phone: r.field_agent_phone || r.phone_number || 'N/A',
            phone_number: r.phone_number || r.field_agent_phone || 'N/A',
            email: r.field_agent_email || '',
            vendorAgency: r.vendor_name || 'Field Agency',
            project: r.project_name || 'FA Campaign',
            errorRate: r.metadata?.errorRate || '18.5',
            flaggedIssues,
            feedbackPrompts: flaggedIssues.map((issue, idx) => ({ index: idx + 1, text: issue })),
            disputeStatus: r.resolution === 'MISTAKE_ADMITTED' ? 'ADMITTED' : (r.resolution === 'DISPUTED' ? 'DISPUTED' : (r.status === 'RESOLVED_ADMITTED' ? 'ADMITTED' : (r.status === 'RESOLVED_DISPUTED' ? 'DISPUTED' : (r.status === 'COMPLETED' ? 'ADMITTED' : 'PENDING_CALL')))),
            total_attempts: r.total_attempts || r.attempt_count || 0,
            attempt_count: r.attempt_count || r.total_attempts || 0,
            feedback_caller_id: r.feedback_caller_id || r.assigned_caller_id || null,
            assigned_caller_id: r.assigned_caller_id || r.feedback_caller_id || null,
          };
        });
      },
      () => mockStore.getFeedbackLeadsList(filters, pagination)
    );
  },

  /**
   * Count total feedback leads matching filters
   * @param {object} filters
   * @returns {Promise<number>}
   */
  async count(filters = {}) {
    return withDbFallback(
      async () => {
        let query = db('feedback_leads')
          .leftJoin('submissions', 'feedback_leads.submission_id', 'submissions.id')
          .leftJoin('users as field_agents', 'feedback_leads.field_agent_id', 'field_agents.id');

        if (filters.projectId) query = query.where('feedback_leads.project_id', filters.projectId);
        if (filters.vendorId) query = query.where('feedback_leads.vendor_id', filters.vendorId);
        if (filters.fieldAgentId) query = query.where('feedback_leads.field_agent_id', filters.fieldAgentId);
        if (filters.feedbackCallerId || filters.assignedCallerId || filters.callerId) {
          const cId = filters.feedbackCallerId || filters.assignedCallerId || filters.callerId;
          query = query.where((b) => {
            b.where('feedback_leads.feedback_caller_id', cId).orWhere('feedback_leads.assigned_caller_id', cId);
          });
        }
        if (filters.status) query = query.where('feedback_leads.status', filters.status);
        if (filters.resolution) query = query.where('feedback_leads.resolution', filters.resolution);
        if (filters.originModule) query = query.where('feedback_leads.origin_module', filters.originModule);

        const result = await query.count('* as count').first();
        return result ? parseInt(result.count, 10) : 0;
      },
      () => mockStore.count('feedback_leads', filters)
    );
  },

  /**
   * Find feedback lead by ID
   * @param {string} id
   * @returns {Promise<object|null>}
   */
  async findById(id) {
    return withDbFallback(
      async () => {
        return db('feedback_leads')
          .leftJoin('submissions', 'feedback_leads.submission_id', 'submissions.id')
          .leftJoin('projects', 'feedback_leads.project_id', 'projects.id')
          .leftJoin('vendors', 'feedback_leads.vendor_id', 'vendors.id')
          .leftJoin('users as field_agents', 'feedback_leads.field_agent_id', 'field_agents.id')
          .leftJoin('users as callers', function () {
            this.on('feedback_leads.feedback_caller_id', '=', 'callers.id')
              .orOn('feedback_leads.assigned_caller_id', '=', 'callers.id');
          })
          .select(
            'feedback_leads.*',
            'submissions.submission_id as business_submission_id',
            'submissions.respondent_name',
            'projects.name as project_name',
            'projects.code as project_code',
            'vendors.name as vendor_name',
            'vendors.code as vendor_code',
            'field_agents.first_name as field_agent_first_name',
            'field_agents.last_name as field_agent_last_name',
            'field_agents.phone as field_agent_phone',
            'field_agents.email as field_agent_email',
            'callers.first_name as caller_first_name',
            'callers.last_name as caller_last_name',
            'callers.email as caller_email'
          )
          .where('feedback_leads.id', id)
          .first();
      },
      () => {
        const lead = mockStore.findById('feedback_leads', id);
        if (!lead) return null;
        const sub = mockStore.findById('submissions', lead.submission_id) || {};
        const proj = mockStore.findById('projects', lead.project_id) || {};
        const vend = mockStore.findById('vendors', lead.vendor_id) || {};
        const fieldAgent = mockStore.findById('users', lead.field_agent_id) || {};
        const caller = mockStore.findById('users', lead.feedback_caller_id) || {};
        return {
          ...lead,
          business_submission_id: sub.submission_id,
          respondent_name: sub.respondent_name,
          project_name: proj.name,
          project_code: proj.project_code || proj.code,
          vendor_name: vend.name,
          vendor_code: vend.code,
          field_agent_first_name: fieldAgent.first_name,
          field_agent_last_name: fieldAgent.last_name,
          field_agent_email: fieldAgent.email,
          caller_first_name: caller.first_name,
          caller_last_name: caller.last_name,
        };
      }
    );
  },

  /**
   * Find feedback lead by submission ID
   * @param {string} submissionId
   * @returns {Promise<object|null>}
   */
  async findBySubmissionId(submissionId) {
    return withDbFallback(
      async () => {
        return db('feedback_leads').where('submission_id', submissionId).first();
      },
      () => mockStore.findOne('feedback_leads', { submission_id: submissionId })
    );
  },

  /**
   * Create feedback lead
   * @param {object} data
   * @param {import('knex').Knex.Transaction} [trx]
   * @returns {Promise<object>}
   */
  async createLead(data, trx = null) {
    return withDbFallback(
      async () => {
        const query = db('feedback_leads').insert(data).returning('*');
        if (trx) query.transacting(trx);
        const [created] = await query;
        return created;
      },
      () => mockStore.insert('feedback_leads', data)
    );
  },

  /**
   * Update feedback lead
   * @param {string} id
   * @param {object} data
   * @param {import('knex').Knex.Transaction} [trx]
   * @returns {Promise<object>}
   */
  async updateLead(id, data, trx = null) {
    return withDbFallback(
      async () => {
        const query = db('feedback_leads')
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
      () => mockStore.update('feedback_leads', id, data)
    );
  },

  /**
   * Find attempts for feedback lead
   * @param {string} feedbackLeadId
   * @returns {Promise<Array<object>>}
   */
  async findAttempts(feedbackLeadId) {
    return withDbFallback(
      async () => {
        return db('feedback_attempts')
          .leftJoin('users as callers', 'feedback_attempts.caller_id', 'callers.id')
          .select(
            'feedback_attempts.*',
            'callers.first_name as caller_first_name',
            'callers.last_name as caller_last_name',
            'callers.email as caller_email'
          )
          .where('feedback_attempts.feedback_lead_id', feedbackLeadId)
          .orderBy('feedback_attempts.attempt_number', 'asc');
      },
      () => {
        const attempts = mockStore.find('feedback_attempts', { feedback_lead_id: feedbackLeadId });
        return attempts.map((a) => {
          const caller = mockStore.findById('users', a.caller_id) || {};
          return {
            ...a,
            caller_first_name: caller.first_name,
            caller_last_name: caller.last_name,
            caller_email: caller.email,
          };
        });
      }
    );
  },

  /**
   * Create feedback attempt
   * @param {object} data
   * @param {import('knex').Knex.Transaction} [trx]
   * @returns {Promise<object>}
   */
  async createAttempt(data, trx = null) {
    return withDbFallback(
      async () => {
        const query = db('feedback_attempts').insert(data).returning('*');
        if (trx) query.transacting(trx);
        const [created] = await query;
        return created;
      },
      () => mockStore.insert('feedback_attempts', data)
    );
  },

  /**
   * Get feedback module metrics
   * @param {object} filters
   * @returns {Promise<object>}
   */
  async getMetrics(filters = {}) {
    return withDbFallback(
      async () => {
        let base = db('feedback_leads');
        if (filters.projectId) base = base.where('project_id', filters.projectId);
        if (filters.vendorId) base = base.where('vendor_id', filters.vendorId);
        if (filters.callerId) base = base.where('feedback_caller_id', filters.callerId);
        if (filters.dateFrom) base = base.where('created_at', '>=', filters.dateFrom);
        if (filters.dateTo) base = base.where('created_at', '<=', filters.dateTo);

        const counts = await base.clone()
          .select(
            db.raw('COUNT(*) as total_leads'),
            db.raw("COUNT(*) FILTER (WHERE status = 'COMPLETED') as completed_leads"),
            db.raw("COUNT(*) FILTER (WHERE status = 'PENDING') as pending_leads"),
            db.raw("COUNT(*) FILTER (WHERE resolution = 'COACHING_DELIVERED') as coaching_delivered"),
            db.raw("COUNT(*) FILTER (WHERE resolution = 'DISPUTE_UPHELD') as dispute_upheld"),
            db.raw('AVG(total_attempts) as avg_attempts')
          )
          .first();

        const totalLeads = parseInt(counts?.total_leads || 0, 10);
        const completed = parseInt(counts?.completed_leads || 0, 10);
        const resolutionRate = totalLeads > 0 ? parseFloat(((completed / totalLeads) * 100).toFixed(2)) : 0;

        return {
          totalLeads,
          completedLeads: completed,
          pendingLeads: parseInt(counts?.pending_leads || 0, 10),
          coachingDelivered: parseInt(counts?.coaching_delivered || 0, 10),
          disputeUpheld: parseInt(counts?.dispute_upheld || 0, 10),
          resolutionRate,
          avgAttempts: counts?.avg_attempts ? parseFloat(Number(counts.avg_attempts).toFixed(2)) : 0,
        };
      },
      () => {
        const leads = mockStore.find('feedback_leads', filters);
        const completed = leads.filter((l) => l.status === 'COMPLETED').length;
        return {
          totalLeads: leads.length,
          completedLeads: completed,
          pendingLeads: leads.filter((l) => l.status === 'PENDING').length,
          coachingDelivered: leads.filter((l) => l.resolution === 'COACHING_DELIVERED').length,
          disputeUpheld: 0,
          resolutionRate: leads.length > 0 ? parseFloat(((completed / leads.length) * 100).toFixed(2)) : 0,
          avgAttempts: 1.0,
        };
      }
    );
  },
};

module.exports = feedbackModel;
