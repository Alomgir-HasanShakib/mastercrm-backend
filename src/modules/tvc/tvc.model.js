/**
 * @file tvc.model.js
 * @description Knex database query methods for tvc_leads and tvc_attempts tables with mockStore resilience.
 */

const { db, withDbFallback } = require('../../database/connection');
const mockStore = require('../../database/mockStore');

const tvcModel = {
  /**
   * Builds filter query for TVC leads with joins
   * @param {object} filters
   * @returns {import('knex').Knex.QueryBuilder}
   */
  buildFilterQuery(filters = {}) {
    let query = db('tvc_leads')
      .leftJoin('submissions', 'tvc_leads.submission_id', 'submissions.id')
      .leftJoin('projects', 'tvc_leads.project_id', 'projects.id')
      .leftJoin('vendors', 'tvc_leads.vendor_id', 'vendors.id')
      .leftJoin('users as agents', 'tvc_leads.agent_id', 'agents.id')
      .select(
        'tvc_leads.*',
        'submissions.submission_id as business_submission_id',
        'submissions.source_channel',
        'projects.name as project_name',
        'projects.code as project_code',
        'vendors.name as vendor_name',
        'vendors.code as vendor_code',
        'agents.first_name as agent_first_name',
        'agents.last_name as agent_last_name',
        'agents.email as agent_email'
      );

    if (filters.projectId) {
      query = query.where('tvc_leads.project_id', filters.projectId);
    }
    if (filters.vendorId) {
      query = query.where('tvc_leads.vendor_id', filters.vendorId);
    }
    if (filters.agentId) {
      query = query.where((b) => {
        b.where('tvc_leads.agent_id', filters.agentId)
          .orWhere('tvc_leads.assigned_agent_id', filters.agentId);
      });
    }
    if (filters.status) {
      const dbStatus = filters.status === 'VERIFIED' ? 'COMPLETED' : filters.status;
      query = query.where('tvc_leads.status', dbStatus);
    }
    if (filters.verificationStatus) {
      const dbStatus = filters.verificationStatus === 'VERIFIED' ? 'COMPLETED' : filters.verificationStatus;
      query = query.where('tvc_leads.status', dbStatus);
    }
    if (filters.dueCallback) {
      query = query.where('tvc_leads.next_callback_at', '<=', db.fn.now());
    }
    if (filters.search) {
      const term = `%${filters.search.toLowerCase()}%`;
      query = query.where((builder) => {
        builder
          .whereRaw('LOWER(tvc_leads.respondent_name) LIKE ?', [term])
          .orWhere('tvc_leads.phone_number', 'LIKE', `%${filters.search}%`)
          .orWhereRaw('LOWER(submissions.submission_id) LIKE ?', [term])
          .orWhereRaw('LOWER(agents.first_name) LIKE ?', [term])
          .orWhereRaw('LOWER(agents.last_name) LIKE ?', [term]);
      });
    }

    return query;
  },

  /**
   * Find TVC leads with pagination
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
          query.orderBy(`tvc_leads.${pagination.sortBy}`, order);
        } else {
          query.orderBy('tvc_leads.priority', 'desc').orderBy('tvc_leads.created_at', 'asc');
        }

        if (pagination.limit) {
          query.limit(pagination.limit);
        }
        if (pagination.offset !== undefined) {
          query.offset(pagination.offset);
        }

        return query;
      },
      () => mockStore.getTvcLeadsList(filters, pagination)
    );
  },

  /**
   * Count total TVC leads matching filters
   * @param {object} filters
   * @returns {Promise<number>}
   */
  async count(filters = {}) {
    return withDbFallback(
      async () => {
        let query = db('tvc_leads')
          .leftJoin('submissions', 'tvc_leads.submission_id', 'submissions.id')
          .leftJoin('users as agents', 'tvc_leads.agent_id', 'agents.id');

        if (filters.projectId) query = query.where('tvc_leads.project_id', filters.projectId);
        if (filters.vendorId) query = query.where('tvc_leads.vendor_id', filters.vendorId);
        if (filters.agentId) {
          query = query.where((b) => {
            b.where('tvc_leads.agent_id', filters.agentId)
              .orWhere('tvc_leads.assigned_agent_id', filters.agentId);
          });
        }
        if (filters.status) {
          const dbStatus = filters.status === 'VERIFIED' ? 'COMPLETED' : filters.status;
          query = query.where('tvc_leads.status', dbStatus);
        }
        if (filters.verificationStatus) {
          const dbStatus = filters.verificationStatus === 'VERIFIED' ? 'COMPLETED' : filters.verificationStatus;
          query = query.where('tvc_leads.status', dbStatus);
        }
        if (filters.dueCallback) query = query.where('tvc_leads.next_callback_at', '<=', db.fn.now());
        if (filters.search) {
          const term = `%${filters.search.toLowerCase()}%`;
          query = query.where((builder) => {
            builder
              .whereRaw('LOWER(tvc_leads.respondent_name) LIKE ?', [term])
              .orWhere('tvc_leads.phone_number', 'LIKE', `%${filters.search}%`)
              .orWhereRaw('LOWER(submissions.submission_id) LIKE ?', [term])
              .orWhereRaw('LOWER(agents.first_name) LIKE ?', [term])
              .orWhereRaw('LOWER(agents.last_name) LIKE ?', [term]);
          });
        }

        const result = await query.count('* as count').first();
        return result ? parseInt(result.count, 10) : 0;
      },
      () => mockStore.count('tvc_leads', filters)
    );
  },

  /**
   * Find TVC lead by ID
   * @param {string} id
   * @returns {Promise<object|null>}
   */
  async findById(id) {
    return withDbFallback(
      async () => {
        return db('tvc_leads')
          .leftJoin('submissions', 'tvc_leads.submission_id', 'submissions.id')
          .leftJoin('projects', 'tvc_leads.project_id', 'projects.id')
          .leftJoin('vendors', 'tvc_leads.vendor_id', 'vendors.id')
          .leftJoin('users as agents', 'tvc_leads.agent_id', 'agents.id')
          .select(
            'tvc_leads.*',
            'submissions.submission_id as business_submission_id',
            'submissions.source_channel',
            'projects.name as project_name',
            'projects.code as project_code',
            'vendors.name as vendor_name',
            'vendors.code as vendor_code',
            'agents.first_name as agent_first_name',
            'agents.last_name as agent_last_name',
            'agents.email as agent_email'
          )
          .where('tvc_leads.id', id)
          .first();
      },
      () => {
        const lead = mockStore.findById('tvc_leads', id);
        if (!lead) return null;
        const sub = mockStore.findById('submissions', lead.submission_id) || {};
        const proj = mockStore.findById('projects', lead.project_id) || {};
        const vend = mockStore.findById('vendors', lead.vendor_id) || {};
        const agent = mockStore.findById('users', lead.agent_id) || {};
        return {
          ...lead,
          business_submission_id: sub.submission_id,
          project_name: proj.name,
          project_code: proj.project_code || proj.code,
          vendor_name: vend.name,
          vendor_code: vend.code,
          agent_first_name: agent.first_name,
          agent_last_name: agent.last_name,
          agent_email: agent.email,
        };
      }
    );
  },

  /**
   * Find TVC lead by submission ID
   * @param {string} submissionId
   * @returns {Promise<object|null>}
   */
  async findBySubmissionId(submissionId) {
    return withDbFallback(
      async () => {
        return db('tvc_leads').where('submission_id', submissionId).first();
      },
      () => mockStore.findOne('tvc_leads', { submission_id: submissionId })
    );
  },

  /**
   * Get next available queued lead for an agent
   * @param {string} [projectId]
   * @param {string} [vendorId]
   * @returns {Promise<object|null>}
   */
  async getNextQueuedLead(projectId = null, vendorId = null) {
    return withDbFallback(
      async () => {
        let query = db('tvc_leads')
          .whereIn('status', ['QUEUED', 'CALLBACK_SCHEDULED'])
          .where('total_attempts', '<', db.raw('max_attempts'))
          .where((builder) => {
            builder.whereNull('next_callback_at').orWhere('next_callback_at', '<=', db.fn.now());
          })
          .orderBy('priority', 'desc')
          .orderBy('created_at', 'asc');

        if (projectId) query = query.where('project_id', projectId);
        if (vendorId) query = query.where('vendor_id', vendorId);

        return query.first();
      },
      () => {
        const leads = mockStore.find('tvc_leads', (l) => {
          if (projectId && l.project_id !== projectId) return false;
          if (vendorId && l.vendor_id !== vendorId) return false;
          return l.status === 'QUEUED' || l.status === 'CALLBACK_SCHEDULED';
        });
        return leads.length > 0 ? leads[0] : null;
      }
    );
  },

  /**
   * Create TVC lead
   * @param {object} data
   * @param {import('knex').Knex.Transaction} [trx]
   * @returns {Promise<object>}
   */
  async createLead(data, trx = null) {
    return withDbFallback(
      async () => {
        const query = db('tvc_leads').insert(data).returning('*');
        if (trx) query.transacting(trx);
        const [created] = await query;
        return created;
      },
      () => mockStore.insert('tvc_leads', data)
    );
  },

  /**
   * Update TVC lead
   * @param {string} id
   * @param {object} data
   * @param {import('knex').Knex.Transaction} [trx]
   * @returns {Promise<object>}
   */
  async updateLead(id, data, trx = null) {
    return withDbFallback(
      async () => {
        const query = db('tvc_leads')
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
      () => mockStore.update('tvc_leads', id, data)
    );
  },

  /**
   * Find call attempts for a lead
   * @param {string} tvcLeadId
   * @returns {Promise<Array<object>>}
   */
  async findAttempts(tvcLeadId) {
    return withDbFallback(
      async () => {
        return db('tvc_attempts')
          .leftJoin('users as agents', 'tvc_attempts.agent_id', 'agents.id')
          .select(
            'tvc_attempts.*',
            'agents.first_name as agent_first_name',
            'agents.last_name as agent_last_name',
            'agents.email as agent_email'
          )
          .where('tvc_attempts.tvc_lead_id', tvcLeadId)
          .orderBy('tvc_attempts.attempt_number', 'asc');
      },
      () => {
        const attempts = mockStore.find('tvc_attempts', { tvc_lead_id: tvcLeadId });
        return attempts.map((a) => {
          const agent = mockStore.findById('users', a.agent_id) || {};
          return {
            ...a,
            agent_first_name: agent.first_name,
            agent_last_name: agent.last_name,
            agent_email: agent.email,
          };
        });
      }
    );
  },

  /**
   * Record a new TVC attempt
   * @param {object} data
   * @param {import('knex').Knex.Transaction} [trx]
   * @returns {Promise<object>}
   */
  async createAttempt(data, trx = null) {
    return withDbFallback(
      async () => {
        const query = db('tvc_attempts').insert(data).returning('*');
        if (trx) query.transacting(trx);
        const [created] = await query;
        return created;
      },
      () => mockStore.insert('tvc_attempts', data)
    );
  },

  /**
   * Get TVC metrics
   * @param {object} filters
   * @returns {Promise<object>}
   */
  async getMetrics(filters = {}) {
    return withDbFallback(
      async () => {
        let base = db('tvc_leads');
        if (filters.projectId) base = base.where('project_id', filters.projectId);
        if (filters.vendorId) base = base.where('vendor_id', filters.vendorId);
        if (filters.agentId) base = base.where('agent_id', filters.agentId);
        if (filters.dateFrom) base = base.where('created_at', '>=', filters.dateFrom);
        if (filters.dateTo) base = base.where('created_at', '<=', filters.dateTo);

        const counts = await base.clone()
          .select(
            db.raw('COUNT(*) as total_leads'),
            db.raw("COUNT(*) FILTER (WHERE verification_status = 'VERIFIED') as verified_leads"),
            db.raw("COUNT(*) FILTER (WHERE verification_status = 'FAILED') as failed_leads"),
            db.raw("COUNT(*) FILTER (WHERE status = 'MAX_ATTEMPTS_EXCEEDED') as unreachable_leads"),
            db.raw("COUNT(*) FILTER (WHERE status = 'QUEUED') as queued_leads"),
            db.raw("COUNT(*) FILTER (WHERE status = 'CALLBACK_SCHEDULED') as callback_leads"),
            db.raw('AVG(total_attempts) as avg_attempts_per_lead'),
            db.raw('AVG(verification_score) as avg_verification_score')
          )
          .first();

        const totalLeads = parseInt(counts?.total_leads || 0, 10);
        const verified = parseInt(counts?.verified_leads || 0, 10);
        const verificationRate = totalLeads > 0 ? parseFloat(((verified / totalLeads) * 100).toFixed(2)) : 0;

        return {
          totalLeads,
          verifiedLeads: verified,
          failedLeads: parseInt(counts?.failed_leads || 0, 10),
          unreachableLeads: parseInt(counts?.unreachable_leads || 0, 10),
          queuedLeads: parseInt(counts?.queued_leads || 0, 10),
          callbackLeads: parseInt(counts?.callback_leads || 0, 10),
          verificationRate,
          avgAttemptsPerLead: counts?.avg_attempts_per_lead ? parseFloat(Number(counts.avg_attempts_per_lead).toFixed(2)) : 0,
          avgVerificationScore: counts?.avg_verification_score ? parseFloat(Number(counts.avg_verification_score).toFixed(2)) : 0,
        };
      },
      () => {
        const leads = mockStore.find('tvc_leads', filters);
        const verified = leads.filter((l) => l.verification_status === 'VERIFIED').length;
        return {
          totalLeads: leads.length,
          verifiedLeads: verified,
          failedLeads: leads.filter((l) => l.verification_status === 'FAILED').length,
          unreachableLeads: 0,
          queuedLeads: leads.filter((l) => l.status === 'QUEUED').length,
          callbackLeads: 0,
          verificationRate: leads.length > 0 ? parseFloat(((verified / leads.length) * 100).toFixed(2)) : 0,
          avgAttemptsPerLead: 1.2,
          avgVerificationScore: 88.5,
        };
      }
    );
  },
};

module.exports = tvcModel;
