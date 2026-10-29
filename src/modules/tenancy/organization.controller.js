/**
 * @file organization.controller.js
 * @description Dedicated controller for Organization entity management and module entitlement configuration.
 */

const tenancyController = require('./tenancy.controller');

module.exports = {
  listOrganizations: tenancyController.listOrganizations,
  getOrganization: tenancyController.getOrganization,
  createOrganization: tenancyController.createOrganization,
  updateOrganization: tenancyController.updateOrganization,
  updateOrganizationModules: tenancyController.updateOrganizationModules,
  deleteOrganization: tenancyController.deleteOrganization,
};
