/**
 * @file breaks.controller.js
 * @description Controller for Operational Breaks, Lockout, and Admin Productivity Monitoring.
 */

const breaksService = require('./breaks.service');
const { success } = require('../../utils/response');

const breaksController = {
  /**
   * POST /api/v1/breaks/start
   * Start a new break session for current user.
   */
  async startBreak(req, res, next) {
    try {
      const breakRecord = await breaksService.startBreak(req.user, req.body);
      return success(res, breakRecord, 'Break initiated successfully. Lockout mode engaged.', 201);
    } catch (err) {
      return next(err);
    }
  },

  /**
   * POST /api/v1/breaks/end
   * Conclude current user's active break session and resume normal work.
   */
  async endBreak(req, res, next) {
    try {
      const summary = await breaksService.endBreak(req.user);
      return success(res, summary, 'Break completed successfully. Work resumed.', 200);
    } catch (err) {
      return next(err);
    }
  },

  /**
   * GET /api/v1/breaks/my-today
   * Retrieve active break (if any) and today's break breakdown for the logged-in agent.
   */
  async getMyTodayBreaks(req, res, next) {
    try {
      const data = await breaksService.getMyTodayBreaks(req.user);
      return success(res, data, "Today's break status retrieved successfully.", 200);
    } catch (err) {
      return next(err);
    }
  },

  /**
   * GET /api/v1/breaks/admin/live
   * Live list of all agents currently on break across the system.
   */
  async getAdminLiveBreaks(req, res, next) {
    try {
      const data = await breaksService.getAdminLiveBreaks();
      return success(res, data, 'Active breaks across all agents retrieved.', 200);
    } catch (err) {
      return next(err);
    }
  },

  /**
   * GET /api/v1/breaks/admin/reports
   * Filterable reports, historical records, and aggregated break productivity summary for admins.
   */
  async getAdminBreakReports(req, res, next) {
    try {
      const data = await breaksService.getAdminBreakReports(req.query);
      return success(res, data, 'Break and productivity audit reports generated.', 200);
    } catch (err) {
      return next(err);
    }
  },
};

module.exports = breaksController;
