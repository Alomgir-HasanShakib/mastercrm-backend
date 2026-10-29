/**
 * @file index.js
 * @description Subscriptions module entry point.
 */

const routes = require('./subscription.routes');
const controller = require('./subscription.controller');
const service = require('./subscription.service');
const validation = require('./subscription.validation');

module.exports = {
  routes,
  controller,
  service,
  validation,
};
