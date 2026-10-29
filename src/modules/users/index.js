/**
 * @file index.js
 * @description Users module entry point exporting router, controller, service, model, and validation.
 */

const usersRoutes = require('./users.routes');
const usersController = require('./users.controller');
const usersService = require('./users.service');
const usersModel = require('./users.model');
const usersValidation = require('./users.validation');

module.exports = {
  routes: usersRoutes,
  router: usersRoutes,
  controller: usersController,
  service: usersService,
  model: usersModel,
  validation: usersValidation,
};
