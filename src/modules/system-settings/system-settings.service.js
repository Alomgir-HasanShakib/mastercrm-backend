/**
 * @file system-settings.service.js
 * @description Business logic for System Settings — persists & retrieves platform-wide configuration
 * (telephony credentials, general settings, security policies) in the system_settings DB table.
 */

const axios = require('axios');
const db = require('../../database/connection');
const logger = require('../../utils/logger');

const TELEPHONY_KEY = 'telephony';
const GENERAL_KEY = 'general';
const SECURITY_KEY = 'security';

/**
 * Retrieve all system settings sections, masking sensitive credential fields.
 * @returns {Promise<object>}
 */
const getSystemSettings = async () => {
  const rows = await db('system_settings').select('id', 'value', 'updated_at');
  const result = {};
  for (const row of rows) {
    result[row.id] = { ...row.value, updated_at: row.updated_at };
  }

  // Mask secrets before returning to frontend
  if (result.telephony?.tata_smartflo?.api_token) {
    const tok = result.telephony.tata_smartflo.api_token;
    result.telephony.tata_smartflo.api_token = tok.length > 8 ? '****' + tok.slice(-4) : '****';
  }
  if (result.telephony?.dialshree?.password) {
    result.telephony.dialshree.password = '***masked***';
  }

  return result;
};

/**
 * Upsert a settings section (merge new values into existing).
 * @param {string} section - Settings key ('telephony', 'general', 'security')
 * @param {object} data - Key-value pairs to merge into the section
 * @param {string|null} updatedBy - UUID of user performing update
 * @returns {Promise<{ success: boolean, section: string }>}
 */
const updateSystemSettings = async (section, data, updatedBy) => {
  const existing = await db('system_settings').where('id', section).first();

  if (existing) {
    const merged = { ...existing.value, ...data };
    await db('system_settings').where('id', section).update({
      value: db.raw('?::jsonb', [JSON.stringify(merged)]),
      updated_by: updatedBy || null,
      updated_at: db.fn.now(),
    });
  } else {
    await db('system_settings').insert({
      id: section,
      value: db.raw('?::jsonb', [JSON.stringify(data)]),
      updated_by: updatedBy || null,
      updated_at: db.fn.now(),
    });
  }

  return { success: true, section };
};

/**
 * Retrieve raw (unmasked) telephony settings from DB — for internal use by dialer adapters.
 * @returns {Promise<object|null>}
 */
const getRawTelephonySettings = async () => {
  const row = await db('system_settings').where('id', TELEPHONY_KEY).first();
  return row ? row.value : null;
};

/**
 * Test connectivity to the configured telephony provider.
 * Mirrors the API call structure used by dialer adapters.
 * @param {string} provider - 'TATA_SMARTFLO' | 'DIALSHREE'
 * @returns {Promise<{ success: boolean, provider: string, message: string, data?: object }>}
 */
const testTelephonyProvider = async (provider) => {
  const settings = await getRawTelephonySettings();
  if (!settings) {
    throw new Error('No telephony settings configured. Please save settings first.');
  }

  if (provider === 'TATA_SMARTFLO') {
    const config = settings.tata_smartflo;
    if (!config?.api_token) {
      throw new Error('Tata Smartflo API token is not configured.');
    }

    logger.info('[SystemSettings] Testing Tata Smartflo connection...');
    try {
      const res = await axios.get('https://api-smartflo.tatateleservices.com/v1/agent', {
        headers: { Authorization: `Bearer ${config.api_token}` },
        timeout: 10000,
      });
      logger.info('[SystemSettings] Tata Smartflo connection test successful.');
      return { success: true, provider, message: 'Tata Smartflo connection successful', data: res.data };
    } catch (err) {
      const errMsg = err.response?.data?.message || err.response?.data?.error || err.message;
      logger.error(`[SystemSettings] Tata Smartflo test failed: ${errMsg}`);
      throw new Error(`Tata Smartflo test failed: ${errMsg}`);
    }
  }

  if (provider === 'DIALSHREE') {
    const config = settings.dialshree;
    if (!config?.server_prefix || !config?.username || !config?.password) {
      throw new Error('DialShree configuration is incomplete (server_prefix, username, and password are required).');
    }

    logger.info(`[SystemSettings] Testing DialShree connection to ${config.server_prefix}.elisiontec.com...`);
    try {
      const res = await axios.post(
        `https://${config.server_prefix}.elisiontec.com/api/login`,
        { username: config.username, password: config.password },
        { timeout: 10000 }
      );
      logger.info('[SystemSettings] DialShree connection test successful.');
      return { success: true, provider, message: 'DialShree connection successful', data: res.data };
    } catch (err) {
      const errMsg = err.response?.data?.message || err.response?.data?.error || err.message;
      logger.error(`[SystemSettings] DialShree test failed: ${errMsg}`);
      throw new Error(`DialShree test failed: ${errMsg}`);
    }
  }

  throw new Error(`Unknown provider: ${provider}. Supported providers: TATA_SMARTFLO, DIALSHREE`);
};

module.exports = {
  getSystemSettings,
  updateSystemSettings,
  getRawTelephonySettings,
  testTelephonyProvider,
};
