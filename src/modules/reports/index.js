/**
 * @file index.js
 * @description Module exports for Unified Reporting & Analytics module.
 */

const routes = require('./reports.routes');
const controller = require('./reports.controller');
const service = require('./reports.service');
const model = require('./reports.model');
const validation = require('./reports.validation');

module.exports = {
  routes,
  controller,
  service,
  model,
  validation,
};
