/**
 * @file breaks.routes.js
 * @description Operational Break API route definitions.
 */

const express = require('express');
const breaksController = require('./breaks.controller');
const { authenticate } = require('../../middleware/auth');
const { checkRole } = require('../../middleware/rbac');

const router = express.Router();

// All break routes require authentication
router.use(authenticate);

// Agent Operational Endpoints
router.post('/start', breaksController.startBreak);
router.post('/end', breaksController.endBreak);
router.get('/my-today', breaksController.getMyTodayBreaks);

// Admin Monitoring & Audit Endpoints
router.get('/admin/live', checkRole('MASTER_ADMIN', 'SUPER_ADMIN', 'ORG_ADMIN', 'CLIENT_ADMIN', 'ADMIN', 'PROJECT_MANAGER', 'QUALITY_AUDITOR', 'SUPER_AUDITOR', 'VENDOR_ADMIN'), breaksController.getAdminLiveBreaks);
router.get('/admin/reports', checkRole('MASTER_ADMIN', 'SUPER_ADMIN', 'ORG_ADMIN', 'CLIENT_ADMIN', 'ADMIN', 'PROJECT_MANAGER', 'QUALITY_AUDITOR', 'SUPER_AUDITOR', 'VENDOR_ADMIN'), breaksController.getAdminBreakReports);

module.exports = router;
