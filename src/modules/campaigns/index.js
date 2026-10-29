/**
 * @file index.js
 * @description Campaigns domain module entry point.
 */

const campaignController = require('./campaign.controller');
const campaignService = require('./campaign.service');
const { projectsRoutes: campaignRoutes } = require('../projects');

module.exports = {
  campaignController,
  campaignService,
  campaignRoutes,
  routes: campaignRoutes,
};
