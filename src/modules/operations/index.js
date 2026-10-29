/**
 * @file index.js
 * @description Operations module entry point.
 */

const routes = require('./operations.routes');
const controller = require('./operations.controller');
const service = require('./operations.service');

module.exports = {
  routes,
  controller,
  service,
};
