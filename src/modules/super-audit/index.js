/**
 * @file index.js
 * @description Super Audit module entry point exporting router, controller, service, model, and validation.
 */

const superAuditRoutes = require('./super-audit.routes');
const superAuditController = require('./super-audit.controller');
const superAuditService = require('./super-audit.service');
const superAuditModel = require('./super-audit.model');
const superAuditValidation = require('./super-audit.validation');

module.exports = {
  routes: superAuditRoutes,
  router: superAuditRoutes,
  controller: superAuditController,
  service: superAuditService,
  model: superAuditModel,
  validation: superAuditValidation,
};
