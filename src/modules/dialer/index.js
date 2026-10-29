/**
 * @file index.js
 * @description Dialer Hub module entry point exporting router, controller, service, model, and validation.
 */

const dialerRoutes = require('./dialer.routes');
const dialerController = require('./dialer.controller');
const dialerService = require('./dialer.service');
const dialerModel = require('./dialer.model');
const dialerValidation = require('./dialer.validation');

module.exports = {
  routes: dialerRoutes,
  router: dialerRoutes,
  controller: dialerController,
  service: dialerService,
  model: dialerModel,
  validation: dialerValidation,
};
