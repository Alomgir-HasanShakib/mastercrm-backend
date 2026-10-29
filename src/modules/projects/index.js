/**
 * @file index.js
 * @description Module exporter for projects module.
 */

const projectsService = require('./projects.service');
const projectsController = require('./projects.controller');
const projectsRoutes = require('./projects.routes');

module.exports = {
  projectsService,
  projectsController,
  projectsRoutes,
};
