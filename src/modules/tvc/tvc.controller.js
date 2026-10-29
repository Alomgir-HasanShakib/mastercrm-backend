/**
 * @file tvc.controller.js
 * @description Controller handling incoming HTTP requests for Tele-verification (TVC) leads, queuing, and attempts.
 */

const { success, paginated } = require('../../utils/response');
const { parsePagination, buildPaginationMeta } = require('../../utils/pagination');
const tvcService = require('./tvc.service');
const auditLogService = require('../audit-log/audit-log.service');

const tvcController = {
  /**
   * List TVC leads with role-aware data isolation.
   * TVC agents can only see completed data verified by themselves.
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async list(req, res, next) {
    try {
      const pagination = parsePagination(req.query, {
        defaultPage: 1,
        defaultLimit: 20,
        defaultSortBy: 'priority',
        defaultSortOrder: 'desc',
      });

      const filters = {
        projectId: req.query.projectId,
        vendorId: req.query.vendorId,
        agentId: req.query.agentId,
        status: req.query.status,
        verificationStatus: req.query.verificationStatus,
        dueCallback: req.query.dueCallback === 'true',
        completedOnly: req.query.completedOnly,
        search: req.query.search,
      };

      const { leads, total } = await tvcService.listLeads(filters, pagination, req.tenantContext, req.user);
      const meta = buildPaginationMeta(total, pagination.page, pagination.limit);

      return paginated(res, leads, meta, 'TVC leads retrieved successfully');
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Get all completed verifications for the currently authenticated agent
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async getMyCompleted(req, res, next) {
    try {
      const pagination = parsePagination(req.query, {
        defaultPage: 1,
        defaultLimit: 20,
        defaultSortBy: 'updated_at',
        defaultSortOrder: 'desc',
      });

      const { leads, total } = await tvcService.getMyCompletedLeads(req.user?.id, pagination);
      const meta = buildPaginationMeta(total, pagination.page, pagination.limit);

      return paginated(res, leads, meta, 'My completed TVC verifications retrieved successfully');
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Get single TVC lead by ID
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async getById(req, res, next) {
    try {
      const lead = await tvcService.getLeadById(req.params.id);
      return success(res, lead, 'TVC lead details retrieved successfully');
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Enqueue a new TVC lead
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async create(req, res, next) {
    try {
      const created = await tvcService.createLead(req.body, req.tenantContext);

      await auditLogService.createAuditLog({
        userId: req.user?.id,
        organizationId: req.tenantContext?.organizationId,
        action: 'TVC_LEAD_CREATE',
        entityType: 'tvc_leads',
        entityId: created.id,
        module: 'tvc',
        newValues: req.body,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return success(res, created, 'TVC lead enqueued successfully', 201);
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Fetch next available queued lead for calling agent.
   * Single-lead lock: returns current active lead if one is already in progress.
   * 20-min lock timeout: auto-releases abandoned leads.
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async getNext(req, res, next) {
    try {
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
      const lead = await tvcService.getNextQueuedLead(
        req.user?.id,
        req.query.projectId,
        req.tenantContext
      );
      return success(res, lead, lead.message || 'Next queued lead assigned for calling');
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Start processing TVC lead (stops the 20-minute countdown lock)
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async startProcess(req, res, next) {
    try {
      const result = await tvcService.startProcess(req.params.id, req.user?.id);
      return success(res, result, 'TVC lead processing started. 20-minute lock stopped.');
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Release an in-progress lead lock back to queue
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async releaseLead(req, res, next) {
    try {
      const updated = await tvcService.releaseLead(req.params.id, req.user);

      await auditLogService.createAuditLog({
        userId: req.user?.id,
        organizationId: req.tenantContext?.organizationId,
        action: 'TVC_LEAD_RELEASE',
        entityType: 'tvc_leads',
        entityId: req.params.id,
        module: 'tvc',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return success(res, updated, 'TVC lead released back to queue');
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Assign lead to agent
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async assignLead(req, res, next) {
    try {
      const updated = await tvcService.assignLead(req.params.id, req.body.agentId);

      await auditLogService.createAuditLog({
        userId: req.user?.id,
        organizationId: req.tenantContext?.organizationId,
        action: 'TVC_LEAD_ASSIGN',
        entityType: 'tvc_leads',
        entityId: req.params.id,
        module: 'tvc',
        newValues: { agentId: req.body.agentId },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return success(res, updated, 'TVC lead assigned successfully');
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Record call attempt and disposition.
   * If verification completes, unlocks lead and permits agent to receive next lead.
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async logAttempt(req, res, next) {
    try {
      const result = await tvcService.logAttempt(req.params.id, req.body, req.user);

      await auditLogService.createAuditLog({
        userId: req.user?.id,
        organizationId: req.tenantContext?.organizationId,
        action: 'TVC_CALL_ATTEMPT',
        entityType: 'tvc_leads',
        entityId: req.params.id,
        module: 'tvc',
        newValues: {
          disposition: req.body.disposition,
          attemptNumber: result.attempt.attempt_number,
          leadStatus: result.lead.status,
        },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return success(res, result, 'Call attempt logged successfully', 201);
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Get attempt history for a lead
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async getAttempts(req, res, next) {
    try {
      const attempts = await tvcService.getAttempts(req.params.id);
      return success(res, attempts, 'Lead attempt history retrieved successfully');
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Get TVC metrics and KPIs
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async getMetrics(req, res, next) {
    try {
      const filters = {
        projectId: req.query.projectId,
        vendorId: req.query.vendorId,
        agentId: req.query.agentId,
        dateFrom: req.query.dateFrom,
        dateTo: req.query.dateTo,
      };

      const metrics = await tvcService.getMetrics(filters, req.tenantContext);
      return success(res, metrics, 'TVC metrics retrieved successfully');
    } catch (err) {
      return next(err);
    }
  },
};

module.exports = tvcController;
