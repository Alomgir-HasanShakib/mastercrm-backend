/**
 * @file operations.controller.js
 * @description Controller for operations endpoints including Rechain and Dashboard operational insights.
 */

const operationsService = require('./operations.service');
const { success } = require('../../utils/response');

const operationsController = {
  /**
   * POST /api/v1/operations/rechain
   * Rechain stalled/incomplete data for a specific date or all dates and recycle to pending queue.
   */
  async rechain(req, res, next) {
    try {
      const result = await operationsService.executeRechain(req.body, req.user);
      return success(res, result, result.message, 200);
    } catch (err) {
      return next(err);
    }
  },

  /**
   * GET /api/v1/operations/rechain/preview
   * Preview candidate records for rechain without mutating database.
   */
  async previewRechain(req, res, next) {
    try {
      const result = await operationsService.previewRechain(req.query);
      return success(res, result, 'Rechain candidate preview generated', 200);
    } catch (err) {
      return next(err);
    }
  },

  /**
   * GET /api/v1/operations/dashboard-insights
   * Retrieve real-time operational dashboard insights, throughput charts, vendor speedometers, and AC distribution.
   */
  async getDashboardInsights(req, res, next) {
    try {
      const data = await operationsService.getDashboardInsights(req.query);
      return success(res, data, 'Operational dashboard insights retrieved', 200);
    } catch (err) {
      return next(err);
    }
  },
};

module.exports = operationsController;
