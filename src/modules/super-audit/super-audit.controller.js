/**
 * @file super-audit.controller.js
 * @description Controller handling HTTP endpoints for Super Audit, QC sampling, and confirm/overrule workflows.
 */

const { success, paginated } = require('../../utils/response');
const { parsePagination, buildPaginationMeta } = require('../../utils/pagination');
const { db, withDbFallback } = require('../../database/connection');
const mockStore = require('../../database/mockStore');
const superAuditService = require('./super-audit.service');
const auditLogService = require('../audit-log/audit-log.service');
const aiSuperAuditWorker = require('./aiSuperAuditWorker.service');
const clientDbSuperAudit = require('./clientDbSuperAudit.service');
const superAuditTables = require('./superAuditTables.service');

const superAuditController = {
  /**
   * List super audits
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
        superAuditorId: req.query.superAuditorId,
        status: req.query.status,
        decision: req.query.decision,
        routingReason: req.query.routingReason,
        dateFrom: req.query.dateFrom,
        dateTo: req.query.dateTo,
        search: req.query.search,
      };

      const { superAudits, total } = await superAuditService.listAudits(filters, pagination, req.tenantContext);
      const meta = buildPaginationMeta(total, pagination.page, pagination.limit);

      return paginated(res, superAudits, meta, 'Super Audits retrieved successfully');
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Get single super audit by ID
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async getById(req, res, next) {
    try {
      const audit = await superAuditService.getAuditById(req.params.id);
      return success(res, audit, 'Super Audit details retrieved successfully');
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Route single submission into Super Audit queue
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async routeSubmission(req, res, next) {
    try {
      const routed = await superAuditService.routeSubmission(req.body, req.tenantContext);

      await auditLogService.createAuditLog({
        userId: req.user?.id,
        organizationId: req.tenantContext?.organizationId,
        action: 'SUPER_AUDIT_ROUTE',
        entityType: 'super_audits',
        entityId: routed.id,
        module: 'super-audit',
        newValues: req.body,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return success(res, routed, 'Submission routed to Super Audit successfully', 201);
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Trigger batch sampling into Super Audit queue
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async sampleBatch(req, res, next) {
    try {
      const result = await superAuditService.runBatchSampling(req.body, req.tenantContext);

      await auditLogService.createAuditLog({
        userId: req.user?.id,
        organizationId: req.tenantContext?.organizationId,
        action: 'SUPER_AUDIT_BATCH_SAMPLING',
        entityType: 'super_audits',
        entityId: 'batch',
        module: 'super-audit',
        newValues: { routedCount: result.routedCount, projectId: req.body.projectId },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return success(res, result, 'Sampling batch generated successfully');
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Assign Super Auditor
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async assignAuditor(req, res, next) {
    try {
      const updated = await superAuditService.assignSuperAuditor(req.params.id, req.body.superAuditorId);

      await auditLogService.createAuditLog({
        userId: req.user?.id,
        organizationId: req.tenantContext?.organizationId,
        action: 'SUPER_AUDIT_ASSIGN',
        entityType: 'super_audits',
        entityId: req.params.id,
        module: 'super-audit',
        newValues: { superAuditorId: req.body.superAuditorId },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return success(res, updated, 'Super Auditor assigned successfully');
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Start super audit review session
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async startAudit(req, res, next) {
    try {
      const updated = await superAuditService.startAudit(req.params.id, req.user?.id);
      return success(res, updated, 'Super Audit session started');
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Save super audit evaluation items
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async saveItems(req, res, next) {
    try {
      const saved = await superAuditService.saveAuditItems(req.params.id, req.body.items);

      await auditLogService.createAuditLog({
        userId: req.user?.id,
        organizationId: req.tenantContext?.organizationId,
        action: 'SUPER_AUDIT_SAVE_ITEMS',
        entityType: 'super_audits',
        entityId: req.params.id,
        module: 'super-audit',
        newValues: { count: saved.length },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return success(res, saved, 'Super audit items saved');
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Submit decision (Confirm or Overrule)
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async submitDecision(req, res, next) {
    try {
      const result = await superAuditService.submitDecision(req.params.id, req.body, req.user);

      await auditLogService.createAuditLog({
        userId: req.user?.id,
        organizationId: req.tenantContext?.organizationId,
        action: 'SUPER_AUDIT_SUBMIT_DECISION',
        entityType: 'super_audits',
        entityId: req.params.id,
        module: 'super-audit',
        newValues: { decision: req.body.decision, varianceScore: result.variance_score },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return success(res, result, 'Super Audit decision submitted successfully');
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Get Super Audit QC metrics
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async getMetrics(req, res, next) {
    try {
      const filters = {
        projectId: req.query.projectId,
        vendorId: req.query.vendorId,
        superAuditorId: req.query.superAuditorId,
        dateFrom: req.query.dateFrom,
        dateTo: req.query.dateTo,
      };

      const metrics = await superAuditService.getMetrics(filters, req.tenantContext);
      return success(res, metrics, 'Super Audit metrics retrieved successfully');
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Get Autonomous AI Super Audit Worker status & live stats
   */
  async getAutoWorkerStatus(req, res, next) {
    try {
      const status = aiSuperAuditWorker.getWorkerStatus();
      return success(res, status, 'AI Super Audit Worker status retrieved successfully');
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Toggle Autonomous AI Super Audit Worker ON/OFF
   */
  async toggleAutoWorker(req, res, next) {
    try {
      const status = aiSuperAuditWorker.toggleWorker();

      await auditLogService.createAuditLog({
        userId: req.user?.id,
        organizationId: req.user?.organization_id || req.tenantContext?.organizationId,
        action: 'AI_SUPER_AUDIT_WORKER_TOGGLE',
        entityType: 'worker_pool',
        entityId: 'super_audit_auto_worker',
        module: 'SUPER_AUDIT',
        newValues: { isEnabled: status.isEnabled, status: status.status },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return success(res, status, `AI Super Audit Worker is now ${status.isEnabled ? 'ENABLED' : 'PAUSED'}`);
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Force run AI Super Audit Worker immediately (bypassing 10 AM - 7 PM schedule for testing/batch)
   */
  async forceRunWorker(req, res, next) {
    try {
      const status = await aiSuperAuditWorker.forceRunNow();

      await auditLogService.createAuditLog({
        userId: req.user?.id,
        organizationId: req.user?.organization_id || req.tenantContext?.organizationId,
        action: 'AI_SUPER_AUDIT_WORKER_FORCE_RUN',
        entityType: 'worker_pool',
        entityId: 'super_audit_auto_worker',
        module: 'SUPER_AUDIT',
        newValues: { status: status.status, isProcessing: status.isProcessing },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return success(res, status, 'AI Super Audit Worker immediate processing triggered');
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Helper to resolve all 3 table names from request body/query or associated project
   * @returns {Promise<{ inputTable: string, outputTable1: string, outputTable2: string }>}
   */
  async _resolveTripletTables(req) {
    let inputTable = req.body?.tableName || req.query?.tableName || req.body?.inputTable || req.query?.inputTable;
    let outputTable1 = req.body?.output1Table || req.query?.output1Table;
    let outputTable2 = req.body?.output2Table || req.query?.output2Table;

    const projectId = req.body?.projectId || req.query?.projectId;
    if (projectId) {
      try {
        const project = await db('projects').where('id', projectId).first();
        if (project) {
          if (!inputTable && project.client_table_name) inputTable = project.client_table_name;
          if (!outputTable1 && project.output1_table_name) outputTable1 = project.output1_table_name;
          if (!outputTable2 && project.output2_table_name) outputTable2 = project.output2_table_name;

          if (project.config) {
            const cfg = typeof project.config === 'string' ? JSON.parse(project.config) : project.config;
            if (!inputTable && cfg?.client_table_name) inputTable = cfg.client_table_name;
            if (!outputTable1 && cfg?.output1_table_name) outputTable1 = cfg.output1_table_name;
            if (!outputTable2 && cfg?.output2_table_name) outputTable2 = cfg.output2_table_name;
          }
        }
      } catch (_) {}
    }

    inputTable = (inputTable || 'as_audit_input_ac_r3_sup').trim();
    return superAuditTables.deriveTripletTableNames(inputTable, outputTable1, outputTable2);
  },

  /**
   * Pull new records from client DB into our Input table with deduplication
   */
  async pullClientDb(req, res, next) {
    try {
      const { inputTable, outputTable1, outputTable2 } = await superAuditController._resolveTripletTables(req);
      const limit = parseInt(req.body?.limit || 50, 10);
      const result = await clientDbSuperAudit.pullClientData(inputTable, {
        output1Table: outputTable1,
        output2Table: outputTable2,
        limit,
      });
      return success(res, result, result.message);
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Push completed audits from Output 1 and Output 2 tables back to client DB
   */
  async pushClientDb(req, res, next) {
    try {
      const { inputTable, outputTable1, outputTable2 } = await superAuditController._resolveTripletTables(req);
      const limit = parseInt(req.body?.limit || 50, 10);
      const result = await clientDbSuperAudit.pushClientData(inputTable, {
        output1Table: outputTable1,
        output2Table: outputTable2,
        limit,
      });
      return success(res, result, result.message);
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Get statistics of client triplet tables
   */
  async getClientDbStats(req, res, next) {
    try {
      const { inputTable, outputTable1, outputTable2 } = await superAuditController._resolveTripletTables(req);
      const stats = await clientDbSuperAudit.getTableStats(inputTable, {
        output1Table: outputTable1,
        output2Table: outputTable2,
      });
      return success(res, stats, 'Client DB Super Audit table statistics retrieved successfully');
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Get live Super Audit survey input records directly from database table
   */
  async getRecordsFromDb(req, res, next) {
    try {
      const { inputTable, outputTable1, outputTable2 } = await superAuditController._resolveTripletTables(req);
      const limit = parseInt(req.query?.limit || 50, 10);

      await superAuditTables.ensureDynamicTables(inputTable, outputTable1, outputTable2);

      let rows = await withDbFallback(
        async () => {
          let list = await db(inputTable)
            .orderBy('created_at', 'desc')
            .limit(limit);

          // If empty in database, automatically pull from client DB or seed initial batch
          if (list.length === 0) {
            await clientDbSuperAudit.pullClientData(inputTable, {
              output1Table: outputTable1,
              output2Table: outputTable2,
              limit: 10,
            });
            list = await db(inputTable).orderBy('created_at', 'desc').limit(limit);
          }
          return list;
        },
        () => (mockStore.data && mockStore.data[inputTable]) || []
      );

      return success(res, rows, `Retrieved ${rows.length} Super Audit records from database table ${inputTable}`);
    } catch (err) {
      return next(err);
    }
  },
};

module.exports = superAuditController;
