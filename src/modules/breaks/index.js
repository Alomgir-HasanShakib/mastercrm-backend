/**
 * @file index.js
 * @description Breaks module exports.
 */

const routes = require('./breaks.routes');
const controller = require('./breaks.controller');
const service = require('./breaks.service');

module.exports = {
  routes,
  controller,
  service,
};
