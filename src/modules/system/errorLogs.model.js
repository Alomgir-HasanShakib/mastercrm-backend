/**
 * @file errorLogs.model.js
 * @description Knex database query methods for system error logs with mockStore resilience.
 */

const { v4: uuidv4 } = require('uuid');
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

const safeJsonStringify = (val) => {
  if (val === null || val === undefined) return null;
  if (typeof val === 'string') return val;
  try {
    return JSON.stringify(val);
  } catch {
    return String(val);
  }
};

const errorLogsModel = {
  /**
   * Insert a new error log entry into the database or mockStore.
   *
   * @param {object} logData
   * @returns {Promise<object>} Created error log record
   */
  async create(logData) {
    const record = {
      id: logData.id || uuidv4(),
      correlation_id: logData.correlationId || logData.correlation_id || null,
      organization_id: logData.organizationId || logData.organization_id || null,
      user_id: logData.userId || logData.user_id || null,
      user_email: logData.userEmail || logData.user_email || null,
      user_role: logData.userRole || logData.user_role || null,
      source: (logData.source || 'BACKEND').toUpperCase(),
      path: String(logData.path || '/').slice(0, 1024),
      method: (logData.method || 'GET').toUpperCase().slice(0, 16),
      status_code: parseInt(logData.statusCode || logData.status_code || logData.status || 500, 10),
      error_code: String(logData.errorCode || logData.error_code || 'ERROR').slice(0, 128),
      message: String(logData.message || 'Error occurred'),
      stack: logData.stack ? String(logData.stack) : null,
      details: safeJsonStringify(logData.details),
      ip_address: logData.ipAddress || logData.ip_address || logData.ip || null,
      user_agent: logData.userAgent || logData.user_agent || null,
      created_at: logData.createdAt || logData.created_at || new Date(),
    };

    return withDbFallback(
      async () => {
        try {
          const [inserted] = await db('error_logs').insert(record).returning('*');
          return inserted || record;
        } catch (dbErr) {
          // If table doesn't exist yet, fall back to mockStore
          throw dbErr;
        }
      },
      () => {
        if (!Array.isArray(mockStore.data.error_logs)) {
          mockStore.data.error_logs = [];
        }
        mockStore.data.error_logs.unshift(record);
        // Keep in-memory cache bounded
        if (mockStore.data.error_logs.length > 2000) {
          mockStore.data.error_logs.pop();
        }
        return record;
      }
    );
  },

  /**
   * Builds base Knex filter query for error logs.
   *
   * @param {object} filters
   * @returns {import('knex').Knex.QueryBuilder}
   */
  buildFilterQuery(filters = {}) {
    let query = db('error_logs');

    if (filters.organizationId) {
      query = query.where('organization_id', filters.organizationId);
    }
    if (filters.userId) {
      query = query.where('user_id', filters.userId);
    }
    if (filters.source && filters.source !== 'ALL') {
      query = query.where('source', filters.source.toUpperCase());
    }
    if (filters.method && filters.method !== 'ALL') {
      query = query.where('method', filters.method.toUpperCase());
    }
    if (filters.errorCode && filters.errorCode !== 'ALL') {
      query = query.whereILike('error_code', `%${filters.errorCode}%`);
    }

    // Status code or category filter (e.g. 5xx, 4xx, 404, 500)
    if (filters.statusCode && filters.statusCode !== 'ALL') {
      const statusStr = String(filters.statusCode).toLowerCase();
      if (statusStr === '5xx') {
        query = query.where('status_code', '>=', 500);
      } else if (statusStr === '4xx') {
        query = query.where('status_code', '>=', 400).where('status_code', '<', 500);
      } else if (!isNaN(parseInt(statusStr, 10))) {
        query = query.where('status_code', parseInt(statusStr, 10));
      }
    }

    if (filters.dateFrom) {
      query = query.where('created_at', '>=', new Date(filters.dateFrom));
    }
    if (filters.dateTo) {
      const dTo = new Date(filters.dateTo);
      if (typeof filters.dateTo === 'string' && filters.dateTo.length <= 10) {
        dTo.setHours(23, 59, 59, 999);
      }
      query = query.where('created_at', '<=', dTo);
    }

    if (filters.search && String(filters.search).trim()) {
      const q = `%${String(filters.search).trim()}%`;
      query = query.where((builder) => {
        builder
          .whereILike('message', q)
          .orWhereILike('path', q)
          .orWhereILike('error_code', q)
          .orWhereILike('user_email', q)
          .orWhereILike('ip_address', q);
      });
    }

    return query;
  },

  /**
   * List error logs with pagination and filters.
   *
   * @param {object} filters
   * @param {object} pagination
   * @returns {Promise<Array<object>>}
   */
  async list(filters = {}, pagination = {}) {
    return withDbFallback(
      async () => {
        const query = this.buildFilterQuery(filters)
          .select('*')
          .orderBy(pagination.sortBy || 'created_at', pagination.sortOrder || 'desc')
          .offset(pagination.offset || 0)
          .limit(pagination.limit || 25);

        const rows = await query;
        return rows.map((r) => ({
          ...r,
          details: safeJsonParse(r.details),
        }));
      },
      () => {
        let list = [...(mockStore.data?.error_logs || [])];

        if (filters.organizationId) {
          list = list.filter((l) => l.organization_id === filters.organizationId);
        }
        if (filters.userId) {
          list = list.filter((l) => l.user_id === filters.userId);
        }
        if (filters.source && filters.source !== 'ALL') {
          list = list.filter((l) => l.source === filters.source.toUpperCase());
        }
        if (filters.method && filters.method !== 'ALL') {
          list = list.filter((l) => l.method === filters.method.toUpperCase());
        }
        if (filters.errorCode && filters.errorCode !== 'ALL') {
          list = list.filter((l) => l.error_code?.toLowerCase().includes(filters.errorCode.toLowerCase()));
        }
        if (filters.statusCode && filters.statusCode !== 'ALL') {
          const s = String(filters.statusCode).toLowerCase();
          if (s === '5xx') {
            list = list.filter((l) => l.status_code >= 500);
          } else if (s === '4xx') {
            list = list.filter((l) => l.status_code >= 400 && l.status_code < 500);
          } else if (!isNaN(parseInt(s, 10))) {
            list = list.filter((l) => l.status_code === parseInt(s, 10));
          }
        }
        if (filters.dateFrom) {
          list = list.filter((l) => new Date(l.created_at) >= new Date(filters.dateFrom));
        }
        if (filters.dateTo) {
          const dTo = new Date(filters.dateTo);
          if (typeof filters.dateTo === 'string' && filters.dateTo.length <= 10) {
            dTo.setHours(23, 59, 59, 999);
          }
          list = list.filter((l) => new Date(l.created_at) <= dTo);
        }
        if (filters.search && String(filters.search).trim()) {
          const q = String(filters.search).trim().toLowerCase();
          list = list.filter(
            (l) =>
              (l.message && l.message.toLowerCase().includes(q)) ||
              (l.path && l.path.toLowerCase().includes(q)) ||
              (l.error_code && l.error_code.toLowerCase().includes(q)) ||
              (l.user_email && l.user_email.toLowerCase().includes(q)) ||
              (l.ip_address && l.ip_address.toLowerCase().includes(q)) ||
              String(l.status_code).includes(q)
          );
        }

        list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        const offset = pagination.offset || 0;
        const limit = pagination.limit || 25;
        return list.slice(offset, offset + limit).map((r) => ({
          ...r,
          details: safeJsonParse(r.details),
        }));
      }
    );
  },

  /**
   * Count total error logs matching filters.
   *
   * @param {object} filters
   * @returns {Promise<number>}
   */
  async count(filters = {}) {
    return withDbFallback(
      async () => {
        const query = this.buildFilterQuery(filters);
        const res = await query.count('* as count').first();
        return res ? parseInt(res.count, 10) : 0;
      },
      () => {
        // Use list filtering logic without slice
        let list = [...(mockStore.data?.error_logs || [])];
        if (filters.organizationId) list = list.filter((l) => l.organization_id === filters.organizationId);
        if (filters.userId) list = list.filter((l) => l.user_id === filters.userId);
        if (filters.source && filters.source !== 'ALL') list = list.filter((l) => l.source === filters.source.toUpperCase());
        if (filters.method && filters.method !== 'ALL') list = list.filter((l) => l.method === filters.method.toUpperCase());
        if (filters.errorCode && filters.errorCode !== 'ALL') list = list.filter((l) => l.error_code?.toLowerCase().includes(filters.errorCode.toLowerCase()));
        if (filters.statusCode && filters.statusCode !== 'ALL') {
          const s = String(filters.statusCode).toLowerCase();
          if (s === '5xx') list = list.filter((l) => l.status_code >= 500);
          else if (s === '4xx') list = list.filter((l) => l.status_code >= 400 && l.status_code < 500);
          else if (!isNaN(parseInt(s, 10))) list = list.filter((l) => l.status_code === parseInt(s, 10));
        }
        if (filters.dateFrom) list = list.filter((l) => new Date(l.created_at) >= new Date(filters.dateFrom));
        if (filters.dateTo) {
          const dTo = new Date(filters.dateTo);
          if (typeof filters.dateTo === 'string' && filters.dateTo.length <= 10) dTo.setHours(23, 59, 59, 999);
          list = list.filter((l) => new Date(l.created_at) <= dTo);
        }
        if (filters.search && String(filters.search).trim()) {
          const q = String(filters.search).trim().toLowerCase();
          list = list.filter((l) =>
            (l.message && l.message.toLowerCase().includes(q)) ||
            (l.path && l.path.toLowerCase().includes(q)) ||
            (l.error_code && l.error_code.toLowerCase().includes(q)) ||
            (l.user_email && l.user_email.toLowerCase().includes(q)) ||
            (l.ip_address && l.ip_address.toLowerCase().includes(q)) ||
            String(l.status_code).includes(q)
          );
        }
        return list.length;
      }
    );
  },

  /**
   * Retrieve error statistics for the dashboard.
   *
   * @param {object} filters
   * @returns {Promise<object>}
   */
  async getStats(filters = {}) {
    return withDbFallback(
      async () => {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const [
          totalRes,
          total5xxRes,
          total4xxRes,
          frontendRes,
          backendRes,
          todayRes,
        ] = await Promise.all([
          db('error_logs').count('* as count').first(),
          db('error_logs').where('status_code', '>=', 500).count('* as count').first(),
          db('error_logs').where('status_code', '>=', 400).where('status_code', '<', 500).count('* as count').first(),
          db('error_logs').where('source', 'FRONTEND').count('* as count').first(),
          db('error_logs').where('source', 'BACKEND').count('* as count').first(),
          db('error_logs').where('created_at', '>=', todayStart).count('* as count').first(),
        ]);

        const topEndpoints = await db('error_logs')
          .select('path', 'method')
          .count('* as count')
          .groupBy('path', 'method')
          .orderBy('count', 'desc')
          .limit(5);

        const topErrorCodes = await db('error_logs')
          .select('error_code')
          .count('* as count')
          .groupBy('error_code')
          .orderBy('count', 'desc')
          .limit(5);

        return {
          totalErrors: parseInt(totalRes?.count || 0, 10),
          total5xx: parseInt(total5xxRes?.count || 0, 10),
          total4xx: parseInt(total4xxRes?.count || 0, 10),
          frontendErrors: parseInt(frontendRes?.count || 0, 10),
          backendErrors: parseInt(backendRes?.count || 0, 10),
          todayErrors: parseInt(todayRes?.count || 0, 10),
          topEndpoints: topEndpoints.map((e) => ({
            path: e.path,
            method: e.method,
            count: parseInt(e.count, 10),
          })),
          topErrorCodes: topErrorCodes.map((c) => ({
            code: c.error_code,
            count: parseInt(c.count, 10),
          })),
        };
      },
      () => {
        const all = mockStore.data?.error_logs || [];
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const total5xx = all.filter((l) => l.status_code >= 500).length;
        const total4xx = all.filter((l) => l.status_code >= 400 && l.status_code < 500).length;
        const frontendErrors = all.filter((l) => l.source === 'FRONTEND').length;
        const backendErrors = all.filter((l) => l.source === 'BACKEND').length;
        const todayErrors = all.filter((l) => new Date(l.created_at) >= todayStart).length;

        // Top endpoints
        const endpointCounts = {};
        all.forEach((l) => {
          const key = `${l.method || 'GET'} ${l.path || '/'}`;
          endpointCounts[key] = (endpointCounts[key] || 0) + 1;
        });
        const topEndpoints = Object.entries(endpointCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([key, count]) => {
            const [method, ...rest] = key.split(' ');
            return { method, path: rest.join(' '), count };
          });

        // Top error codes
        const codeCounts = {};
        all.forEach((l) => {
          const code = l.error_code || 'UNKNOWN';
          codeCounts[code] = (codeCounts[code] || 0) + 1;
        });
        const topErrorCodes = Object.entries(codeCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([code, count]) => ({ code, count }));

        return {
          totalErrors: all.length,
          total5xx,
          total4xx,
          frontendErrors,
          backendErrors,
          todayErrors,
          topEndpoints,
          topErrorCodes,
        };
      }
    );
  },

  /**
   * Export all error logs up to limit.
   *
   * @param {object} filters
   * @param {number} [maxLimit=5000]
   * @returns {Promise<Array<object>>}
   */
  async exportAll(filters = {}, maxLimit = 5000) {
    return withDbFallback(
      async () => {
        const query = this.buildFilterQuery(filters)
          .select('*')
          .orderBy('created_at', 'desc')
          .limit(maxLimit);

        const rows = await query;
        return rows.map((r) => ({
          ...r,
          details: safeJsonParse(r.details),
        }));
      },
      () => {
        const logs = mockStore.data?.error_logs || [];
        return logs.slice(0, maxLimit).map((r) => ({
          ...r,
          details: safeJsonParse(r.details),
        }));
      }
    );
  },

  /**
   * Delete error logs matching filters or clear all.
   *
   * @param {object} filters
   * @returns {Promise<number>} Count of deleted records
   */
  async clear(filters = {}) {
    return withDbFallback(
      async () => {
        let query = db('error_logs');
        if (filters.olderThanDays) {
          const cutoff = new Date(Date.now() - filters.olderThanDays * 86400000);
          query = query.where('created_at', '<', cutoff);
        } else if (filters.source && filters.source !== 'ALL') {
          query = query.where('source', filters.source.toUpperCase());
        }
        return query.del();
      },
      () => {
        const initial = (mockStore.data?.error_logs || []).length;
        if (filters.olderThanDays) {
          const cutoff = new Date(Date.now() - filters.olderThanDays * 86400000);
          mockStore.data.error_logs = (mockStore.data?.error_logs || []).filter((l) => new Date(l.created_at) >= cutoff);
        } else if (filters.source && filters.source !== 'ALL') {
          mockStore.data.error_logs = (mockStore.data?.error_logs || []).filter((l) => l.source !== filters.source.toUpperCase());
        } else {
          mockStore.data.error_logs = [];
        }
        return initial - (mockStore.data?.error_logs || []).length;
      }
    );
  },
};

module.exports = errorLogsModel;
