/**
 * @file index.js
 * @description Central API router assembling all domain modules under /api/v1.
 */

const express = require('express');
const { checkDatabaseHealth } = require('../database/connection');
const { checkRedisHealth } = require('../config/redisClient');
const { success } = require('../utils/response');

const router = express.Router();

/**
 * @route GET /api/v1/health
 * @desc System health check endpoint verifying DB, Redis and service status
 * @access Public
 */
router.get('/health', async (req, res, next) => {
  try {
    const dbHealth = await checkDatabaseHealth();
    const redisHealth = await checkRedisHealth();

    const isSystemHealthy = dbHealth.status === 'healthy'; // Redis can be optional in dev/local

    const healthData = {
      status: isSystemHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptimeSeconds: process.uptime(),
      memoryUsage: process.memoryUsage(),
      services: {
        database: dbHealth,
        redis: redisHealth,
      },
    };

    return success(
      res,
      healthData,
      isSystemHealthy ? 'System is healthy' : 'System is degraded',
      isSystemHealthy ? 200 : 503
    );
  } catch (error) {
    return next(error);
  }
});

/**
 * @route GET /api/v1
 * @desc API Root descriptor
 * @access Public
 */
router.get('/', (req, res) => {
  return success(res, {
    name: 'Master Multi-Vendor Survey, Audit & Verification CRM API',
    version: '1.0.0',
    documentation: '/api/v1/docs',
  }, 'Master CRM API v1 is active');
});

// Mount domain modules
const { authenticate } = require('../middleware/auth');
const { setTenantContext } = require('../middleware/tenancy');
const { requireActiveSubscription } = require('../middleware/subscriptionGate');
const { requireModuleEnabled } = require('../middleware/moduleGate');

const authRoutes = require('../modules/auth').routes;
const tenancyRoutes = require('../modules/tenancy').routes;
const usersRoutes = require('../modules/users').routes;
const questionnaireRoutes = require('../modules/questionnaire').routes;
const rulesEngineRoutes = require('../modules/rules-engine').routes;
const submissionsRoutes = require('../modules/submissions').routes;
const auditLogRoutes = require('../modules/audit-log').routes;
const capiRoutes = require('../modules/capi').routes;
const superAuditRoutes = require('../modules/super-audit').routes;
const tvcRoutes = require('../modules/tvc').routes;
const feedbackRoutes = require('../modules/feedback').routes;
const dialerRoutes = require('../modules/dialer').routes;
const realtimeRoutes = require('../modules/realtime').routes;
const aiRoutes = require('../modules/ai').routes;
const reportsRoutes = require('../modules/reports').routes;
const fieldCatiRoutes = require('../modules/field-cati').routes;
const catiRoutes = require('../modules/field-cati/cati.routes');
const examRoutes = require('../modules/exam').routes;
const geographyRoutes = require('../modules/geography').routes;
const subscriptionRoutes = require('../modules/subscriptions').routes;
const clientDbRoutes = require('../modules/client-db').routes;
const importRoutes = require('../modules/imports').routes;
const lookupRoutes = require('../modules/lookups').routes;
const operationsRoutes = require('../modules/operations').routes;
const breaksRoutes = require('../modules/breaks').routes;
const projectsRoutes = require('../modules/projects').projectsRoutes;
const schemaEngineRoutes = require('../modules/schema-engine').routes;
const systemSettingsRoutes = require('../modules/system-settings/system-settings.routes');
const voiceFraudRoutes = require('../modules/voice-fraud').routes;

// Authentication
router.use('/auth', authRoutes);

// Operational Breaks & Productivity Management
router.use('/breaks', breaksRoutes);

// Subscriptions & Invoicing (accessible to view pricing, current status, and renew)
router.use('/subscriptions', subscriptionRoutes);

// Campaigns / Projects & Multi-Vendor Allocation / Questionnaire Binding Studio
router.use('/projects', projectsRoutes);
router.use('/campaigns', projectsRoutes);

// Tenancy & Sub-entities (mounted directly so /organizations, /clients, /vendors, /projects and /tenancy/* match cleanly)
router.use('/tenancy', tenancyRoutes);
router.use('/', tenancyRoutes);

// Users & Roles
router.use('/users', usersRoutes);

// Security & Audit Log
router.use('/audit-log', auditLogRoutes);

// Protected CRM Feature Gates (Enforces active and non-expired subscription for tenants; Master Admin bypassed)
const subscriptionGate = [authenticate, setTenantContext, requireActiveSubscription];

// Dynamic Database Schema Studio & Custom Table Engine
router.use('/schemas', ...subscriptionGate, schemaEngineRoutes);
router.use('/schema-engine', ...subscriptionGate, schemaEngineRoutes);

// Questionnaire Studio (both singular /questionnaire and plural /questionnaires)
router.use('/questionnaire', ...subscriptionGate, questionnaireRoutes);
router.use('/questionnaires', ...subscriptionGate, questionnaireRoutes);

// Rules Engine (both /rules-engine and /rules)
router.use('/rules-engine', ...subscriptionGate, rulesEngineRoutes);
router.use('/rules', ...subscriptionGate, rulesEngineRoutes);

// Submissions, responses & offline sync
router.use('/submissions', ...subscriptionGate, submissionsRoutes);

// Operations: CAPI, Super Audit, TVC, Feedback, Dialer, Realtime, Rechain Operations
router.use('/operations', ...subscriptionGate, operationsRoutes);
router.use('/capi', ...subscriptionGate, requireModuleEnabled('CAPI'), capiRoutes);
router.use('/super-audit', ...subscriptionGate, requireModuleEnabled('SUPER_AUDIT'), superAuditRoutes);
router.use('/tvc', ...subscriptionGate, requireModuleEnabled('TVC'), tvcRoutes);
router.use('/feedback', ...subscriptionGate, requireModuleEnabled('FA'), feedbackRoutes);
router.use('/fa', ...subscriptionGate, requireModuleEnabled('FA'), feedbackRoutes);
router.use('/dialer', ...subscriptionGate, dialerRoutes);
router.use('/realtime', ...subscriptionGate, realtimeRoutes);

// AI & Speech Intelligence
router.use('/ai', ...subscriptionGate, aiRoutes);

// AI Voice Fraud & Biometric Speaker Verification Engine
router.use('/voice-fraud', ...subscriptionGate, voiceFraudRoutes);
router.use('/ai/voice-fraud', ...subscriptionGate, voiceFraudRoutes);

// Analytics & Reports
router.use('/reports', ...subscriptionGate, reportsRoutes);

// Field CATI / Offline Sync & Core Field Survey API
router.use('/field-cati', ...subscriptionGate, requireModuleEnabled('CATI'), fieldCatiRoutes);
router.use('/cati', ...subscriptionGate, requireModuleEnabled('CATI'), catiRoutes);
router.use('/field-survey', ...subscriptionGate, requireModuleEnabled('CATI'), catiRoutes);

// Certification & Exams
router.use('/exam', ...subscriptionGate, examRoutes);
router.use('/exams', ...subscriptionGate, examRoutes);

// Geography Hierarchy & Ingestion
router.use('/geography', ...subscriptionGate, geographyRoutes);

// Client DB Continuous Feeds & Warehouse Sync
router.use('/client-db', ...subscriptionGate, clientDbRoutes);

// Form Imports & Automated Workbook Mapping Engine
router.use('/projects/:projectId/form-imports', ...subscriptionGate, importRoutes);
router.use('/form-imports', ...subscriptionGate, importRoutes);

// Hierarchical Lookups (PC -> AC, District -> Assembly)
router.use('/projects/:projectId/lookups', ...subscriptionGate, lookupRoutes);
router.use('/lookups', ...subscriptionGate, lookupRoutes);

// System Settings & Telephony Configuration (MASTER_ADMIN only — auth enforced inside route)
router.use('/system-settings', systemSettingsRoutes);

module.exports = router;


