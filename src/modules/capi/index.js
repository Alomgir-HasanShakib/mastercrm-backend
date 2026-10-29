/**
 * @file index.js
 * @description CAPI module entry point exporting router, controller, service, model, and validation.
 */

const capiRoutes = require('./capi.routes');
const capiController = require('./capi.controller');
const capiService = require('./capi.service');
const capiModel = require('./capi.model');
const capiValidation = require('./capi.validation');

module.exports = {
  routes: capiRoutes,
  router: capiRoutes,
  controller: capiController,
  service: capiService,
  model: capiModel,
  validation: capiValidation,
};
