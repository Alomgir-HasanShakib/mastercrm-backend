/**
 * @file index.js
 * @description Feedback module entry point exporting router, controller, service, model, and validation.
 */

const feedbackRoutes = require('./feedback.routes');
const feedbackController = require('./feedback.controller');
const feedbackService = require('./feedback.service');
const feedbackModel = require('./feedback.model');
const feedbackValidation = require('./feedback.validation');

module.exports = {
  routes: feedbackRoutes,
  router: feedbackRoutes,
  controller: feedbackController,
  service: feedbackService,
  model: feedbackModel,
  validation: feedbackValidation,
};
