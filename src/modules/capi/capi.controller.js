/**
 * @file capi.controller.js
 * @description Controller handling incoming HTTP requests for audio-first CAPI audits.
 */

const { success, paginated } = require('../../utils/response');
const { parsePagination, buildPaginationMeta } = require('../../utils/pagination');
const capiService = require('./capi.service');
const aiWorkerPool = require('./capiAiWorkerPool.service');
const auditLogService = require('../audit-log/audit-log.service');
const aiAuditService = require('../ai/aiAudit.service');

const capiController = {
  /**
   * List CAPI audits
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
        auditorId: req.query.auditorId,
        status: req.query.status,
        decision: req.query.decision,
        auditType: req.query.auditType,
        dateFrom: req.query.dateFrom,
        dateTo: req.query.dateTo,
        search: req.query.search,
      };

      const { audits, total } = await capiService.listAudits(filters, pagination, req.tenantContext, req.user);
      const meta = buildPaginationMeta(total, pagination.page, pagination.limit);

      return paginated(res, audits, meta, 'CAPI Audits retrieved successfully');
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Get single CAPI audit by ID
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async getById(req, res, next) {
    try {
      const audit = await capiService.getAuditById(req.params.id);
      return success(res, audit, 'CAPI Audit details retrieved successfully');
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Create new CAPI audit
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async create(req, res, next) {
    try {
      const created = await capiService.createAudit(req.body, req.tenantContext);

      await auditLogService.createAuditLog({
        userId: req.user?.id,
        organizationId: req.tenantContext?.organizationId,
        action: 'CAPI_AUDIT_CREATE',
        entityType: 'capi_audits',
        entityId: created.id,
        module: 'capi',
        newValues: req.body,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return success(res, created, 'CAPI Audit created successfully', 201);
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Assign auditor
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async assignAuditor(req, res, next) {
    try {
      const updated = await capiService.assignAuditor(req.params.id, req.body.auditorId);

      await auditLogService.createAuditLog({
        userId: req.user?.id,
        organizationId: req.tenantContext?.organizationId,
        action: 'CAPI_AUDIT_ASSIGN',
        entityType: 'capi_audits',
        entityId: req.params.id,
        module: 'capi',
        newValues: { auditorId: req.body.auditorId },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return success(res, updated, 'Auditor assigned successfully');
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Start audit session
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async startAudit(req, res, next) {
    try {
      const updated = await capiService.startAudit(req.params.id, req.user?.id);
      return success(res, updated, 'Audit session started');
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Save audit item evaluations
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async saveItems(req, res, next) {
    try {
      const saved = await capiService.saveAuditItems(req.params.id, req.body.items);

      await auditLogService.createAuditLog({
        userId: req.user?.id,
        organizationId: req.tenantContext?.organizationId,
        action: 'CAPI_AUDIT_SAVE_ITEMS',
        entityType: 'capi_audits',
        entityId: req.params.id,
        module: 'capi',
        newValues: { count: saved.length },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return success(res, saved, 'Audit items evaluation saved');
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Finalize audit decision
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async submitDecision(req, res, next) {
    try {
      const result = await capiService.submitDecision(req.params.id, req.body, req.user);

      await auditLogService.createAuditLog({
        userId: req.user?.id,
        organizationId: req.tenantContext?.organizationId,
        action: 'CAPI_AUDIT_SUBMIT_DECISION',
        entityType: 'capi_audits',
        entityId: req.params.id,
        module: 'capi',
        newValues: { decision: req.body.decision, score: result.score },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return success(res, result, 'Audit decision submitted successfully');
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Get CAPI audit KPIs & metrics
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async getMetrics(req, res, next) {
    try {
      const filters = {
        projectId: req.query.projectId,
        vendorId: req.query.vendorId,
        auditorId: req.query.auditorId,
        dateFrom: req.query.dateFrom,
        dateTo: req.query.dateTo,
      };

      const metrics = await capiService.getMetrics(filters, req.tenantContext);
      return success(res, metrics, 'CAPI Audit metrics retrieved successfully');
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Fetch and atomically lock next queued audit for current auditor
   */
  async getNext(req, res, next) {
    try {
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
      const auditorId = req.user?.id;
      let projectId = req.query?.projectId || req.body?.projectId || req.query?.campaignId || req.body?.campaignId || null;
      if (projectId === 'undefined' || projectId === 'null' || (typeof projectId === 'string' && projectId.trim() === '')) {
        projectId = null;
      }
      if (!projectId) {
        return success(res, null, 'Please select a campaign to fetch pending audits');
      }
      const audit = await capiService.getNextQueuedAudit(auditorId, projectId, req.tenantContext);

      if (!audit) {
        return success(res, null, 'No pending CAPI audits available in queue');
      }

      return success(res, audit, 'Next CAPI audit locked and dispatched successfully');
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Get completed audits for current auditor (Auditor Isolation)
   */
  async getMyCompleted(req, res, next) {
    try {
      const pagination = parsePagination(req.query, {
        defaultPage: 1,
        defaultLimit: 20,
        defaultSortBy: 'audit_completed_at',
        defaultSortOrder: 'desc',
      });
      const auditorId = req.user?.id;
      const { audits, total } = await capiService.getMyCompletedAudits(auditorId, pagination);
      const meta = buildPaginationMeta(total, pagination.page, pagination.limit);

      return paginated(res, audits, meta, 'My completed CAPI audits retrieved successfully');
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Release in-progress audit back to queue
   */
  async releaseAudit(req, res, next) {
    try {
      const released = await capiService.releaseAudit(req.params.id, req.user);
      return success(res, released, 'Audit released back to queue successfully');
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Start Parallel AI Auditor Worker Pool for CAPI
   */
  async startAiAudit(req, res, next) {
    try {
      const { concurrency = 5, projectId = null } = req.body || {};
      const status = await aiWorkerPool.startWorkerPool({
        concurrency: parseInt(concurrency, 10) || 5,
        projectId,
        organizationId: req.user?.organization_id,
        user: req.user,
      });

      await auditLogService.createAuditLog({
        userId: req.user?.id,
        organizationId: req.user?.organization_id || req.tenantContext?.organizationId,
        action: 'AI_AUDITOR_WORKER_POOL_START',
        entityType: 'worker_pool',
        entityId: projectId ? String(projectId) : 'capi_ai_pool',
        module: 'CAPI',
        newValues: { concurrency: status.concurrency, projectId, activeWorkers: status.activeWorkers },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return success(res, status, `Started ${status.concurrency} parallel AI Auditors for CAPI`);
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Stop Parallel AI Auditor Worker Pool for CAPI
   */
  async stopAiAudit(req, res, next) {
    try {
      const status = aiWorkerPool.stopWorkerPool();

      await auditLogService.createAuditLog({
        userId: req.user?.id,
        organizationId: req.user?.organization_id || req.tenantContext?.organizationId,
        action: 'AI_AUDITOR_WORKER_POOL_STOP',
        entityType: 'worker_pool',
        entityId: 'capi_ai_pool',
        module: 'CAPI',
        newValues: { status: 'STOPPED' },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return success(res, status, 'AI Auditor Worker Pool stopped');
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Get Parallel AI Auditor Worker Pool Status & Metrics
   */
  async getAiAuditStatus(req, res, next) {
    try {
      const status = aiWorkerPool.getPoolStatus();
      return success(res, status, 'AI Auditor Worker Pool status retrieved');
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Activate Emergency Manual Override (7 PM IST Bypass) for 15m, 30m, or 1h
   */
  async activateEmergencyOverride(req, res, next) {
    try {
      const { durationMinutes = 30, duration = null } = req.body || {};
      const chosenDuration = duration || durationMinutes;
      const status = await aiAuditService.activateEmergencyOverride({
        durationMinutes: chosenDuration,
        activatedBy: req.user?.email || req.user?.name || 'Administrator',
      });

      await auditLogService.createAuditLog({
        userId: req.user?.id,
        organizationId: req.user?.organization_id || req.tenantContext?.organizationId,
        action: 'AI_AUDIT_EMERGENCY_OVERRIDE_ACTIVATED',
        entityType: 'ai_audit_scheduler',
        entityId: 'emergency_override',
        module: 'CAPI',
        newValues: status,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return success(res, status, `Emergency Manual Override activated for ${status.durationMinutes} minutes.`);
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Cancel Emergency Manual Override immediately
   */
  async cancelEmergencyOverride(req, res, next) {
    try {
      const status = await aiAuditService.cancelEmergencyOverride();

      await auditLogService.createAuditLog({
        userId: req.user?.id,
        organizationId: req.user?.organization_id || req.tenantContext?.organizationId,
        action: 'AI_AUDIT_EMERGENCY_OVERRIDE_CANCELLED',
        entityType: 'ai_audit_scheduler',
        entityId: 'emergency_override',
        module: 'CAPI',
        newValues: { active: false },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return success(res, status, 'Emergency Manual Override cancelled successfully.');
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Get current Emergency Manual Override status & remaining countdown
   */
  async getEmergencyOverrideStatus(req, res, next) {
    try {
      const status = aiAuditService.getEmergencyOverrideStatus();
      return success(res, status, 'Emergency Manual Override status retrieved');
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Get AI-Audited Records with KPI metrics, question breakdown, and filters (Strictly View-Only)
   */
  async getAiAuditedRecords(req, res, next) {
    try {
      const pagination = parsePagination(req.query, {
        defaultPage: 1,
        defaultLimit: 20,
        defaultSortBy: 'surveyed_at',
        defaultSortOrder: 'desc',
      });

      const filters = {
        decision: req.query.decision,
        projectId: req.query.projectId,
        search: req.query.search,
        dateFrom: req.query.dateFrom,
        dateTo: req.query.dateTo,
      };

      const { records, metrics, total } = await capiService.getAiAuditedRecords(
        filters,
        pagination,
        req.tenantContext,
        req.user
      );
      const meta = buildPaginationMeta(total, pagination.page, pagination.limit);

      return res.status(200).json({
        success: true,
        data: records,
        metrics,
        meta,
        message: 'AI Audited Records retrieved successfully',
      });
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Resolve an AI Review Flag by a Supervisor
   */
  async resolveAiReview(req, res, next) {
    try {
      const { id } = req.params;
      const resolution = await capiService.resolveAiReview(
        id,
        req.body,
        req.tenantContext,
        req.user
      );

      return res.status(200).json({
        success: true,
        data: resolution,
        message: 'Supervisor manual review saved and resolved successfully',
      });
    } catch (err) {
      logger.error('Error resolving AI review lead: %s', err.message);
      return next(err);
    }
  },

  /**
   * Get count stats for audited export before generating download.
   */
  async getAuditedExportStats(req, res, next) {
    try {
      const filters = {
        vendorId: req.query.vendorId,
        projectId: req.query.projectId,
        decision: req.query.decision,
        date: req.query.date,
        dateFrom: req.query.dateFrom,
        dateTo: req.query.dateTo,
        dateFilterType: req.query.dateFilterType,
      };

      const stats = await capiService.getAuditedExportStats(
        filters,
        req.tenantContext,
        req.user
      );

      return res.status(200).json({
        success: true,
        data: stats,
        message: 'Audited export stats retrieved successfully',
      });
    } catch (err) {
      logger.error('Error fetching audited export stats: %s', err.message);
      return next(err);
    }
  },

  /**
   * Export Audited Leads as Excel (.xlsx) or CSV with Question & Answer Validation columns.
   */
  async exportAuditedRecords(req, res, next) {
    try {
      const filters = {
        vendorId: req.query.vendorId,
        projectId: req.query.projectId,
        decision: req.query.decision,
        date: req.query.date,
        dateFrom: req.query.dateFrom,
        dateTo: req.query.dateTo,
        dateFilterType: req.query.dateFilterType,
        scope: req.query.scope,
        format: req.query.format,
        layout: req.query.layout,
      };

      const result = await capiService.exportAuditedRecords(
        filters,
        req.tenantContext,
        req.user
      );

      if (result.fileBuffer) {
        res.setHeader('Content-Type', result.contentType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
        res.setHeader('X-Total-Count', String(result.recordCount));
        return res.status(200).send(result.fileBuffer);
      }

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      res.setHeader('X-Total-Count', String(result.recordCount));

      return res.status(200).send(result.csvContent);
    } catch (err) {
      logger.error('Error exporting audited records: %s', err.message);
      return next(err);
    }
  },
};

module.exports = capiController;
