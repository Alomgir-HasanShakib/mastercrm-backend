/**
 * @file index.js
 * @description Client DB Module exports.
 */

const routes = require('./client-db.routes');
const controller = require('./client-db.controller');
const service = require('./clientDbSync.service');
const validation = require('./client-db.validation');

module.exports = {
  routes,
  controller,
  service,
  validation,
};
