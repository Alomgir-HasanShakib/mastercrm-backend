/**
 * @file index.js
 * @description Exam module entry point exporting routes, controller, service, model, and validation.
 */

const examRoutes = require('./exam.routes');
const examController = require('./exam.controller');
const examService = require('./exam.service');
const examModel = require('./exam.model');
const examValidation = require('./exam.validation');

module.exports = {
  routes: examRoutes,
  router: examRoutes,
  controller: examController,
  service: examService,
  model: examModel,
  validation: examValidation,
};
