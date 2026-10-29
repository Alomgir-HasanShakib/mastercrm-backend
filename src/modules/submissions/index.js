/**
 * @file index.js
 * @description Submissions module entry point exporting router, controller, service, model, and validation.
 */

const submissionsRoutes = require('./submissions.routes');
const submissionsController = require('./submissions.controller');
const submissionsService = require('./submissions.service');
const submissionsModel = require('./submissions.model');
const submissionsValidation = require('./submissions.validation');

module.exports = {
  routes: submissionsRoutes,
  router: submissionsRoutes,
  controller: submissionsController,
  service: submissionsService,
  model: submissionsModel,
  validation: submissionsValidation,
};
