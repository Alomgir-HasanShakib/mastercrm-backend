/**
 * @file index.js
 * @description Geography module entry point exporting routes, controller, service, model, and validation.
 */

const geographyRoutes = require('./geography.routes');
const geographyController = require('./geography.controller');
const geographyService = require('./geography.service');
const geographyModel = require('./geography.model');
const geographyValidation = require('./geography.validation');

module.exports = {
  routes: geographyRoutes,
  router: geographyRoutes,
  controller: geographyController,
  service: geographyService,
  model: geographyModel,
  validation: geographyValidation,
};
