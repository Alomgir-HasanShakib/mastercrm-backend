/**
 * @file index.js
 * @description Audit log module entry point exporting router, controller, service, model, and validation.
 */

const auditLogRoutes = require('./audit-log.routes');
const auditLogController = require('./audit-log.controller');
const auditLogService = require('./audit-log.service');
const auditLogModel = require('./audit-log.model');
const auditLogValidation = require('./audit-log.validation');

module.exports = {
  routes: auditLogRoutes,
  router: auditLogRoutes,
  controller: auditLogController,
  service: auditLogService,
  model: auditLogModel,
  validation: auditLogValidation,
};
