/**
 * @file system-settings.controller.js
 * @description HTTP controller for System Settings & Telephony Configuration endpoints.
 * All endpoints restricted to MASTER_ADMIN role (enforced at route level).
 */

const settingsService = require('./system-settings.service');
const logger = require('../../utils/logger');

/**
 * GET /api/v1/system-settings
 * Retrieve all system settings sections (sensitive fields masked).
 */
const getSettings = async (req, res) => {
  try {
    const settings = await settingsService.getSystemSettings();
    return res.json({ success: true, data: settings });
  } catch (err) {
    logger.error('[SystemSettingsController] Error getting system settings:', err);
    return res.status(500).json({ success: false, message: 'Failed to retrieve system settings' });
  }
};

/**
 * PUT /api/v1/system-settings
 * Update a settings section (merge strategy — partial updates supported).
 * Body: { section: 'telephony' | 'general' | 'security', ...settingFields }
 */
const updateSettings = async (req, res) => {
  try {
    const { section, ...data } = req.body;
    if (!section) {
      return res.status(400).json({ success: false, message: 'Section is required (e.g. "telephony", "general", "security")' });
    }

    const ALLOWED_SECTIONS = ['telephony', 'general', 'security'];
    if (!ALLOWED_SECTIONS.includes(section)) {
      return res.status(400).json({
        success: false,
        message: `Invalid section "${section}". Allowed: ${ALLOWED_SECTIONS.join(', ')}`,
      });
    }

    const result = await settingsService.updateSystemSettings(section, data, req.user?.userId || req.user?.id || null);
    logger.info(`[SystemSettingsController] Settings updated: section=${section} by user=${req.user?.userId || req.user?.id}`);
    return res.json({ success: true, message: 'Settings updated successfully', data: result });
  } catch (err) {
    logger.error('[SystemSettingsController] Error updating system settings:', err);
    return res.status(500).json({ success: false, message: 'Failed to update system settings' });
  }
};

/**
 * POST /api/v1/system-settings/telephony/test
 * Test connectivity to a configured telephony provider.
 * Body: { provider: 'TATA_SMARTFLO' | 'DIALSHREE' }
 */
const testProvider = async (req, res) => {
  try {
    const { provider } = req.body;
    if (!provider) {
      return res.status(400).json({ success: false, message: 'Provider is required (TATA_SMARTFLO or DIALSHREE)' });
    }

    const result = await settingsService.testTelephonyProvider(provider);
    return res.json(result);
  } catch (err) {
    logger.error('[SystemSettingsController] Error testing telephony provider:', err);
    return res.status(400).json({ success: false, message: err.message });
  }
};

module.exports = {
  getSettings,
  updateSettings,
  testProvider,
};
