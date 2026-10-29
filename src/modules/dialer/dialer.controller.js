/**
 * @file dialer.controller.js
 * @description Controller handling incoming HTTP requests for Dialer Hub, Click-to-call, Webhooks, and CDR Ingestion.
 */

const { success, paginated } = require('../../utils/response');
const { parsePagination, buildPaginationMeta } = require('../../utils/pagination');
const dialerService = require('./dialer.service');
const auditLogService = require('../audit-log/audit-log.service');

const dialerController = {
  /**
   * Initiate click-to-call session
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async clickToCall(req, res, next) {
    try {
      const result = await dialerService.initiateCall(req.body, req.user);

      await auditLogService.createAuditLog({
        userId: req.user?.id,
        organizationId: req.tenantContext?.organizationId,
        action: 'DIALER_CLICK_TO_CALL',
        entityType: 'dialer_cdr',
        entityId: result.callId,
        module: 'dialer',
        newValues: {
          destinationNumber: req.body.destinationNumber,
          provider: result.provider,
          callId: result.callId,
        },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return success(res, result, 'Call initiated successfully', 201);
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Terminate active call session
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async hangupCall(req, res, next) {
    try {
      const result = await dialerService.hangupCall(req.body.callId, req.body.reason, req.user);

      await auditLogService.createAuditLog({
        userId: req.user?.id,
        organizationId: req.tenantContext?.organizationId,
        action: 'DIALER_HANGUP_CALL',
        entityType: 'dialer_cdr',
        entityId: req.body.callId,
        module: 'dialer',
        newValues: { callId: req.body.callId, reason: req.body.reason },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return success(res, result, 'Call terminated successfully');
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Telephony Webhook Receiver endpoint
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async handleWebhook(req, res, next) {
    try {
      const provider = req.params.provider || req.query.provider || 'generic';
      const result = await dialerService.processWebhook(provider, req.body, req.headers);
      return success(res, result, 'Webhook event processed successfully');
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Directly ingest completed Call Detail Record (CDR)
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async ingestCdr(req, res, next) {
    try {
      const cdr = await dialerService.ingestCdr(req.body);

      await auditLogService.createAuditLog({
        userId: req.user?.id,
        organizationId: req.tenantContext?.organizationId,
        action: 'DIALER_INGEST_CDR',
        entityType: 'dialer_cdr',
        entityId: cdr.id,
        module: 'dialer',
        newValues: { callId: req.body.callId, status: req.body.status },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return success(res, cdr, 'CDR ingested successfully', 201);
    } catch (err) {
      return next(err);
    }
  },

  /**
   * List Call Detail Records
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async listCdrs(req, res, next) {
    try {
      const pagination = parsePagination(req.query, {
        defaultPage: 1,
        defaultLimit: 20,
        defaultSortBy: 'created_at',
        defaultSortOrder: 'desc',
      });

      const filters = {
        projectId: req.query.projectId,
        agentId: req.query.agentId,
        module: req.query.module,
        status: req.query.status,
        provider: req.query.provider,
        direction: req.query.direction,
        dateFrom: req.query.dateFrom,
        dateTo: req.query.dateTo,
        search: req.query.search,
      };

      const { cdrs, total } = await dialerService.listCdrs(filters, pagination, req.tenantContext);
      const meta = buildPaginationMeta(total, pagination.page, pagination.limit);

      return paginated(res, cdrs, meta, 'CDR records retrieved successfully');
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Get single CDR by primary ID or call ID
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async getCdrById(req, res, next) {
    try {
      const cdr = await dialerService.getCdrById(req.params.id);
      return success(res, cdr, 'CDR details retrieved successfully');
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Get dialer statistics and telephony KPIs
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async getStats(req, res, next) {
    try {
      const filters = {
        projectId: req.query.projectId,
        agentId: req.query.agentId,
        module: req.query.module,
        dateFrom: req.query.dateFrom,
        dateTo: req.query.dateTo,
      };

      const stats = await dialerService.getDialerStats(filters, req.tenantContext);
      return success(res, stats, 'Dialer statistics retrieved successfully');
    } catch (err) {
      return next(err);
    }
  },
};

module.exports = dialerController;
