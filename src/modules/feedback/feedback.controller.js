/**
 * @file feedback.controller.js
 * @description Controller handling incoming HTTP requests for FA Feedback calling, admissions, and disputes.
 */

const { success, paginated } = require('../../utils/response');
const { parsePagination, buildPaginationMeta } = require('../../utils/pagination');
const feedbackService = require('./feedback.service');
const auditLogService = require('../audit-log/audit-log.service');

const feedbackController = {
  /**
   * List feedback leads
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async list(req, res, next) {
    try {
      const pagination = parsePagination(req.query, {
        defaultPage: 1,
        defaultLimit: 20,
        defaultSortBy: 'created_at',
        defaultSortOrder: 'desc',
      });

      const filters = {
        projectId: req.query.projectId,
        vendorId: req.query.vendorId,
        fieldAgentId: req.query.fieldAgentId,
        feedbackCallerId: req.query.feedbackCallerId,
        status: req.query.status,
        resolution: req.query.resolution,
        originModule: req.query.originModule,
        search: req.query.search,
      };

      const { leads, total } = await feedbackService.listLeads(filters, pagination, req.tenantContext);
      const meta = buildPaginationMeta(total, pagination.page, pagination.limit);

      return paginated(res, leads, meta, 'Feedback leads retrieved successfully');
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Get single feedback lead by ID
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async getById(req, res, next) {
    try {
      const lead = await feedbackService.getLeadById(req.params.id);
      return success(res, lead, 'Feedback lead details retrieved successfully');
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Create a new feedback lead
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async create(req, res, next) {
    try {
      const created = await feedbackService.createLead(req.body, req.tenantContext);

      await auditLogService.createAuditLog({
        userId: req.user?.id,
        organizationId: req.tenantContext?.organizationId,
        action: 'FEEDBACK_LEAD_CREATE',
        entityType: 'feedback_leads',
        entityId: created.id,
        module: 'feedback',
        newValues: req.body,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return success(res, created, 'Feedback lead created successfully', 201);
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Assign feedback caller
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async assignCaller(req, res, next) {
    try {
      const updated = await feedbackService.assignCaller(req.params.id, req.body.callerId);

      await auditLogService.createAuditLog({
        userId: req.user?.id,
        organizationId: req.tenantContext?.organizationId,
        action: 'FEEDBACK_LEAD_ASSIGN',
        entityType: 'feedback_leads',
        entityId: req.params.id,
        module: 'feedback',
        newValues: { callerId: req.body.callerId },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return success(res, updated, 'Feedback caller assigned successfully');
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Record feedback call attempt
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async logAttempt(req, res, next) {
    try {
      const result = await feedbackService.logAttempt(req.params.id, req.body, req.user);

      await auditLogService.createAuditLog({
        userId: req.user?.id,
        organizationId: req.tenantContext?.organizationId,
        action: 'FEEDBACK_CALL_ATTEMPT',
        entityType: 'feedback_leads',
        entityId: req.params.id,
        module: 'feedback',
        newValues: {
          disposition: req.body.disposition,
          mistakeAdmitted: req.body.mistakeAdmitted,
          resolution: result.lead.resolution,
        },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return success(res, result, 'Feedback call attempt logged successfully', 201);
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Update lead resolution
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async updateResolution(req, res, next) {
    try {
      const updated = await feedbackService.updateResolution(req.params.id, req.body, req.user);

      await auditLogService.createAuditLog({
        userId: req.user?.id,
        organizationId: req.tenantContext?.organizationId,
        action: 'FEEDBACK_UPDATE_RESOLUTION',
        entityType: 'feedback_leads',
        entityId: req.params.id,
        module: 'feedback',
        newValues: req.body,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return success(res, updated, 'Feedback resolution updated successfully');
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Get call attempts for a lead
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async getAttempts(req, res, next) {
    try {
      const attempts = await feedbackService.getAttempts(req.params.id);
      return success(res, attempts, 'Feedback attempts retrieved successfully');
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Get feedback metrics and dispute rates
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async getMetrics(req, res, next) {
    try {
      const filters = {
        projectId: req.query.projectId,
        vendorId: req.query.vendorId,
        fieldAgentId: req.query.fieldAgentId,
        feedbackCallerId: req.query.feedbackCallerId,
        dateFrom: req.query.dateFrom,
        dateTo: req.query.dateTo,
      };

      const metrics = await feedbackService.getMetrics(filters, req.tenantContext);
      return success(res, metrics, 'Feedback metrics retrieved successfully');
    } catch (err) {
      return next(err);
    }
  },
};

module.exports = feedbackController;
