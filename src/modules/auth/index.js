/**
 * @file index.js
 * @description Authentication module entry point exporting router, controller, service, model, and validation.
 */

const authRoutes = require('./auth.routes');
const authController = require('./auth.controller');
const authService = require('./auth.service');
const authModel = require('./auth.model');
const authValidation = require('./auth.validation');

module.exports = {
  routes: authRoutes,
  router: authRoutes,
  controller: authController,
  service: authService,
  model: authModel,
  validation: authValidation,
};
