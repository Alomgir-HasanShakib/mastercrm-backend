/**
 * @file errorLogs.routes.js
 * @description Express routing definitions for system error logs and frontend error telemetry.
 */

const express = require('express');
const { authenticate } = require('../../middleware/auth');
const { setTenantContext } = require('../../middleware/tenancy');
const { checkRole } = require('../../middleware/rbac');
const { verifyToken } = require('../../utils/crypto');
const errorLogsController = require('./errorLogs.controller');

const router = express.Router();

/**
 * Optional authentication helper:
 * Decodes Bearer token if present to attach req.user, but does not block unauthenticated requests.
 */
const optionalAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    if (token) {
      try {
        const decoded = verifyToken(token);
        if (decoded) {
          req.user = decoded;
        }
      } catch (_) {}
    }
  }
  return next();
};

/**
 * @route POST /api/v1/system/error-logs/client
 * @desc  Log frontend client errors (allows unauthenticated reporting so login / network failures are captured)
 * @access Public / Authenticated
 */
router.post('/client', optionalAuth, errorLogsController.logClientError);

// Protected routes for Master Admin & Super Admin inspection
const adminGuard = [authenticate, setTenantContext, checkRole('MASTER_ADMIN')];

/**
 * @route GET /api/v1/system/error-logs/stats
 * @desc  Retrieve aggregate error statistics and KPI metrics
 * @access MASTER_ADMIN only
 */
router.get('/stats', ...adminGuard, errorLogsController.getStats);

/**
 * @route POST /api/v1/system/error-logs/export
 * @route GET /api/v1/system/error-logs/export
 * @desc  Export error logs to Excel (.xlsx) or CSV
 * @access MASTER_ADMIN only
 */
router.post('/export', ...adminGuard, errorLogsController.exportLogs);
router.get('/export', ...adminGuard, errorLogsController.exportLogs);

/**
 * @route DELETE /api/v1/system/error-logs
 * @desc  Clear or purge error logs
 * @access MASTER_ADMIN only
 */
router.delete('/', ...adminGuard, errorLogsController.clearLogs);

/**
 * @route GET /api/v1/system/error-logs
 * @desc  List, filter, search, and paginate system error logs
 * @access MASTER_ADMIN only
 */
router.get('/', ...adminGuard, errorLogsController.list);

module.exports = router;
