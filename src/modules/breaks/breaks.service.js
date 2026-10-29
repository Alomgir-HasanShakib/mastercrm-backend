/**
 * @file breaks.service.js
 * @description Operational Break & Productivity Management Service.
 * Handles starting, ending, and live tracking of agent breaks,
 * lockout states, today's breakdown, and admin monitoring reports.
 */

const { v4: uuidv4 } = require('uuid');
const { db, withDbFallback } = require('../../database/connection');
const mockStore = require('../../database/mockStore');
const { ValidationError } = require('../../utils/errors');

// Canonical Break Types
const BREAK_TYPES = {
  TEA: { code: 'TEA', label: 'Tea Break ☕', icon: '☕' },
  LUNCH: { code: 'LUNCH', label: 'Lunch Break 🍱', icon: '🍱' },
  BIO: { code: 'BIO', label: 'Bio / Personal Break 🚻', icon: '🚻' },
  MEETING: { code: 'MEETING', label: 'Meeting / Coaching Break 👥', icon: '👥' },
};

/**
 * Normalizes input string to a canonical break type
 */
function normalizeBreakType(input) {
  if (!input) return BREAK_TYPES.BIO;
  const str = String(input).trim().toUpperCase();
  if (str.includes('TEA') || str.includes('☕')) return BREAK_TYPES.TEA;
  if (str.includes('LUNCH') || str.includes('🍱')) return BREAK_TYPES.LUNCH;
  if (str.includes('BIO') || str.includes('PERSONAL') || str.includes('🚻')) return BREAK_TYPES.BIO;
  if (str.includes('MEETING') || str.includes('COACHING') || str.includes('👥')) return BREAK_TYPES.MEETING;
  return { code: input, label: input, icon: '⏱️' };
}

/**
 * Helper to get start and end boundaries for today
 */
function getTodayRange(customDateStr) {
  const base = customDateStr ? new Date(customDateStr) : new Date();
  const start = new Date(base);
  start.setHours(0, 0, 0, 0);
  const end = new Date(base);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

/**
 * Enriches user data from mockStore
 */
function enrichUserFromMock(userId) {
  const users = mockStore.data.users || [];
  const roles = mockStore.data.roles || [];
  const vendors = mockStore.data.vendors || [];

  const user = users.find((u) => u.id === userId);
  if (!user) {
    return {
      id: userId,
      firstName: 'Unknown',
      lastName: 'Agent',
      fullName: 'Agent ' + (userId ? userId.slice(0, 8) : ''),
      email: 'agent@crm.local',
      role: 'AGENT',
      vendorName: 'Direct Operations',
      employeeCode: 'EMP-' + (userId ? userId.slice(0, 6) : ''),
    };
  }

  const role = roles.find((r) => r.id === user.role_id);
  const vendor = vendors.find((v) => v.id === user.vendor_id);

  return {
    id: user.id,
    firstName: user.first_name,
    lastName: user.last_name,
    fullName: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email,
    email: user.email,
    role: role?.slug || user.role || 'AGENT',
    vendorName: vendor?.name || 'Direct Operations',
    employeeCode: user.employee_code || `EMP-${user.id.slice(0, 6)}`,
  };
}

/**
 * Formats a break record for clean API delivery
 */
function formatBreakRecord(row, userDetails = null) {
  if (!row) return null;
  const breakTypeInfo = normalizeBreakType(row.break_type || row.breakType);
  const startTime = row.start_time ? new Date(row.start_time).toISOString() : null;
  const endTime = row.end_time ? new Date(row.end_time).toISOString() : null;

  const isActive = row.status === 'ACTIVE' || !endTime;
  const elapsedSeconds = isActive && startTime
    ? Math.max(0, Math.round((Date.now() - new Date(startTime).getTime()) / 1000))
    : Number(row.duration_seconds || 0);

  const elapsedMinutes = Math.round(elapsedSeconds / 60);

  return {
    id: row.id,
    userId: row.user_id || row.userId,
    organizationId: row.organization_id || row.organizationId,
    breakType: breakTypeInfo.code,
    breakTypeLabel: row.break_type_label || breakTypeInfo.label,
    icon: breakTypeInfo.icon,
    startTime,
    endTime,
    durationSeconds: elapsedSeconds,
    durationMinutes: elapsedMinutes,
    status: isActive ? 'ACTIVE' : 'COMPLETED',
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : startTime,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : (endTime || startTime),
    ...(userDetails ? { user: userDetails } : {}),
  };
}

const breaksService = {
  /**
   * Start a new break for current user.
   * Throws ValidationError if the user already has an active break.
   */
  async startBreak(userContext, payload = {}) {
    const userId = userContext.userId || userContext.id;
    const organizationId = userContext.organizationId || userContext.organization_id;
    const { breakType } = payload;

    if (!userId) {
      throw new ValidationError('User identification is missing.');
    }

    const typeInfo = normalizeBreakType(breakType);

    return withDbFallback(
      // DB Action
      async () => {
        // Check for active break
        const existing = await db('agent_breaks')
          .where({ user_id: userId, status: 'ACTIVE' })
          .first();

        if (existing) {
          throw new ValidationError('An active break is already in progress.');
        }

        const newId = uuidv4();
        const now = new Date();

        const [created] = await db('agent_breaks')
          .insert({
            id: newId,
            user_id: userId,
            organization_id: organizationId || null,
            break_type: typeInfo.code,
            break_type_label: typeInfo.label,
            start_time: now,
            end_time: null,
            duration_seconds: 0,
            duration_minutes: 0,
            status: 'ACTIVE',
            created_at: now,
            updated_at: now,
          })
          .returning('*');

        return formatBreakRecord(created || {
          id: newId,
          user_id: userId,
          organization_id: organizationId,
          break_type: typeInfo.code,
          break_type_label: typeInfo.label,
          start_time: now,
          status: 'ACTIVE',
        });
      },
      // Mock Store Fallback
      () => {
        if (!mockStore.data.agent_breaks) {
          mockStore.data.agent_breaks = [];
        }

        const existing = mockStore.data.agent_breaks.find(
          (b) => b.user_id === userId && (b.status === 'ACTIVE' || !b.end_time)
        );

        if (existing) {
          throw new ValidationError('An active break is already in progress.');
        }

        const now = new Date();
        const newBreak = {
          id: uuidv4(),
          user_id: userId,
          organization_id: organizationId || null,
          break_type: typeInfo.code,
          break_type_label: typeInfo.label,
          start_time: now,
          end_time: null,
          duration_seconds: 0,
          duration_minutes: 0,
          status: 'ACTIVE',
          created_at: now,
          updated_at: now,
        };

        mockStore.data.agent_breaks.unshift(newBreak);
        return formatBreakRecord(newBreak);
      }
    );
  },

  /**
   * Conclude / End currently active break for current user.
   * Throws ValidationError if no active break is found.
   */
  async endBreak(userContext) {
    const userId = userContext.userId || userContext.id;

    if (!userId) {
      throw new ValidationError('User identification is missing.');
    }

    return withDbFallback(
      // DB Action
      async () => {
        let active = await db('agent_breaks')
          .where({ user_id: userId, status: 'ACTIVE' })
          .orderBy('start_time', 'desc')
          .first();

        if (!active && mockStore.data?.agent_breaks?.some((b) => b.user_id === userId && b.status === 'ACTIVE')) {
          const mockActive = mockStore.data.agent_breaks.find((b) => b.user_id === userId && b.status === 'ACTIVE');
          if (mockActive) {
            const now = new Date();
            const start = new Date(mockActive.start_time);
            mockActive.end_time = now;
            mockActive.duration_seconds = Math.max(0, Math.round((now.getTime() - start.getTime()) / 1000));
            mockActive.duration_minutes = Math.max(1, Math.round(mockActive.duration_seconds / 60));
            mockActive.status = 'COMPLETED';
            return {
              completedBreak: formatBreakRecord(mockActive),
              todayTotalBreakMinutes: mockActive.duration_minutes,
              todayBreaksCount: 1,
            };
          }
        }

        if (!active) {
          throw new ValidationError('No active break found for user.');
        }

        const now = new Date();
        const start = new Date(active.start_time);
        const durationSeconds = Math.max(0, Math.round((now.getTime() - start.getTime()) / 1000));
        const durationMinutes = Math.max(1, Math.round(durationSeconds / 60));

        const [updated] = await db('agent_breaks')
          .where({ id: active.id })
          .update({
            end_time: now,
            duration_seconds: durationSeconds,
            duration_minutes: durationMinutes,
            status: 'COMPLETED',
            updated_at: now,
          })
          .returning('*');

        // Calculate today totals
        const { start: todayStart, end: todayEnd } = getTodayRange();
        const todayBreaks = await db('agent_breaks')
          .where({ user_id: userId })
          .where('start_time', '>=', todayStart)
          .where('start_time', '<=', todayEnd);

        const todayTotalBreakMinutes = todayBreaks.reduce(
          (acc, b) => acc + Number(b.duration_minutes || 0),
          0
        );

        return {
          completedBreak: formatBreakRecord(updated || {
            ...active,
            end_time: now,
            duration_seconds: durationSeconds,
            duration_minutes: durationMinutes,
            status: 'COMPLETED',
          }),
          todayTotalBreakMinutes,
          todayBreaksCount: todayBreaks.length,
        };
      },
      // Mock Store Fallback
      () => {
        if (!mockStore.data.agent_breaks) {
          mockStore.data.agent_breaks = [];
        }

        const active = mockStore.data.agent_breaks.find(
          (b) => b.user_id === userId && (b.status === 'ACTIVE' || !b.end_time)
        );

        if (!active) {
          throw new ValidationError('No active break found for user.');
        }

        const now = new Date();
        const start = new Date(active.start_time);
        const durationSeconds = Math.max(0, Math.round((now.getTime() - start.getTime()) / 1000));
        const durationMinutes = Math.max(1, Math.round(durationSeconds / 60));

        active.end_time = now;
        active.duration_seconds = durationSeconds;
        active.duration_minutes = durationMinutes;
        active.status = 'COMPLETED';
        active.updated_at = now;

        const { start: todayStart, end: todayEnd } = getTodayRange();
        const todayBreaks = mockStore.data.agent_breaks.filter((b) => {
          if (b.user_id !== userId) return false;
          const st = new Date(b.start_time);
          return st >= todayStart && st <= todayEnd;
        });

        const todayTotalBreakMinutes = todayBreaks.reduce(
          (acc, b) => acc + Number(b.duration_minutes || 0),
          0
        );

        return {
          completedBreak: formatBreakRecord(active),
          todayTotalBreakMinutes,
          todayBreaksCount: todayBreaks.length,
        };
      }
    );
  },

  /**
   * Get current user's active break status and today's break history.
   */
  async getMyTodayBreaks(userContext) {
    const userId = userContext.userId || userContext.id;

    if (!userId) {
      throw new ValidationError('User identification is missing.');
    }

    const { start: todayStart, end: todayEnd } = getTodayRange();

    return withDbFallback(
      // DB Action
      async () => {
        let rows = await db('agent_breaks')
          .where({ user_id: userId })
          .where((builder) => {
            builder
              .whereBetween('start_time', [todayStart, todayEnd])
              .orWhere('status', 'ACTIVE');
          })
          .orderBy('start_time', 'desc');

        if (rows.length === 0 && mockStore.data?.agent_breaks?.some((b) => b.user_id === userId)) {
          rows = mockStore.data.agent_breaks.filter((b) => b.user_id === userId);
        }

        let activeBreak = null;
        const formattedList = [];
        let todayTotalSeconds = 0;
        const breakCountsByType = { TEA: 0, LUNCH: 0, BIO: 0, MEETING: 0 };

        for (const row of rows) {
          const rec = formatBreakRecord(row);
          if (rec.status === 'ACTIVE' && !activeBreak) {
            activeBreak = rec;
          }
          formattedList.push(rec);
          todayTotalSeconds += rec.durationSeconds;

          if (breakCountsByType[rec.breakType] !== undefined) {
            breakCountsByType[rec.breakType] += 1;
          } else {
            breakCountsByType[rec.breakType] = 1;
          }
        }

        const todayTotalMinutes = Math.round(todayTotalSeconds / 60);

        return {
          activeBreak,
          todayBreaks: formattedList,
          todayTotalMinutes,
          todayTotalSeconds,
          breakCountsByType,
        };
      },
      // Mock Fallback
      () => {
        if (!mockStore.data.agent_breaks) {
          mockStore.data.agent_breaks = [];
        }

        const userBreaks = mockStore.data.agent_breaks.filter((b) => {
          if (b.user_id !== userId) return false;
          if (b.status === 'ACTIVE' || !b.end_time) return true;
          const st = new Date(b.start_time);
          return st >= todayStart && st <= todayEnd;
        });

        // Sort desc
        userBreaks.sort((a, b) => new Date(b.start_time) - new Date(a.start_time));

        let activeBreak = null;
        const formattedList = [];
        let todayTotalSeconds = 0;
        const breakCountsByType = { TEA: 0, LUNCH: 0, BIO: 0, MEETING: 0 };

        for (const item of userBreaks) {
          const rec = formatBreakRecord(item);
          if (rec.status === 'ACTIVE' && !activeBreak) {
            activeBreak = rec;
          }
          formattedList.push(rec);
          todayTotalSeconds += rec.durationSeconds;

          if (breakCountsByType[rec.breakType] !== undefined) {
            breakCountsByType[rec.breakType] += 1;
          } else {
            breakCountsByType[rec.breakType] = 1;
          }
        }

        const todayTotalMinutes = Math.round(todayTotalSeconds / 60);

        return {
          activeBreak,
          todayBreaks: formattedList,
          todayTotalMinutes,
          todayTotalSeconds,
          breakCountsByType,
        };
      }
    );
  },

  /**
   * Live currently active breaks across all operational agents.
   */
  async getAdminLiveBreaks() {
    return withDbFallback(
      // DB Action
      async () => {
        const rows = await db('agent_breaks')
          .leftJoin('users', 'agent_breaks.user_id', 'users.id')
          .leftJoin('roles', 'users.role_id', 'roles.id')
          .leftJoin('vendors', 'users.vendor_id', 'vendors.id')
          .where('agent_breaks.status', 'ACTIVE')
          .select(
            'agent_breaks.*',
            'users.first_name',
            'users.last_name',
            'users.email',
            'users.employee_code',
            'roles.slug as role_slug',
            'vendors.name as vendor_name'
          )
          .orderBy('agent_breaks.start_time', 'asc');

        const activeBreaks = rows.map((r) => {
          const userDetails = {
            id: r.user_id,
            firstName: r.first_name,
            lastName: r.last_name,
            fullName: `${r.first_name || ''} ${r.last_name || ''}`.trim() || r.email,
            email: r.email,
            role: r.role_slug || 'AGENT',
            vendorName: r.vendor_name || 'Direct Operations',
            employeeCode: r.employee_code || `EMP-${(r.user_id || '').slice(0, 6)}`,
          };
          return formatBreakRecord(r, userDetails);
        });

        return {
          activeBreaks,
          count: activeBreaks.length,
        };
      },
      // Mock Fallback
      () => {
        if (!mockStore.data.agent_breaks) {
          mockStore.data.agent_breaks = [];
        }

        const activeItems = mockStore.data.agent_breaks.filter(
          (b) => b.status === 'ACTIVE' || !b.end_time
        );

        activeItems.sort((a, b) => new Date(a.start_time) - new Date(b.start_time));

        const activeBreaks = activeItems.map((b) => {
          const userDetails = enrichUserFromMock(b.user_id);
          return formatBreakRecord(b, userDetails);
        });

        return {
          activeBreaks,
          count: activeBreaks.length,
        };
      }
    );
  },

  /**
   * Comprehensive Break & Productivity Audit Reports for Admin/Super Admin.
   * Supports date filtering, user search, pagination, and statistical summaries.
   */
  async getAdminBreakReports(queryParams = {}) {
    const {
      date,
      startDate,
      endDate,
      search,
      breakType,
      status,
      page = 1,
      limit = 25,
    } = queryParams;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));

    // Determine date boundaries
    let filterStart = null;
    let filterEnd = null;

    if (startDate && endDate) {
      filterStart = new Date(startDate);
      filterStart.setHours(0, 0, 0, 0);
      filterEnd = new Date(endDate);
      filterEnd.setHours(23, 59, 59, 999);
    } else if (date) {
      const range = getTodayRange(date);
      filterStart = range.start;
      filterEnd = range.end;
    }

    return withDbFallback(
      // DB Action
      async () => {
        let baseQuery = db('agent_breaks')
          .leftJoin('users', 'agent_breaks.user_id', 'users.id')
          .leftJoin('roles', 'users.role_id', 'roles.id')
          .leftJoin('vendors', 'users.vendor_id', 'vendors.id');

        if (filterStart && filterEnd) {
          baseQuery = baseQuery.whereBetween('agent_breaks.start_time', [filterStart, filterEnd]);
        }

        if (breakType && breakType !== 'ALL') {
          const norm = normalizeBreakType(breakType);
          baseQuery = baseQuery.where('agent_breaks.break_type', norm.code);
        }

        if (status && status !== 'ALL') {
          baseQuery = baseQuery.where('agent_breaks.status', status);
        }

        if (search) {
          const term = `%${search.toLowerCase().trim()}%`;
          baseQuery = baseQuery.where((builder) => {
            builder
              .whereRaw('LOWER(users.first_name) LIKE ?', [term])
              .orWhereRaw('LOWER(users.last_name) LIKE ?', [term])
              .orWhereRaw('LOWER(users.email) LIKE ?', [term])
              .orWhereRaw('LOWER(users.employee_code) LIKE ?', [term])
              .orWhereRaw('LOWER(roles.slug) LIKE ?', [term]);
          });
        }

        // Clone for count and all records for summary calculations
        const allMatching = await baseQuery
          .clone()
          .select(
            'agent_breaks.*',
            'users.first_name',
            'users.last_name',
            'users.email',
            'users.employee_code',
            'roles.slug as role_slug',
            'vendors.name as vendor_name'
          )
          .orderBy('agent_breaks.start_time', 'desc');

        const total = allMatching.length;
        const totalPages = Math.ceil(total / limitNum) || 1;
        const offset = (pageNum - 1) * limitNum;
        const pageRows = allMatching.slice(offset, offset + limitNum);

        const records = pageRows.map((r) => {
          const userDetails = {
            id: r.user_id,
            firstName: r.first_name,
            lastName: r.last_name,
            fullName: `${r.first_name || ''} ${r.last_name || ''}`.trim() || r.email,
            email: r.email,
            role: r.role_slug || 'AGENT',
            vendorName: r.vendor_name || 'Direct Operations',
            employeeCode: r.employee_code || `EMP-${(r.user_id || '').slice(0, 6)}`,
          };
          return formatBreakRecord(r, userDetails);
        });

        // Compute summary metrics across all matching records
        const agentMap = new Map();
        let totalBreakMinutes = 0;
        let activeBreaksCount = 0;
        const breakdownByType = { TEA: 0, LUNCH: 0, BIO: 0, MEETING: 0 };

        for (const row of allMatching) {
          const formatted = formatBreakRecord(row);
          totalBreakMinutes += formatted.durationMinutes;

          if (formatted.status === 'ACTIVE') {
            activeBreaksCount += 1;
          }

          if (breakdownByType[formatted.breakType] !== undefined) {
            breakdownByType[formatted.breakType] += 1;
          } else {
            breakdownByType[formatted.breakType] = 1;
          }

          // Group by agent
          const uId = row.user_id;
          if (!agentMap.has(uId)) {
            agentMap.set(uId, {
              userId: uId,
              userName: `${row.first_name || ''} ${row.last_name || ''}`.trim() || row.email,
              userEmail: row.email,
              userRole: row.role_slug || 'AGENT',
              vendorName: row.vendor_name || 'Direct Operations',
              breakCount: 0,
              totalMinutes: 0,
              currentlyOnBreak: false,
              activeBreakType: null,
              activeStartTime: null,
            });
          }

          const ag = agentMap.get(uId);
          ag.breakCount += 1;
          ag.totalMinutes += formatted.durationMinutes;
          if (formatted.status === 'ACTIVE') {
            ag.currentlyOnBreak = true;
            ag.activeBreakType = formatted.breakTypeLabel;
            ag.activeStartTime = formatted.startTime;
          }
        }

        return {
          records,
          pagination: {
            page: pageNum,
            limit: limitNum,
            total,
            totalPages,
          },
          summary: {
            totalBreakRecords: total,
            totalBreakMinutes,
            activeBreaksCount,
            agentsCount: agentMap.size,
            breakdownByType,
            summaryByAgent: Array.from(agentMap.values()).sort((a, b) => b.totalMinutes - a.totalMinutes),
          },
        };
      },
      // Mock Fallback
      () => {
        if (!mockStore.data.agent_breaks) {
          mockStore.data.agent_breaks = [];
        }

        let items = [...mockStore.data.agent_breaks];

        if (filterStart && filterEnd) {
          items = items.filter((b) => {
            const st = new Date(b.start_time);
            return st >= filterStart && st <= filterEnd;
          });
        }

        if (breakType && breakType !== 'ALL') {
          const norm = normalizeBreakType(breakType);
          items = items.filter((b) => (b.break_type || b.breakType) === norm.code);
        }

        if (status && status !== 'ALL') {
          items = items.filter((b) => {
            const st = b.status || (b.end_time ? 'COMPLETED' : 'ACTIVE');
            return st === status;
          });
        }

        // Search filter
        if (search) {
          const term = search.toLowerCase().trim();
          items = items.filter((b) => {
            const user = enrichUserFromMock(b.user_id);
            return (
              user.fullName.toLowerCase().includes(term) ||
              user.email.toLowerCase().includes(term) ||
              user.role.toLowerCase().includes(term) ||
              user.employeeCode.toLowerCase().includes(term) ||
              (b.break_type_label || '').toLowerCase().includes(term)
            );
          });
        }

        // Sort descending by start_time
        items.sort((a, b) => new Date(b.start_time) - new Date(a.start_time));

        const total = items.length;
        const totalPages = Math.ceil(total / limitNum) || 1;
        const offset = (pageNum - 1) * limitNum;
        const pageItems = items.slice(offset, offset + limitNum);

        const records = pageItems.map((b) => {
          const userDetails = enrichUserFromMock(b.user_id);
          return formatBreakRecord(b, userDetails);
        });

        // Compute summary metrics
        const agentMap = new Map();
        let totalBreakMinutes = 0;
        let activeBreaksCount = 0;
        const breakdownByType = { TEA: 0, LUNCH: 0, BIO: 0, MEETING: 0 };

        for (const item of items) {
          const formatted = formatBreakRecord(item);
          totalBreakMinutes += formatted.durationMinutes;

          if (formatted.status === 'ACTIVE') {
            activeBreaksCount += 1;
          }

          if (breakdownByType[formatted.breakType] !== undefined) {
            breakdownByType[formatted.breakType] += 1;
          } else {
            breakdownByType[formatted.breakType] = 1;
          }

          const user = enrichUserFromMock(item.user_id);
          if (!agentMap.has(item.user_id)) {
            agentMap.set(item.user_id, {
              userId: item.user_id,
              userName: user.fullName,
              userEmail: user.email,
              userRole: user.role,
              vendorName: user.vendorName,
              breakCount: 0,
              totalMinutes: 0,
              currentlyOnBreak: false,
              activeBreakType: null,
              activeStartTime: null,
            });
          }

          const ag = agentMap.get(item.user_id);
          ag.breakCount += 1;
          ag.totalMinutes += formatted.durationMinutes;
          if (formatted.status === 'ACTIVE') {
            ag.currentlyOnBreak = true;
            ag.activeBreakType = formatted.breakTypeLabel;
            ag.activeStartTime = formatted.startTime;
          }
        }

        return {
          records,
          pagination: {
            page: pageNum,
            limit: limitNum,
            total,
            totalPages,
          },
          summary: {
            totalBreakRecords: total,
            totalBreakMinutes,
            activeBreaksCount,
            agentsCount: agentMap.size,
            breakdownByType,
            summaryByAgent: Array.from(agentMap.values()).sort((a, b) => b.totalMinutes - a.totalMinutes),
          },
        };
      }
    );
  },
};

module.exports = breaksService;
module.exports.BREAK_TYPES = BREAK_TYPES;
