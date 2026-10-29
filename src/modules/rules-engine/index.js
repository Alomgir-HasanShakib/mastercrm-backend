/**
 * @file index.js
 * @description Rules engine module entry point exporting router, controller, service, model, and validation.
 */

const rulesEngineRoutes = require('./rules-engine.routes');
const rulesEngineController = require('./rules-engine.controller');
const rulesEngineService = require('./rules-engine.service');
const rulesEngineModel = require('./rules-engine.model');
const rulesEngineValidation = require('./rules-engine.validation');

module.exports = {
  routes: rulesEngineRoutes,
  router: rulesEngineRoutes,
  controller: rulesEngineController,
  service: rulesEngineService,
  model: rulesEngineModel,
  validation: rulesEngineValidation,
};
