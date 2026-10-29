/**
 * @file audit-log.model.js
 * @description Knex database query methods for audit_logs table with mockStore resilience.
 */

const { db, withDbFallback } = require('../../database/connection');
const mockStore = require('../../database/mockStore');

const safeJsonParse = (val) => {
  if (val === null || val === undefined) return null;
  if (typeof val === 'object') return val;
  try {
    return JSON.parse(val);
  } catch {
    return val;
  }
};

const auditLogModel = {
  /**
   * Builds base Knex filter query for audit logs
   * @param {object} filters
   * @returns {import('knex').Knex.QueryBuilder}
   */
  buildFilterQuery(filters = {}) {
    let query = db('audit_logs')
      .leftJoin('users', 'audit_logs.user_id', 'users.id')
      .leftJoin('roles', 'users.role_id', 'roles.id')
      .select(
        'audit_logs.*',
        'users.email as user_email',
        'users.first_name as user_first_name',
        'users.last_name as user_last_name',
        'roles.name as user_role'
      );

    if (filters.organizationId) {
      query = query.where('audit_logs.organization_id', filters.organizationId);
    }
    if (filters.userId) {
      query = query.where('audit_logs.user_id', filters.userId);
    }
    if (filters.action && filters.action !== 'ALL') {
      query = query.whereILike('audit_logs.action', `%${filters.action}%`);
    }
    if (filters.entityType && filters.entityType !== 'ALL') {
      query = query.whereILike('audit_logs.entity_type', `%${filters.entityType}%`);
    }
    if (filters.entityId) {
      query = query.where('audit_logs.entity_id', String(filters.entityId));
    }
    if (filters.module && filters.module !== 'ALL') {
      query = query.whereILike('audit_logs.module', `%${filters.module}%`);
    }
    if (filters.dateFrom) {
      query = query.where('audit_logs.created_at', '>=', new Date(filters.dateFrom).toISOString());
    }
    if (filters.dateTo) {
      const dTo = new Date(filters.dateTo);
      if (typeof filters.dateTo === 'string' && filters.dateTo.length <= 10) {
        dTo.setHours(23, 59, 59, 999);
      }
      query = query.where('audit_logs.created_at', '<=', dTo.toISOString());
    }
    if (filters.search && String(filters.search).trim()) {
      const q = `%${String(filters.search).trim()}%`;
      query = query.where((qb) => {
        qb.whereILike('audit_logs.action', q)
          .orWhereILike('audit_logs.module', q)
          .orWhereILike('audit_logs.entity_type', q)
          .orWhereILike('audit_logs.entity_id', q)
          .orWhereILike('users.email', q)
          .orWhereILike('users.first_name', q)
          .orWhereILike('users.last_name', q)
          .orWhereILike('audit_logs.ip_address', q)
          .orWhereRaw('CAST(audit_logs.metadata AS TEXT) ILIKE ?', [q]);
      });
    }

    return query;
  },

  /**
   * Find audit logs matching filters and pagination
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
          query.orderBy(`audit_logs.${pagination.sortBy}`, order);
        } else {
          query.orderBy('audit_logs.created_at', 'desc');
        }

        if (pagination.limit) {
          query.limit(pagination.limit);
        }
        if (pagination.offset !== undefined) {
          query.offset(pagination.offset);
        }

        const rows = await query;
        return rows.map((row) => {
          const fullName = [row.user_first_name, row.user_last_name].filter(Boolean).join(' ').trim();
          return {
            ...row,
            user_name: fullName || row.user_email || 'System User',
            user_email: row.user_email || null,
            user_role: row.user_role || (row.user_id ? 'USER' : 'SYSTEM'),
            metadata: safeJsonParse(row.metadata),
            old_values: safeJsonParse(row.old_values),
            new_values: safeJsonParse(row.new_values),
          };
        });
      },
      () => {
        let all = mockStore.find('audit_logs') || [];
        let enriched = all.map((log) => {
          const u = mockStore.findById('users', log.user_id) || {};
          const fullName = [u.first_name, u.last_name].filter(Boolean).join(' ').trim();
          return {
            ...log,
            user_email: u.email || null,
            user_first_name: u.first_name || null,
            user_last_name: u.last_name || null,
            user_role: u.role || (log.user_id ? 'USER' : 'SYSTEM'),
            user_name: fullName || u.email || 'System User',
            metadata: safeJsonParse(log.metadata),
            old_values: safeJsonParse(log.old_values),
            new_values: safeJsonParse(log.new_values),
          };
        });

        if (filters.organizationId) {
          enriched = enriched.filter((l) => l.organization_id === filters.organizationId);
        }
        if (filters.userId) {
          enriched = enriched.filter((l) => l.user_id === filters.userId);
        }
        if (filters.action && filters.action !== 'ALL') {
          enriched = enriched.filter((l) => l.action?.toLowerCase().includes(filters.action.toLowerCase()));
        }
        if (filters.entityType && filters.entityType !== 'ALL') {
          enriched = enriched.filter((l) => l.entity_type?.toLowerCase().includes(filters.entityType.toLowerCase()));
        }
        if (filters.entityId) {
          enriched = enriched.filter((l) => String(l.entity_id) === String(filters.entityId));
        }
        if (filters.module && filters.module !== 'ALL') {
          enriched = enriched.filter((l) => l.module?.toLowerCase().includes(filters.module.toLowerCase()));
        }
        if (filters.dateFrom) {
          enriched = enriched.filter((l) => new Date(l.created_at) >= new Date(filters.dateFrom));
        }
        if (filters.dateTo) {
          const dTo = new Date(filters.dateTo);
          if (typeof filters.dateTo === 'string' && filters.dateTo.length <= 10) {
            dTo.setHours(23, 59, 59, 999);
          }
          enriched = enriched.filter((l) => new Date(l.created_at) <= dTo);
        }
        if (filters.search && String(filters.search).trim()) {
          const q = String(filters.search).trim().toLowerCase();
          enriched = enriched.filter(
            (l) =>
              (l.action && l.action.toLowerCase().includes(q)) ||
              (l.module && l.module.toLowerCase().includes(q)) ||
              (l.entity_type && l.entity_type.toLowerCase().includes(q)) ||
              (l.entity_id && String(l.entity_id).toLowerCase().includes(q)) ||
              (l.user_email && l.user_email.toLowerCase().includes(q)) ||
              (l.user_name && l.user_name.toLowerCase().includes(q)) ||
              (l.ip_address && l.ip_address.toLowerCase().includes(q)) ||
              (l.metadata && JSON.stringify(l.metadata).toLowerCase().includes(q))
          );
        }

        // Sort
        enriched.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        const offset = pagination.offset || 0;
        const limit = pagination.limit || 25;
        return enriched.slice(offset, offset + limit);
      }
    );
  },

  /**
   * Export all matching audit logs without pagination (up to limit)
   * @param {object} filters
   * @param {number} [maxLimit=10000]
   * @returns {Promise<Array<object>>}
   */
  async exportAll(filters = {}, maxLimit = 10000) {
    return withDbFallback(
      async () => {
        const query = this.buildFilterQuery(filters)
          .orderBy('audit_logs.created_at', 'desc')
          .limit(maxLimit);

        const rows = await query;
        return rows.map((row) => {
          const fullName = [row.user_first_name, row.user_last_name].filter(Boolean).join(' ').trim();
          return {
            ...row,
            user_name: fullName || row.user_email || 'System User',
            user_email: row.user_email || null,
            user_role: row.user_role || (row.user_id ? 'USER' : 'SYSTEM'),
            metadata: safeJsonParse(row.metadata),
            old_values: safeJsonParse(row.old_values),
            new_values: safeJsonParse(row.new_values),
          };
        });
      },
      () => {
        const pagination = { offset: 0, limit: maxLimit };
        return this.findAll(filters, pagination);
      }
    );
  },

  /**
   * Count total audit logs matching filters
   * @param {object} filters
   * @returns {Promise<number>}
   */
  async count(filters = {}) {
    return withDbFallback(
      async () => {
        let query = db('audit_logs')
          .leftJoin('users', 'audit_logs.user_id', 'users.id');

        if (filters.organizationId) query = query.where('audit_logs.organization_id', filters.organizationId);
        if (filters.userId) query = query.where('audit_logs.user_id', filters.userId);
        if (filters.action && filters.action !== 'ALL') query = query.whereILike('audit_logs.action', `%${filters.action}%`);
        if (filters.entityType && filters.entityType !== 'ALL') query = query.whereILike('audit_logs.entity_type', `%${filters.entityType}%`);
        if (filters.entityId) query = query.where('audit_logs.entity_id', String(filters.entityId));
        if (filters.module && filters.module !== 'ALL') query = query.whereILike('audit_logs.module', `%${filters.module}%`);
        if (filters.dateFrom) query = query.where('audit_logs.created_at', '>=', new Date(filters.dateFrom).toISOString());
        if (filters.dateTo) {
          const dTo = new Date(filters.dateTo);
          if (typeof filters.dateTo === 'string' && filters.dateTo.length <= 10) {
            dTo.setHours(23, 59, 59, 999);
          }
          query = query.where('audit_logs.created_at', '<=', dTo.toISOString());
        }
        if (filters.search && String(filters.search).trim()) {
          const q = `%${String(filters.search).trim()}%`;
          query = query.where((qb) => {
            qb.whereILike('audit_logs.action', q)
              .orWhereILike('audit_logs.module', q)
              .orWhereILike('audit_logs.entity_type', q)
              .orWhereILike('audit_logs.entity_id', q)
              .orWhereILike('users.email', q)
              .orWhereILike('users.first_name', q)
              .orWhereILike('users.last_name', q)
              .orWhereILike('audit_logs.ip_address', q)
              .orWhereRaw('CAST(audit_logs.metadata AS TEXT) ILIKE ?', [q]);
          });
        }

        const result = await query.count('* as count').first();
        return result ? parseInt(result.count, 10) : 0;
      },
      () => {
        let all = mockStore.find('audit_logs') || [];
        if (filters.organizationId) all = all.filter((l) => l.organization_id === filters.organizationId);
        if (filters.userId) all = all.filter((l) => l.user_id === filters.userId);
        if (filters.action && filters.action !== 'ALL') all = all.filter((l) => l.action?.toLowerCase().includes(filters.action.toLowerCase()));
        if (filters.entityType && filters.entityType !== 'ALL') all = all.filter((l) => l.entity_type?.toLowerCase().includes(filters.entityType.toLowerCase()));
        if (filters.entityId) all = all.filter((l) => String(l.entity_id) === String(filters.entityId));
        if (filters.module && filters.module !== 'ALL') all = all.filter((l) => l.module?.toLowerCase().includes(filters.module.toLowerCase()));
        if (filters.dateFrom) all = all.filter((l) => new Date(l.created_at) >= new Date(filters.dateFrom));
        if (filters.dateTo) {
          const dTo = new Date(filters.dateTo);
          if (typeof filters.dateTo === 'string' && filters.dateTo.length <= 10) {
            dTo.setHours(23, 59, 59, 999);
          }
          all = all.filter((l) => new Date(l.created_at) <= dTo);
        }
        if (filters.search && String(filters.search).trim()) {
          const q = String(filters.search).trim().toLowerCase();
          all = all.filter(
            (l) =>
              (l.action && l.action.toLowerCase().includes(q)) ||
              (l.module && l.module.toLowerCase().includes(q)) ||
              (l.entity_type && l.entity_type.toLowerCase().includes(q)) ||
              (l.entity_id && String(l.entity_id).toLowerCase().includes(q)) ||
              (l.user_email && l.user_email.toLowerCase().includes(q)) ||
              (l.ip_address && l.ip_address.toLowerCase().includes(q))
          );
        }
        return all.length;
      }
    );
  },

  /**
   * Get KPI statistics for audit log dashboard
   * @param {object} filters
   * @returns {Promise<object>}
   */
  async getStats(filters = {}) {
    return withDbFallback(
      async () => {
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);

        let baseQuery = db('audit_logs');
        if (filters.organizationId) {
          baseQuery = baseQuery.where('organization_id', filters.organizationId);
        }

        const [totalRes, todayRes, userRes, criticalRes] = await Promise.all([
          baseQuery.clone().count('* as count').first(),
          baseQuery.clone().where('created_at', '>=', startOfToday.toISOString()).count('* as count').first(),
          baseQuery.clone().whereNotNull('user_id').countDistinct('user_id as count').first(),
          baseQuery
            .clone()
            .where((qb) => {
              qb.whereILike('action', '%DELETE%')
                .orWhereILike('action', '%SECURITY%')
                .orWhereILike('action', '%ROLE%')
                .orWhereILike('action', '%AUTH%')
                .orWhereILike('action', '%SETTING%')
                .orWhereILike('action', '%SCHEMA%')
                .orWhereILike('action', '%PULL%')
                .orWhereILike('action', '%REJECT%');
            })
            .count('* as count')
            .first(),
        ]);

        return {
          totalActions: parseInt(totalRes?.count || 0, 10),
          todayActions: parseInt(todayRes?.count || 0, 10),
          uniqueUsers: parseInt(userRes?.count || 0, 10),
          criticalActions: parseInt(criticalRes?.count || 0, 10),
        };
      },
      () => {
        let all = mockStore.find('audit_logs') || [];
        if (filters.organizationId) {
          all = all.filter((l) => l.organization_id === filters.organizationId);
        }

        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);

        const totalActions = all.length;
        const todayActions = all.filter((l) => new Date(l.created_at) >= startOfToday).length;
        const userSet = new Set(all.map((l) => l.user_id).filter(Boolean));
        const criticalActions = all.filter((l) => {
          const act = (l.action || '').toUpperCase();
          return (
            act.includes('DELETE') ||
            act.includes('SECURITY') ||
            act.includes('ROLE') ||
            act.includes('AUTH') ||
            act.includes('SETTING') ||
            act.includes('SCHEMA') ||
            act.includes('PULL') ||
            act.includes('REJECT')
          );
        }).length;

        return {
          totalActions,
          todayActions,
          uniqueUsers: userSet.size,
          criticalActions,
        };
      }
    );
  },

  /**
   * Find history for a specific entity
   * @param {string} entityType
   * @param {string} entityId
   * @returns {Promise<Array<object>>}
   */
  async findByEntity(entityType, entityId) {
    return withDbFallback(
      async () => {
        const rows = await db('audit_logs')
          .leftJoin('users', 'audit_logs.user_id', 'users.id')
          .leftJoin('roles', 'users.role_id', 'roles.id')
          .select(
            'audit_logs.*',
            'users.email as user_email',
            'users.first_name as user_first_name',
            'users.last_name as user_last_name',
            'roles.name as user_role'
          )
          .where({
            'audit_logs.entity_type': entityType,
            'audit_logs.entity_id': String(entityId),
          })
          .orderBy('audit_logs.created_at', 'desc');

        return rows.map((row) => {
          const fullName = [row.user_first_name, row.user_last_name].filter(Boolean).join(' ').trim();
          return {
            ...row,
            user_name: fullName || row.user_email || 'System User',
            user_email: row.user_email || null,
            user_role: row.user_role || (row.user_id ? 'USER' : 'SYSTEM'),
            metadata: safeJsonParse(row.metadata),
            old_values: safeJsonParse(row.old_values),
            new_values: safeJsonParse(row.new_values),
          };
        });
      },
      () => {
        const logs = mockStore.find('audit_logs', { entity_type: entityType, entity_id: String(entityId) });
        return logs.map((log) => {
          const u = mockStore.findById('users', log.user_id) || {};
          const fullName = [u.first_name, u.last_name].filter(Boolean).join(' ').trim();
          return {
            ...log,
            user_email: u.email || null,
            user_first_name: u.first_name || null,
            user_last_name: u.last_name || null,
            user_role: u.role || (log.user_id ? 'USER' : 'SYSTEM'),
            user_name: fullName || u.email || 'System User',
            metadata: safeJsonParse(log.metadata),
            old_values: safeJsonParse(log.old_values),
            new_values: safeJsonParse(log.new_values),
          };
        });
      }
    );
  },

  /**
   * Insert new immutable audit log entry
   * @param {object} data
   * @returns {Promise<object>}
   */
  async create(data) {
    const { logOperation } = require('../../middlewares/auditLog.middleware');
    return logOperation(data);
  },
};

module.exports = auditLogModel;
