/**
 * @file lookup.controller.js
 * @description HTTP Controller handling hierarchical lookups (PC -> AC, district -> assembly).
 */

const { success } = require('../../utils/response');
const lookupService = require('./lookup.service');

class LookupController {
  async getOptions(req, res, next) {
    try {
      const projectId = req.params.projectId || 'default';
      const datasetId = req.params.datasetId;
      const { parentCode, level } = req.query;

      const options = await lookupService.getNodes(projectId, datasetId, { parentCode, level });
      return success(res, options, 'Lookup options retrieved');
    } catch (err) {
      return next(err);
    }
  }

  async getHierarchy(req, res, next) {
    try {
      const projectId = req.params.projectId || 'default';
      const datasetId = req.params.datasetId;

      const hierarchy = await lookupService.getHierarchyDictionary(projectId, datasetId);
      return success(res, hierarchy, 'Lookup hierarchy retrieved');
    } catch (err) {
      return next(err);
    }
  }
}

module.exports = new LookupController();
