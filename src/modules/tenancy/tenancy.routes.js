/**
 * @file tenancy.routes.js
 * @description Express routing definitions for Organizations, Clients, Vendors, and Projects.
 */

const express = require('express');
const { authenticate } = require('../../middleware/auth');
const { setTenantContext } = require('../../middleware/tenancy');
const { checkRole } = require('../../middleware/rbac');
const { validate } = require('../../middleware/validator');
const tenancyController = require('./tenancy.controller');
const {
  listQuerySchema,
  idParamSchema,
  projectVendorParamSchema,
  toggleStatusSchema,
  createOrganizationSchema,
  updateOrganizationSchema,
  updateOrganizationModulesSchema,
  createClientSchema,
  updateClientSchema,
  createVendorSchema,
  updateVendorSchema,
  createProjectSchema,
  updateProjectSchema,
  projectStatusSchema,
  assignProjectVendorSchema,
  projectModulesSchema,
  projectLanguagesSchema,
} = require('./tenancy.validation');

const router = express.Router();

// All tenancy routes require authentication and tenant context resolution
router.use(authenticate, setTenantContext);

// ==========================================
// ORGANIZATIONS (MASTER_ADMIN only)
// ==========================================

router.get(
  '/organizations',
  checkRole('MASTER_ADMIN', 'ORGANIZATION_ADMIN', 'CLIENT_ADMIN', 'ORG_ADMIN'),
  validate(listQuerySchema, 'query'),
  tenancyController.listOrganizations
);

router.get(
  '/organizations/:id',
  checkRole('MASTER_ADMIN', 'ORGANIZATION_ADMIN', 'CLIENT_ADMIN', 'ORG_ADMIN'),
  validate(idParamSchema, 'params'),
  tenancyController.getOrganization
);

router.post(
  '/organizations',
  checkRole('MASTER_ADMIN'),
  validate(createOrganizationSchema, 'body'),
  tenancyController.createOrganization
);

router.put(
  '/organizations/:id',
  checkRole('MASTER_ADMIN'),
  validate(idParamSchema, 'params'),
  validate(updateOrganizationSchema, 'body'),
  tenancyController.updateOrganization
);

router.put(
  '/organizations/:id/modules',
  checkRole('MASTER_ADMIN'),
  validate(idParamSchema, 'params'),
  validate(updateOrganizationModulesSchema, 'body'),
  tenancyController.updateOrganizationModules
);

router.patch(
  '/organizations/:id/modules',
  checkRole('MASTER_ADMIN'),
  validate(idParamSchema, 'params'),
  validate(updateOrganizationModulesSchema, 'body'),
  tenancyController.updateOrganizationModules
);

router.delete(
  '/organizations/:id',
  checkRole('MASTER_ADMIN'),
  validate(idParamSchema, 'params'),
  tenancyController.deleteOrganization
);

// ==========================================
// CLIENTS (MASTER_ADMIN or CLIENT_ADMIN)
// ==========================================

router.get(
  '/clients',
  validate(listQuerySchema, 'query'),
  tenancyController.listClients
);

router.get(
  '/clients/:id',
  validate(idParamSchema, 'params'),
  tenancyController.getClient
);

router.post(
  '/clients',
  checkRole('MASTER_ADMIN', 'CLIENT_ADMIN'),
  validate(createClientSchema, 'body'),
  tenancyController.createClient
);

router.put(
  '/clients/:id',
  checkRole('MASTER_ADMIN', 'CLIENT_ADMIN'),
  validate(idParamSchema, 'params'),
  validate(updateClientSchema, 'body'),
  tenancyController.updateClient
);

router.delete(
  '/clients/:id',
  checkRole('MASTER_ADMIN', 'CLIENT_ADMIN'),
  validate(idParamSchema, 'params'),
  tenancyController.deleteClient
);

router.patch(
  '/clients/:id/status',
  checkRole('MASTER_ADMIN', 'CLIENT_ADMIN'),
  validate(idParamSchema, 'params'),
  validate(toggleStatusSchema, 'body'),
  tenancyController.toggleClientStatus
);

// ==========================================
// VENDORS
// ==========================================

router.get(
  '/vendors',
  validate(listQuerySchema, 'query'),
  tenancyController.listVendors
);

router.get(
  '/vendors/:id',
  validate(idParamSchema, 'params'),
  tenancyController.getVendor
);

router.post(
  '/vendors',
  checkRole('MASTER_ADMIN', 'CLIENT_ADMIN'),
  validate(createVendorSchema, 'body'),
  tenancyController.createVendor
);

router.put(
  '/vendors/:id',
  checkRole('MASTER_ADMIN', 'CLIENT_ADMIN'),
  validate(idParamSchema, 'params'),
  validate(updateVendorSchema, 'body'),
  tenancyController.updateVendor
);

router.delete(
  '/vendors/:id',
  checkRole('MASTER_ADMIN', 'CLIENT_ADMIN'),
  validate(idParamSchema, 'params'),
  tenancyController.deleteVendor
);

router.patch(
  '/vendors/:id/status',
  checkRole('MASTER_ADMIN', 'CLIENT_ADMIN'),
  validate(idParamSchema, 'params'),
  validate(toggleStatusSchema, 'body'),
  tenancyController.toggleVendorStatus
);

// ==========================================
// PROJECTS / CAMPAIGNS
// ==========================================

router.get(
  '/projects',
  validate(listQuerySchema, 'query'),
  tenancyController.listProjects
);

router.get(
  '/projects/:id',
  validate(idParamSchema, 'params'),
  tenancyController.getProject
);

router.post(
  '/projects',
  checkRole('MASTER_ADMIN', 'CLIENT_ADMIN', 'PROJECT_MANAGER'),
  validate(createProjectSchema, 'body'),
  tenancyController.createProject
);

router.put(
  '/projects/:id',
  checkRole('MASTER_ADMIN', 'CLIENT_ADMIN', 'PROJECT_MANAGER'),
  validate(idParamSchema, 'params'),
  validate(updateProjectSchema, 'body'),
  tenancyController.updateProject
);

router.delete(
  '/projects/:id',
  checkRole('MASTER_ADMIN', 'CLIENT_ADMIN', 'PROJECT_MANAGER'),
  validate(idParamSchema, 'params'),
  tenancyController.deleteProject
);

router.patch(
  '/projects/:id/status',
  checkRole('MASTER_ADMIN', 'CLIENT_ADMIN', 'PROJECT_MANAGER'),
  validate(idParamSchema, 'params'),
  validate(projectStatusSchema, 'body'),
  tenancyController.updateProjectStatus
);

router.get(
  '/projects/:id/vendors',
  validate(idParamSchema, 'params'),
  tenancyController.getProjectVendors
);

router.post(
  '/projects/:id/vendors',
  checkRole('MASTER_ADMIN', 'CLIENT_ADMIN', 'PROJECT_MANAGER'),
  validate(idParamSchema, 'params'),
  validate(assignProjectVendorSchema, 'body'),
  tenancyController.assignProjectVendor
);

router.delete(
  '/projects/:id/vendors/:vendorId',
  checkRole('MASTER_ADMIN', 'CLIENT_ADMIN', 'PROJECT_MANAGER'),
  validate(projectVendorParamSchema, 'params'),
  tenancyController.removeProjectVendor
);

router.get(
  '/projects/:id/modules',
  validate(idParamSchema, 'params'),
  tenancyController.getProjectModules
);

router.put(
  '/projects/:id/modules',
  checkRole('MASTER_ADMIN', 'CLIENT_ADMIN', 'PROJECT_MANAGER'),
  validate(idParamSchema, 'params'),
  validate(projectModulesSchema, 'body'),
  tenancyController.configureModules
);

router.post(
  '/projects/:id/modules',
  checkRole('MASTER_ADMIN', 'CLIENT_ADMIN', 'PROJECT_MANAGER'),
  validate(idParamSchema, 'params'),
  validate(projectModulesSchema, 'body'),
  tenancyController.configureModules
);

router.get(
  '/projects/:id/languages',
  validate(idParamSchema, 'params'),
  tenancyController.getProjectLanguages
);

router.put(
  '/projects/:id/languages',
  checkRole('MASTER_ADMIN', 'CLIENT_ADMIN', 'PROJECT_MANAGER'),
  validate(idParamSchema, 'params'),
  validate(projectLanguagesSchema, 'body'),
  tenancyController.configureLanguages
);

router.post(
  '/projects/:id/languages',
  checkRole('MASTER_ADMIN', 'CLIENT_ADMIN', 'PROJECT_MANAGER'),
  validate(idParamSchema, 'params'),
  validate(projectLanguagesSchema, 'body'),
  tenancyController.configureLanguages
);

module.exports = router;
