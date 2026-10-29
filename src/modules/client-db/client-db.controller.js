/**
 * @file client-db.controller.js
 * @description Controller actions for managing Client DB sync configs, running ad-hoc syncs, and viewing sync logs.
 */

const clientDbSyncService = require('./clientDbSync.service');
const { success, paginated } = require('../../utils/response');

/**
 * GET /api/v1/client-db/configs
 * List Client DB sync configurations with tenant scoping.
 */
const listConfigs = async (req, res, next) => {
  try {
    const { configs, total, page, limit } = await clientDbSyncService.listConfigs(
      req.query,
      { page: req.query.page, limit: req.query.limit },
      req.tenantContext
    );
    return paginated(res, configs, { page, limit, total, totalPages: Math.ceil(total / limit) }, 'Client DB sync configurations retrieved successfully');
  } catch (err) {
    return next(err);
  }
};

/**
 * GET /api/v1/client-db/configs/:id
 * Retrieve a single Client DB sync configuration.
 */
const getConfigById = async (req, res, next) => {
  try {
    const config = await clientDbSyncService.getConfigById(req.params.id, req.tenantContext);
    return success(res, config, 'Client DB sync configuration retrieved successfully');
  } catch (err) {
    return next(err);
  }
};

/**
 * POST /api/v1/client-db/configs
 * Create a new Client DB sync configuration.
 */
const createConfig = async (req, res, next) => {
  try {
    const created = await clientDbSyncService.createConfig(req.body, req.tenantContext);
    return success(res, created, 'Client DB sync configuration created successfully', 201);
  } catch (err) {
    return next(err);
  }
};

/**
 * PUT /api/v1/client-db/configs/:id
 * Update an existing Client DB sync configuration.
 */
const updateConfig = async (req, res, next) => {
  try {
    const updated = await clientDbSyncService.updateConfig(req.params.id, req.body, req.tenantContext);
    return success(res, updated, 'Client DB sync configuration updated successfully');
  } catch (err) {
    return next(err);
  }
};

/**
 * POST /api/v1/client-db/configs/:id/toggle
 * Toggle active state of a sync configuration.
 */
const toggleConfig = async (req, res, next) => {
  try {
    const toggled = await clientDbSyncService.toggleConfig(req.params.id, req.tenantContext);
    return success(res, toggled, `Client DB sync configuration is now ${toggled.isActive ? 'ACTIVE' : 'PAUSED'}`);
  } catch (err) {
    return next(err);
  }
};

/**
 * POST /api/v1/client-db/configs/:id/trigger
 * Manually trigger an immediate sync run.
 */
const triggerSync = async (req, res, next) => {
  try {
    const result = await clientDbSyncService.triggerSync(req.params.id, req.tenantContext);
    return success(res, result, 'Manual synchronization initiated successfully');
  } catch (err) {
    return next(err);
  }
};

/**
 * GET /api/v1/client-db/configs/:id/logs
 * Retrieve execution logs for a sync configuration.
 */
const getLogs = async (req, res, next) => {
  try {
    const { logs, total, page, limit } = await clientDbSyncService.getLogs(
      req.params.id,
      { page: req.query.page, limit: req.query.limit },
      req.tenantContext
    );
    return paginated(res, logs, { page, limit, total, totalPages: Math.ceil(total / limit) }, 'Client DB sync logs retrieved successfully');
  } catch (err) {
    return next(err);
  }
};

/**
 * POST /api/v1/client-db/test-connection
 * POST /api/v1/client-db/configs/test-connection
 * Tests live connection to external PostgreSQL or MySQL database.
 */
const testConnection = async (req, res, next) => {
  try {
    const result = await clientDbSyncService.testExternalConnection(req.body, req.tenantContext);
    return success(res, result, result.message || 'Connection test evaluated');
  } catch (err) {
    return next(err);
  }
};

/**
 * GET /api/v1/client-db/active-config
 * Retrieves the organization's active external database configuration.
 */
const getActiveConfig = async (req, res, next) => {
  try {
    const requestedOrgId = req.query.organizationId || req.query.organization_id || null;
    const active = await clientDbSyncService.getActiveConfig(req.tenantContext, requestedOrgId);
    return success(res, active, 'Active organization DB configuration retrieved');
  } catch (err) {
    return next(err);
  }
};

/**
 * POST /api/v1/client-db/active-config
 * Saves or updates the organization's primary external database configuration.
 */
const saveActiveConfig = async (req, res, next) => {
  try {
    const saved = await clientDbSyncService.saveActiveConfig(req.body, req.tenantContext);
    return success(res, saved, 'Organization external database configuration saved successfully', 201);
  } catch (err) {
    return next(err);
  }
};

/**
 * POST /api/v1/client-db/pull-campaign-data
 * Dynamically queries client DB for a campaign table and pulls records into CRM database.
 */
const pullCampaignData = async (req, res, next) => {
  try {
    const payload = {
      ...req.body,
      projectId: req.body.projectId || req.body.campaignId || req.params.id,
      campaignId: req.body.campaignId || req.body.projectId || req.params.id,
    };
    const result = await clientDbSyncService.pullCampaignData(payload, req.tenantContext);
    return success(res, result, result.details || 'Campaign data pulled successfully');
  } catch (err) {
    return next(err);
  }
};

module.exports = {
  listConfigs,
  getConfigById,
  createConfig,
  updateConfig,
  toggleConfig,
  triggerSync,
  getLogs,
  testConnection,
  getActiveConfig,
  saveActiveConfig,
  pullCampaignData,
};
