/**
 * @file client-db.routes.js
 * @description Express routing for Client DB synchronization feeds, external warehouses, configs, and logs.
 */

const express = require('express');
const { authenticate } = require('../../middleware/auth');
const { setTenantContext } = require('../../middleware/tenancy');
const { checkPermission, checkRole } = require('../../middleware/rbac');
const { validate } = require('../../middleware/validator');
const clientDbController = require('./client-db.controller');
const {
  listConfigsSchema,
  createConfigSchema,
  updateConfigSchema,
  listLogsSchema,
  testConnectionSchema,
  pullCampaignDataSchema,
  saveActiveConfigSchema,
} = require('./client-db.validation');

const router = express.Router();

// Strict RBAC: Only MASTER_ADMIN, ORGANIZATION_ADMIN, and ORG_ADMIN can ever access external DB routes.
router.use(authenticate, setTenantContext, checkRole('MASTER_ADMIN', 'ORGANIZATION_ADMIN', 'ORG_ADMIN'));

// Test External Database Connection (pg / mysql)
router.post(
  '/test-connection',
  checkPermission('tenancy', 'read'),
  validate(testConnectionSchema, 'body'),
  clientDbController.testConnection
);

router.post(
  '/configs/test-connection',
  checkPermission('tenancy', 'read'),
  validate(testConnectionSchema, 'body'),
  clientDbController.testConnection
);

// Organization Active DB Config (Get & Save)
router.get(
  '/active-config',
  checkPermission('tenancy', 'read'),
  clientDbController.getActiveConfig
);

router.post(
  '/active-config',
  checkPermission('tenancy', 'update'),
  validate(saveActiveConfigSchema, 'body'),
  clientDbController.saveActiveConfig
);

// Pull Campaign Table Data from Client DB into CRM
router.post(
  '/pull-campaign-data',
  checkPermission('tenancy', 'update'),
  validate(pullCampaignDataSchema, 'body'),
  clientDbController.pullCampaignData
);

router.post(
  '/pull-data',
  checkPermission('tenancy', 'update'),
  validate(pullCampaignDataSchema, 'body'),
  clientDbController.pullCampaignData
);

// List & create configs
router.get(
  '/configs',
  checkPermission('tenancy', 'read'),
  validate(listConfigsSchema, 'query'),
  clientDbController.listConfigs
);

router.post(
  '/configs',
  checkPermission('tenancy', 'create'),
  validate(createConfigSchema, 'body'),
  clientDbController.createConfig
);

// Specific config operations
router.get(
  '/configs/:id',
  checkPermission('tenancy', 'read'),
  clientDbController.getConfigById
);

router.put(
  '/configs/:id',
  checkPermission('tenancy', 'update'),
  validate(updateConfigSchema, 'body'),
  clientDbController.updateConfig
);

router.post(
  '/configs/:id/toggle',
  checkPermission('tenancy', 'update'),
  clientDbController.toggleConfig
);

router.post(
  '/configs/:id/trigger',
  checkPermission('tenancy', 'update'),
  clientDbController.triggerSync
);

router.get(
  '/configs/:id/logs',
  checkPermission('tenancy', 'read'),
  validate(listLogsSchema, 'query'),
  clientDbController.getLogs
);

module.exports = router;
