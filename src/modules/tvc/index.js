/**
 * @file index.js
 * @description TVC module entry point exporting router, controller, service, model, and validation.
 */

const tvcRoutes = require('./tvc.routes');
const tvcController = require('./tvc.controller');
const tvcService = require('./tvc.service');
const tvcModel = require('./tvc.model');
const tvcValidation = require('./tvc.validation');

module.exports = {
  routes: tvcRoutes,
  router: tvcRoutes,
  controller: tvcController,
  service: tvcService,
  model: tvcModel,
  validation: tvcValidation,
};
