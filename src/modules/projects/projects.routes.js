/**
 * @file projects.routes.js
 * @description Express routing definitions for Campaign/Projects management, Multi-Vendor Equal Split Allocation,
 * Strict Multi-Vendor Data Isolation, and Campaign-Questionnaire Binding Studio.
 */

const express = require('express');
const { authenticate } = require('../../middleware/auth');
const { setTenantContext } = require('../../middleware/tenancy');
const { checkRole } = require('../../middleware/rbac');
const { validate } = require('../../middleware/validator');
const projectsController = require('./projects.controller');
const {
  allocateLeadsSchema,
  bindQuestionnaireSchema,
  createCampaignQuestionnaireSchema,
  surveyLeadSchema,
} = require('./projects.validation');

const router = express.Router();

// All projects routes require authentication & tenant context
router.use(authenticate, setTenantContext);

// ==========================================
// AVAILABLE QUESTIONNAIRE TEMPLATES
// ==========================================
router.get(
  '/available-questionnaires',
  projectsController.getAvailableQuestionnaires
);

// ==========================================
// CORE CAMPAIGN CRUD
// ==========================================
router.get('/', projectsController.listProjects);
router.get('/:id', projectsController.getProject);

router.post(
  '/',
  checkRole('MASTER_ADMIN', 'CLIENT_ADMIN', 'PROJECT_MANAGER'),
  projectsController.createProject
);

router.put(
  '/:id',
  checkRole('MASTER_ADMIN', 'CLIENT_ADMIN', 'PROJECT_MANAGER'),
  projectsController.updateProject
);

router.patch(
  '/:id',
  checkRole('MASTER_ADMIN', 'CLIENT_ADMIN', 'PROJECT_MANAGER'),
  projectsController.updateProject
);

router.delete(
  '/:id',
  checkRole('MASTER_ADMIN', 'CLIENT_ADMIN', 'PROJECT_MANAGER'),
  projectsController.deleteProject
);

// Pull external client database records for this campaign
router.post(
  '/sync-all',
  checkRole('MASTER_ADMIN', 'CLIENT_ADMIN', 'PROJECT_MANAGER'),
  projectsController.syncAllCampaigns
);

router.post(
  '/:id/pull-data',
  checkRole('MASTER_ADMIN', 'CLIENT_ADMIN', 'PROJECT_MANAGER'),
  projectsController.pullData
);

// Synchronize campaign leads on-demand (deduplicates & ingests new records)
router.post(
  '/:id/sync-leads',
  checkRole('MASTER_ADMIN', 'CLIENT_ADMIN', 'PROJECT_MANAGER'),
  projectsController.syncLeads
);

// ==========================================
// MULTI-VENDOR ALLOCATION & STRICT DATA ISOLATION
// ==========================================

// Equal split lead allocation (e.g. 65 leads across 5 vendors -> 13 each)
router.post(
  '/:id/leads/allocate',
  checkRole('MASTER_ADMIN', 'CLIENT_ADMIN', 'PROJECT_MANAGER'),
  validate(allocateLeadsSchema, 'body'),
  projectsController.allocateLeads
);

// Alternate alias for flexibility
router.post(
  '/:id/allocate-leads',
  checkRole('MASTER_ADMIN', 'CLIENT_ADMIN', 'PROJECT_MANAGER'),
  validate(allocateLeadsSchema, 'body'),
  projectsController.allocateLeads
);

// Explicit vendor allocation alias
router.post(
  '/:id/vendor-allocation',
  checkRole('MASTER_ADMIN', 'CLIENT_ADMIN', 'PROJECT_MANAGER'),
  validate(allocateLeadsSchema, 'body'),
  projectsController.allocateLeads
);

// Auto-assign remaining leads in pending pool
router.post(
  '/:id/leads/auto-assign',
  checkRole('MASTER_ADMIN', 'CLIENT_ADMIN', 'PROJECT_MANAGER'),
  projectsController.autoAssignLeads
);

// Reallocate leads from one vendor to another
router.post(
  '/:id/leads/reallocate-vendor',
  checkRole('MASTER_ADMIN', 'CLIENT_ADMIN', 'PROJECT_MANAGER'),
  projectsController.reallocateVendorLeads
);

// Get campaign leads (STRICT multi-vendor isolation enforced: Vendor A only sees Vendor A's leads!)
router.get(
  '/:id/leads',
  projectsController.getCampaignLeads
);

// Lead allocation summary metrics
router.get(
  '/:id/leads/metrics',
  projectsController.getLeadMetrics
);

// Survey lead with strict vendor isolation check (Vendor A cannot survey Vendor B's lead)
router.post(
  '/:id/leads/:leadId/survey',
  validate(surveyLeadSchema, 'body'),
  projectsController.surveyLead
);

// ==========================================
// CAMPAIGN - QUESTIONNAIRE BINDING
// ==========================================

// Get bound questionnaires for campaign
router.get(
  '/:id/questionnaires',
  projectsController.getBoundQuestionnaires
);

router.get(
  '/:id/questionnaire',
  projectsController.getBoundQuestionnaires
);

// Bind existing questionnaire from Question Builder to campaign
router.post(
  '/:id/questionnaires/bind',
  checkRole('MASTER_ADMIN', 'CLIENT_ADMIN', 'PROJECT_MANAGER'),
  validate(bindQuestionnaireSchema, 'body'),
  projectsController.bindQuestionnaire
);

// Explicit questionnaire-binding alias
router.post(
  '/:id/questionnaire-binding',
  checkRole('MASTER_ADMIN', 'CLIENT_ADMIN', 'PROJECT_MANAGER'),
  validate(bindQuestionnaireSchema, 'body'),
  projectsController.bindQuestionnaire
);

router.get(
  '/:id/questionnaire-binding',
  projectsController.getBoundQuestionnaires
);

// Build new questionnaire specifically for this campaign and bind immediately
router.post(
  '/:id/questionnaires/create',
  checkRole('MASTER_ADMIN', 'CLIENT_ADMIN', 'PROJECT_MANAGER'),
  validate(createCampaignQuestionnaireSchema, 'body'),
  projectsController.createCampaignQuestionnaire
);

// Unbind questionnaire from campaign
router.delete(
  '/:id/questionnaires/:questionnaireId',
  checkRole('MASTER_ADMIN', 'CLIENT_ADMIN', 'PROJECT_MANAGER'),
  projectsController.unbindQuestionnaire
);

module.exports = router;
