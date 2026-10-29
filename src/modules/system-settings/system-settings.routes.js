/**
 * @file system-settings.routes.js
 * @description Express routes for System Settings & Telephony Configuration.
 * ALL routes are MASTER_ADMIN only — enforced via checkRole middleware.
 */

const { Router } = require('express');
const { authenticate } = require('../../middleware/auth');
const { setTenantContext } = require('../../middleware/tenancy');
const { checkRole } = require('../../middleware/rbac');
const ctrl = require('./system-settings.controller');

const router = Router();

// ALL system-settings routes require MASTER_ADMIN authentication
router.use(authenticate, setTenantContext, checkRole('MASTER_ADMIN'));

/**
 * @route GET /api/v1/system-settings
 * @desc  Retrieve all system settings (secrets masked)
 * @access MASTER_ADMIN only
 */
router.get('/', ctrl.getSettings);

/**
 * @route PUT /api/v1/system-settings
 * @desc  Update a settings section
 * @body  { section: 'telephony'|'general'|'security', ...fields }
 * @access MASTER_ADMIN only
 */
router.put('/', ctrl.updateSettings);

/**
 * @route POST /api/v1/system-settings/telephony/test
 * @desc  Test connectivity to a configured telephony provider
 * @body  { provider: 'TATA_SMARTFLO'|'DIALSHREE' }
 * @access MASTER_ADMIN only
 */
router.post('/telephony/test', ctrl.testProvider);

module.exports = router;
