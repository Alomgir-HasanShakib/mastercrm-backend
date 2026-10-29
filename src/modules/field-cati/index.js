/**
 * @file index.js
 * @description Field CATI & Offline Sync module entry point exporting routes, controller, service, model, and validation.
 */

const fieldCatiRoutes = require('./field-cati.routes');
const fieldCatiController = require('./field-cati.controller');
const fieldCatiService = require('./field-cati.service');
const fieldCatiModel = require('./field-cati.model');
const fieldCatiValidation = require('./field-cati.validation');

module.exports = {
  routes: fieldCatiRoutes,
  router: fieldCatiRoutes,
  controller: fieldCatiController,
  service: fieldCatiService,
  model: fieldCatiModel,
  validation: fieldCatiValidation,
};
