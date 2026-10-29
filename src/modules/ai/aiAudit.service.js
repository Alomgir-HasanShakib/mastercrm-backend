/**
 * @file aiAudit.service.js
 * @description Centralized AI Audit Scheduling, Working Hours & Emergency Manual Override Controller.
 * 
 * - Enforces the 7:00 PM IST (19:00 Indian Standard Time) daily audit cutoff.
 * - Manages Super Admin / Admin Emergency Manual Override (15 min, 30 min, 1 hour).
 * - Stores emergency_override_until timestamp in PostgreSQL system_settings / mockStore.
 * - Provides live override countdown and status checks for AI audit worker engines.
 */

const { db, withDbFallback } = require('../../database/connection');
const mockStore = require('../../database/mockStore');
const logger = require('../../utils/logger');

const SETTINGS_KEY = 'ai_audit_emergency_override';

// In-memory cache of emergency override state
let overrideState = {
  active: false,
  until: null,
  durationMinutes: null,
  activatedAt: null,
  activatedBy: null,
};

/**
 * Checks if current time in Indian Standard Time (Asia/Kolkata) is past 7:00 PM (19:00) or before 8:00 AM.
 * @returns {boolean} True if outside operating window (19:00 IST to 08:00 IST next morning)
 */
function isPast7PmIst() {
  const now = new Date();
  const istString = now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata', hour12: false });
  const match = istString.match(/(\d+):(\d+):(\d+)/);
  const hour = match ? parseInt(match[1], 10) : 0;
  return hour >= 19 || hour < 8; // 7 PM IST to 8 AM IST
}

/**
 * Formats current time into a human-readable Indian Standard Time string.
 * @returns {string} e.g. "Oct 27, 2026, 12:45:10 AM IST"
 */
function getCurrentIstTime() {
  const now = new Date();
  return now.toLocaleString('en-US', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'medium',
    hour12: true,
  }) + ' IST';
}

/**
 * Verifies if an emergency override is currently active (now < emergency_override_until).
 * @returns {boolean}
 */
function isEmergencyOverrideActive() {
  if (!overrideState.until) return false;
  const now = new Date();
  const until = new Date(overrideState.until);
  if (now < until) {
    return true;
  }
  // If expired, invalidate active flag
  if (overrideState.active) {
    overrideState.active = false;
  }
  return false;
}

/**
 * Gets detailed emergency override status, live remaining seconds, and working hours information.
 * @returns {object}
 */
function getEmergencyOverrideStatus() {
  const isPast = isPast7PmIst();
  const isActive = isEmergencyOverrideActive();
  const remainingSeconds = isActive && overrideState.until
    ? Math.max(0, Math.round((new Date(overrideState.until).getTime() - Date.now()) / 1000))
    : 0;

  return {
    active: isActive,
    emergency_override_until: isActive ? overrideState.until : null,
    remainingSeconds,
    durationMinutes: isActive ? overrideState.durationMinutes : null,
    activatedAt: isActive ? overrideState.activatedAt : null,
    activatedBy: isActive ? overrideState.activatedBy : null,
    isPastWorkingHours: isPast,
    currentIstTime: getCurrentIstTime(),
    canProcess: !isPast || isActive,
    cutoffWindow: '08:00 AM - 07:00 PM IST',
  };
}

/**
 * Persists override settings to the system_settings table and in-memory fallback.
 * @param {object} payload
 */
async function persistOverrideToDb(payload) {
  try {
    await withDbFallback(
      async () => {
        const hasTable = await db.schema.hasTable('system_settings');
        if (!hasTable) return;

        const existing = await db('system_settings').where('id', SETTINGS_KEY).first();
        if (existing) {
          await db('system_settings')
            .where('id', SETTINGS_KEY)
            .update({
              value: db.raw('?::jsonb', [JSON.stringify(payload)]),
              updated_at: db.fn.now(),
            });
        } else {
          await db('system_settings').insert({
            id: SETTINGS_KEY,
            value: db.raw('?::jsonb', [JSON.stringify(payload)]),
            updated_at: db.fn.now(),
          });
        }
      },
      () => {
        if (!mockStore.system_settings) mockStore.system_settings = {};
        mockStore.system_settings[SETTINGS_KEY] = { ...payload, updated_at: new Date().toISOString() };
      }
    );
  } catch (err) {
    logger.warn(`[AiAuditService] Failed to persist emergency override to DB: ${err.message}`);
  }
}

/**
 * Activates an Emergency Manual Override for 15 minutes, 30 minutes, or 1 hour (60 minutes).
 *
 * @param {object} params
 * @param {number|string} params.durationMinutes - 15, 30, or 60 (or string '15m', '30m', '1h')
 * @param {string|object} [params.activatedBy] - Email or user object of admin
 * @returns {Promise<object>} Current override status
 */
async function activateEmergencyOverride({ durationMinutes = 30, activatedBy = 'Administrator' } = {}) {
  // Normalize duration
  let mins = 30;
  if (typeof durationMinutes === 'string') {
    const clean = durationMinutes.toLowerCase().trim();
    if (clean === '15' || clean === '15m' || clean.includes('15')) mins = 15;
    else if (clean === '30' || clean === '30m' || clean.includes('30')) mins = 30;
    else if (clean === '60' || clean === '1h' || clean === '60m' || clean.includes('hour')) mins = 60;
  } else if (typeof durationMinutes === 'number') {
    if (durationMinutes <= 15) mins = 15;
    else if (durationMinutes <= 30) mins = 30;
    else mins = 60;
  }

  const now = new Date();
  const until = new Date(now.getTime() + mins * 60 * 1000).toISOString();
  const userIdentifier = typeof activatedBy === 'object' ? (activatedBy.email || activatedBy.name || 'Admin') : String(activatedBy || 'Admin');

  overrideState = {
    active: true,
    until,
    durationMinutes: mins,
    activatedAt: now.toISOString(),
    activatedBy: userIdentifier,
  };

  const payload = {
    emergency_override_until: until,
    duration_minutes: mins,
    activated_at: now.toISOString(),
    activated_by: userIdentifier,
  };

  await persistOverrideToDb(payload);
  logger.info(`[AiAuditService] Emergency Override activated for ${mins} minutes by ${userIdentifier}. Valid until: ${until}`);

  return getEmergencyOverrideStatus();
}

/**
 * Cancels active Emergency Manual Override immediately.
 * @returns {Promise<object>}
 */
async function cancelEmergencyOverride() {
  overrideState = {
    active: false,
    until: null,
    durationMinutes: null,
    activatedAt: null,
    activatedBy: null,
  };

  await persistOverrideToDb({
    emergency_override_until: null,
    cancelled_at: new Date().toISOString(),
  });

  logger.info('[AiAuditService] Emergency Override cancelled by operator.');
  return getEmergencyOverrideStatus();
}

/**
 * Restores active emergency override from database on server startup.
 */
async function restoreOverrideFromDb() {
  try {
    await withDbFallback(
      async () => {
        const hasTable = await db.schema.hasTable('system_settings');
        if (!hasTable) return;
        const row = await db('system_settings').where('id', SETTINGS_KEY).first();
        if (row && row.value?.emergency_override_until) {
          const until = new Date(row.value.emergency_override_until);
          if (new Date() < until) {
            overrideState = {
              active: true,
              until: row.value.emergency_override_until,
              durationMinutes: row.value.duration_minutes || 30,
              activatedAt: row.value.activated_at || new Date().toISOString(),
              activatedBy: row.value.activated_by || 'Admin',
            };
            logger.info(`[AiAuditService] Restored active Emergency Override from DB until: ${row.value.emergency_override_until}`);
          }
        }
      },
      () => {
        const row = mockStore.system_settings && mockStore.system_settings[SETTINGS_KEY];
        if (row?.emergency_override_until) {
          const until = new Date(row.emergency_override_until);
          if (new Date() < until) {
            overrideState = {
              active: true,
              until: row.emergency_override_until,
              durationMinutes: row.duration_minutes || 30,
              activatedAt: row.activated_at || new Date().toISOString(),
              activatedBy: row.activated_by || 'Admin',
            };
          }
        }
      }
    );
  } catch (err) {
    logger.warn(`[AiAuditService] Could not restore override from DB: ${err.message}`);
  }
}

// Attempt initial restoration
setTimeout(restoreOverrideFromDb, 1500);

/**
 * Checks if AI audit processing is currently permitted:
 * - If emergency override is active, permits processing even if past 7:00 PM IST.
 * - Otherwise permits processing only during normal working hours (08:00 AM - 07:00 PM IST).
 *
 * @returns {object} { permitted: boolean, reason: string, status: object }
 */
function checkCanProcessAudit() {
  const isOverride = isEmergencyOverrideActive();
  const isPast = isPast7PmIst();

  if (isOverride) {
    return {
      permitted: true,
      reason: 'EMERGENCY_OVERRIDE_ACTIVE',
      message: 'Processing permitted under active Emergency Manual Override.',
      status: getEmergencyOverrideStatus(),
    };
  }

  if (isPast) {
    return {
      permitted: false,
      reason: 'AFTER_HOURS_7PM_IST',
      message: 'AI Audit is strictly suspended outside operating hours (past 7:00 PM IST). Activate Emergency Override to proceed.',
      status: getEmergencyOverrideStatus(),
    };
  }

  return {
    permitted: true,
    reason: 'WITHIN_WORKING_HOURS',
    message: 'Operating within normal working hours window (08:00 AM - 07:00 PM IST).',
    status: getEmergencyOverrideStatus(),
  };
}

module.exports = {
  isPast7PmIst,
  getCurrentIstTime,
  isEmergencyOverrideActive,
  getEmergencyOverrideStatus,
  activateEmergencyOverride,
  cancelEmergencyOverride,
  checkCanProcessAudit,
  restoreOverrideFromDb,
};
