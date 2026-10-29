/**
 * @file index.js
 * @description Tenancy module entry point exporting router, controller, service, model, and validation.
 */

const tenancyRoutes = require('./tenancy.routes');
const tenancyController = require('./tenancy.controller');
const organizationController = require('./organization.controller');
const tenancyService = require('./tenancy.service');
const tenancyModel = require('./tenancy.model');
const tenancyValidation = require('./tenancy.validation');

module.exports = {
  routes: tenancyRoutes,
  router: tenancyRoutes,
  controller: tenancyController,
  organizationController,
  service: tenancyService,
  model: tenancyModel,
  validation: tenancyValidation,
};
