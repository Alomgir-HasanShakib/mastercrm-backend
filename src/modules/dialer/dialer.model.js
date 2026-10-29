/**
 * @file dialer.model.js
 * @description Knex database query methods for dialer_cdr table with mockStore resilience.
 */

const { db, withDbFallback } = require('../../database/connection');
const mockStore = require('../../database/mockStore');

const dialerModel = {
  /**
   * Builds filter query for Dialer CDRs with joins
   * @param {object} filters
   * @returns {import('knex').Knex.QueryBuilder}
   */
  buildFilterQuery(filters = {}) {
    let query = db('dialer_cdr')
      .leftJoin('projects', 'dialer_cdr.project_id', 'projects.id')
      .leftJoin('users as agents', 'dialer_cdr.agent_id', 'agents.id')
      .select(
        'dialer_cdr.*',
        'projects.name as project_name',
        'projects.code as project_code',
        'agents.first_name as agent_first_name',
        'agents.last_name as agent_last_name',
        'agents.email as agent_email'
      );

    if (filters.projectId) {
      query = query.where('dialer_cdr.project_id', filters.projectId);
    }
    if (filters.agentId) {
      query = query.where('dialer_cdr.agent_id', filters.agentId);
    }
    if (filters.module) {
      query = query.where('dialer_cdr.module', filters.module);
    }
    if (filters.status) {
      query = query.where('dialer_cdr.status', filters.status);
    }
    if (filters.provider) {
      query = query.where('dialer_cdr.provider', filters.provider);
    }
    if (filters.direction) {
      query = query.where('dialer_cdr.direction', filters.direction);
    }
    if (filters.dateFrom) {
      query = query.where('dialer_cdr.created_at', '>=', filters.dateFrom);
    }
    if (filters.dateTo) {
      query = query.where('dialer_cdr.created_at', '<=', filters.dateTo);
    }
    if (filters.search) {
      const term = `%${filters.search.toLowerCase()}%`;
      query = query.where((builder) => {
        builder
          .whereRaw('LOWER(dialer_cdr.call_id) LIKE ?', [term])
          .orWhere('dialer_cdr.destination_number', 'LIKE', `%${filters.search}%`)
          .orWhere('dialer_cdr.caller_number', 'LIKE', `%${filters.search}%`)
          .orWhereRaw('LOWER(agents.first_name) LIKE ?', [term])
          .orWhereRaw('LOWER(agents.last_name) LIKE ?', [term]);
      });
    }

    return query;
  },

  /**
   * Find CDRs with pagination
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
          query.orderBy(`dialer_cdr.${pagination.sortBy}`, order);
        } else {
          query.orderBy('dialer_cdr.created_at', 'desc');
        }

        if (pagination.limit) {
          query.limit(pagination.limit);
        }
        if (pagination.offset !== undefined) {
          query.offset(pagination.offset);
        }

        return query;
      },
      () => mockStore.getDialerCdrsList(filters, pagination)
    );
  },

  /**
   * Count total CDRs matching filters
   * @param {object} filters
   * @returns {Promise<number>}
   */
  async count(filters = {}) {
    return withDbFallback(
      async () => {
        let query = db('dialer_cdr');

        if (filters.projectId) query = query.where('project_id', filters.projectId);
        if (filters.agentId) query = query.where('agent_id', filters.agentId);
        if (filters.module) query = query.where('module', filters.module);
        if (filters.status) query = query.where('status', filters.status);
        if (filters.provider) query = query.where('provider', filters.provider);
        if (filters.direction) query = query.where('direction', filters.direction);
        if (filters.dateFrom) query = query.where('created_at', '>=', filters.dateFrom);
        if (filters.dateTo) query = query.where('created_at', '<=', filters.dateTo);

        const result = await query.count('* as count').first();
        return result ? parseInt(result.count, 10) : 0;
      },
      () => mockStore.count('dialer_cdr', filters)
    );
  },

  /**
   * Find CDR by primary ID (UUID)
   * @param {string} id
   * @returns {Promise<object|null>}
   */
  async findById(id) {
    return withDbFallback(
      async () => {
        return db('dialer_cdr')
          .leftJoin('projects', 'dialer_cdr.project_id', 'projects.id')
          .leftJoin('users as agents', 'dialer_cdr.agent_id', 'agents.id')
          .select(
            'dialer_cdr.*',
            'projects.name as project_name',
            'projects.code as project_code',
            'agents.first_name as agent_first_name',
            'agents.last_name as agent_last_name',
            'agents.email as agent_email'
          )
          .where('dialer_cdr.id', id)
          .first();
      },
      () => {
        const cdr = mockStore.findById('dialer_cdr', id);
        if (!cdr) return null;
        const proj = mockStore.findById('projects', cdr.project_id) || {};
        const agent = mockStore.findById('users', cdr.agent_id) || {};
        return {
          ...cdr,
          project_name: proj.name,
          project_code: proj.project_code || proj.code,
          agent_first_name: agent.first_name,
          agent_last_name: agent.last_name,
          agent_email: agent.email,
        };
      }
    );
  },

  /**
   * Find CDR by business call_id
   * @param {string} callId
   * @returns {Promise<object|null>}
   */
  async findByCallId(callId) {
    return withDbFallback(
      async () => {
        return db('dialer_cdr').where('call_id', callId).first();
      },
      () => mockStore.findOne('dialer_cdr', { call_id: callId })
    );
  },

  /**
   * Insert new CDR
   * @param {object} data
   * @param {import('knex').Knex.Transaction} [trx]
   * @returns {Promise<object>}
   */
  async createCdr(data, trx = null) {
    return withDbFallback(
      async () => {
        const query = db('dialer_cdr').insert(data).returning('*');
        if (trx) query.transacting(trx);
        const [created] = await query;
        return created;
      },
      () => mockStore.insert('dialer_cdr', data)
    );
  },

  /**
   * Update CDR by call ID
   * @param {string} callId
   * @param {object} data
   * @param {import('knex').Knex.Transaction} [trx]
   * @returns {Promise<object>}
   */
  async updateCdr(callId, data, trx = null) {
    return withDbFallback(
      async () => {
        const query = db('dialer_cdr')
          .where('call_id', callId)
          .update({
            ...data,
            updated_at: db.fn.now(),
          })
          .returning('*');
        if (trx) query.transacting(trx);
        const [updated] = await query;
        return updated;
      },
      () => mockStore.update('dialer_cdr', callId, data)
    );
  },

  /**
   * Upsert CDR by call_id
   * @param {object} data
   * @param {import('knex').Knex.Transaction} [trx]
   * @returns {Promise<object>}
   */
  async upsertCdr(data, trx = null) {
    const existing = await this.findByCallId(data.call_id);
    if (existing) {
      return this.updateCdr(data.call_id, data, trx);
    }
    return this.createCdr(data, trx);
  },

  /**
   * Get dialer CDR metrics
   * @param {object} filters
   * @returns {Promise<object>}
   */
  async getMetrics(filters = {}) {
    return withDbFallback(
      async () => {
        let base = db('dialer_cdr');
        if (filters.projectId) base = base.where('project_id', filters.projectId);
        if (filters.agentId) base = base.where('agent_id', filters.agentId);
        if (filters.module) base = base.where('module', filters.module);
        if (filters.dateFrom) base = base.where('created_at', '>=', filters.dateFrom);
        if (filters.dateTo) base = base.where('created_at', '<=', filters.dateTo);

        const counts = await base.clone()
          .select(
            db.raw('COUNT(*) as total_calls'),
            db.raw("COUNT(*) FILTER (WHERE status = 'ANSWERED' OR status = 'ENDED') as connected_calls"),
            db.raw("COUNT(*) FILTER (WHERE status = 'FAILED' OR status = 'NO_ANSWER') as failed_calls"),
            db.raw('SUM(duration_seconds) as total_duration_seconds'),
            db.raw('AVG(duration_seconds) as avg_duration_seconds'),
            db.raw('SUM(billable_seconds) as total_billable_seconds')
          )
          .first();

        const total = parseInt(counts?.total_calls || 0, 10);
        const connected = parseInt(counts?.connected_calls || 0, 10);
        const connectRate = total > 0 ? parseFloat(((connected / total) * 100).toFixed(2)) : 0;

        return {
          totalCalls: total,
          connectedCalls: connected,
          failedCalls: parseInt(counts?.failed_calls || 0, 10),
          connectRate,
          totalDurationSeconds: parseInt(counts?.total_duration_seconds || 0, 10),
          avgDurationSeconds: counts?.avg_duration_seconds ? Math.round(Number(counts.avg_duration_seconds)) : 0,
          totalBillableSeconds: parseInt(counts?.total_billable_seconds || 0, 10),
        };
      },
      () => {
        const cdrs = mockStore.find('dialer_cdr', filters);
        const total = cdrs.length;
        const totalDuration = cdrs.reduce((a, c) => a + (Number(c.duration_seconds) || 0), 0);
        return {
          totalCalls: total,
          connectedCalls: total,
          failedCalls: 0,
          connectRate: 100.0,
          totalDurationSeconds: totalDuration,
          avgDurationSeconds: total > 0 ? Math.round(totalDuration / total) : 0,
          totalBillableSeconds: totalDuration,
        };
      }
    );
  },
};

module.exports = dialerModel;
