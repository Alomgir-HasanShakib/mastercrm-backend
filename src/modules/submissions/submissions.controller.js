/**
 * @file submissions.controller.js
 * @description Controller handling incoming HTTP requests for submissions lifecycle, responses, timeline, and sync.
 */

const { success, paginated } = require('../../utils/response');
const { parsePagination, buildPaginationMeta } = require('../../utils/pagination');
const submissionsService = require('./submissions.service');
const { auditLog } = require('../../services/auditLog');

const submissionsController = {
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
        stateId: req.query.stateId,
        sourceChannel: req.query.sourceChannel,
        sourceStatus: req.query.sourceStatus,
        capiStatus: req.query.capiStatus,
        agentId: req.query.agentId,
        dateFrom: req.query.dateFrom,
        dateTo: req.query.dateTo,
        search: req.query.search,
      };

      const { submissions, total } = await submissionsService.listSubmissions(
        filters,
        pagination,
        req.tenantContext
      );

      const meta = buildPaginationMeta(total, pagination.page, pagination.limit);
      return paginated(res, submissions, meta, 'Submissions retrieved successfully');
    } catch (err) {
      return next(err);
    }
  },

  async getById(req, res, next) {
    try {
      const submission = await submissionsService.getSubmissionById(req.params.id);
      return success(res, submission, 'Submission details retrieved successfully');
    } catch (err) {
      return next(err);
    }
  },

  async create(req, res, next) {
    try {
      const submission = await submissionsService.createSubmission(req.body, req.user?.id);

      await auditLog({
        userId: req.user?.id,
        organizationId: req.user?.organization_id,
        action: 'SUBMISSION_CREATE',
        resource: 'submissions',
        resourceId: submission.id,
        details: { submissionId: submission.submission_id, projectId: submission.project_id },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return success(res, submission, 'Submission created successfully', 201);
    } catch (err) {
      return next(err);
    }
  },

  async update(req, res, next) {
    try {
      const updated = await submissionsService.updateSubmission(req.params.id, req.body);

      await auditLog({
        userId: req.user?.id,
        organizationId: req.user?.organization_id,
        action: 'SUBMISSION_UPDATE',
        resource: 'submissions',
        resourceId: req.params.id,
        details: { changes: req.body },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return success(res, updated, 'Submission updated successfully');
    } catch (err) {
      return next(err);
    }
  },

  async updateStatus(req, res, next) {
    try {
      const updated = await submissionsService.updateStatus(req.params.id, req.body);

      await auditLog({
        userId: req.user?.id,
        organizationId: req.user?.organization_id,
        action: 'SUBMISSION_STATUS_CHANGE',
        resource: 'submissions',
        resourceId: req.params.id,
        details: { statusChanges: req.body },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return success(res, updated, 'Submission status updated successfully');
    } catch (err) {
      return next(err);
    }
  },

  async saveResponses(req, res, next) {
    try {
      const saved = await submissionsService.saveResponses(req.params.id, req.body.responses);

      await auditLog({
        userId: req.user?.id,
        organizationId: req.user?.organization_id,
        action: 'SUBMISSION_SAVE_RESPONSES',
        resource: 'submissions',
        resourceId: req.params.id,
        details: { count: saved.length },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return success(res, saved, 'Responses saved successfully');
    } catch (err) {
      return next(err);
    }
  },

  async getResponses(req, res, next) {
    try {
      const responses = await submissionsService.getResponses(req.params.id);
      return success(res, responses, 'Submission responses retrieved successfully');
    } catch (err) {
      return next(err);
    }
  },

  async getTimeline(req, res, next) {
    try {
      const timeline = await submissionsService.getTimeline(req.params.id);
      return success(res, timeline, 'Submission timeline retrieved successfully');
    } catch (err) {
      return next(err);
    }
  },

  async syncOffline(req, res, next) {
    try {
      const result = await submissionsService.syncOfflineSubmissions(req.body.submissions, req.user?.id);

      await auditLog({
        userId: req.user?.id,
        organizationId: req.user?.organization_id,
        action: 'SUBMISSION_OFFLINE_SYNC',
        resource: 'submissions',
        resourceId: 'batch',
        details: { syncedCount: result.synced, created: result.created, updated: result.updated },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return success(res, result, 'Offline submissions synchronized successfully');
    } catch (err) {
      return next(err);
    }
  },

  async search(req, res, next) {
    try {
      const results = await submissionsService.searchSubmissions(req.query.q);
      return success(res, results, 'Submissions search completed');
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Ingest a single 47-column raw survey dump and distribute to TVC, CAPI, AI Super Audit
   */
  async ingestDump(req, res, next) {
    try {
      const surveyDumpsService = require('./survey-dumps.service');
      const result = await surveyDumpsService.ingestAndDistribute(req.body, req.tenantContext);
      return success(res, result, 'Survey dump ingested and leads distributed successfully', 201);
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Ingest multiple survey dumps in bulk
   */
  async bulkDump(req, res, next) {
    try {
      const surveyDumpsService = require('./survey-dumps.service');
      const rows = Array.isArray(req.body) ? req.body : req.body.rows || [];
      const results = [];
      for (const row of rows) {
        const resObj = await surveyDumpsService.ingestAndDistribute(row, req.tenantContext);
        results.push(resObj);
      }
      return success(res, { ingestedCount: results.length, details: results }, 'Bulk survey dumps ingested successfully', 201);
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Submit dynamic form with authoritative server rule re-evaluation
   * POST /projects/:projectId/records/:recordId/submissions
   */
  async submitDynamicForm(req, res, next) {
    try {
      const { projectId, recordId } = req.params;
      const result = await submissionsService.submitDynamicForm(
        projectId,
        recordId,
        req.body,
        req.user?.id
      );

      await auditLog({
        userId: req.user?.id,
        organizationId: req.user?.organization_id,
        action: 'DYNAMIC_FORM_SUBMISSION',
        resource: 'submissions',
        resourceId: result.submission.id,
        details: {
          submissionId: result.submission.submission_id,
          escalated: result.escalatedToSuperAudit,
        },
        ipAddress: req.ip,
      });

      return success(res, result, 'Dynamic form response submitted and verified successfully', 201);
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Export submission to exact target layout (Output2 format)
   * POST /projects/:projectId/submissions/:submissionId/export
   */
  async exportDynamicTarget(req, res, next) {
    try {
      const { submissionId } = req.params;
      const flatRecord = await submissionsService.exportSubmissionToTarget(submissionId);
      return success(res, flatRecord, 'Export record formatted successfully');
    } catch (err) {
      return next(err);
    }
  },
};

module.exports = submissionsController;
