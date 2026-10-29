/**
 * @file index.js
 * @description Questionnaire module entry point exporting router, controller, service, model, and validation schemas.
 */

const questionnaireRoutes = require('./questionnaire.routes');
const questionnaireController = require('./questionnaire.controller');
const questionnaireService = require('./questionnaire.service');
const questionnaireModel = require('./questionnaire.model');
const questionnaireValidation = require('./questionnaire.validation');

module.exports = {
  routes: questionnaireRoutes,
  router: questionnaireRoutes,
  controller: questionnaireController,
  service: questionnaireService,
  model: questionnaireModel,
  validation: questionnaireValidation,
};
