/**
 * @file submissions.service.js
 * @description Business logic layer for submission lifecycle, generation of business codes, responses batching, audit timelines, and offline sync.
 */

const dayjs = require('dayjs');
const { db, withDbFallback } = require('../../database/connection');
const mockStore = require('../../database/mockStore');
const { NotFoundError, ValidationError } = require('../../utils/errors');
const submissionsModel = require('./submissions.model');
const { validateSubmissionPayload } = require('../rules/ruleEngine');
const lookupService = require('../lookups/lookup.service');
const logger = require('../../utils/logger');

const submissionsService = {
  /**
   * Generates business submission ID formatted as SUB-{projectCode}-{date}-{sequence}
   * @param {string} projectId
   * @returns {Promise<string>}
   */
  async generateSubmissionId(projectId) {
    const project = await withDbFallback(
      () => db('projects').where({ id: projectId }).first(),
      () => mockStore.findById('projects', projectId)
    );
    const projectCode = project ? (project.project_code || project.code || 'PRJ') : 'PRJ';
    const dateStr = dayjs().format('YYYYMMDD');

    const count = await submissionsModel.countForSequence(projectId, dateStr);
    const sequence = String(count + 1).padStart(5, '0');

    return `SUB-${projectCode}-${dateStr}-${sequence}`;
  },

  /**
   * List submissions with filters, pagination, and multi-tenant scoping
   * @param {object} filters
   * @param {object} pagination
   * @param {object} tenantContext
   * @returns {Promise<{ submissions: Array<object>, total: number }>}
   */
  async listSubmissions(filters = {}, pagination = {}, tenantContext = {}) {
    const scopedFilters = { ...filters };

    // Enforce vendor scoping if user is vendor agent or admin
    if (tenantContext.vendorId) {
      scopedFilters.vendorId = tenantContext.vendorId;
    }

    const [submissions, total] = await Promise.all([
      submissionsModel.findAll(scopedFilters, pagination),
      submissionsModel.count(scopedFilters),
    ]);

    return { submissions, total };
  },

  /**
   * Get single submission by ID with responses and basic metrics
   * @param {string} id
   * @returns {Promise<object>}
   */
  async getSubmissionById(id) {
    const submission = await submissionsModel.findById(id);
    if (!submission) {
      throw new NotFoundError(`Submission '${id}' not found`);
    }

    const responses = await submissionsModel.findResponses(submission.id);
    return {
      ...submission,
      responses,
    };
  },

  /**
   * Create a new submission (CATI start)
   * @param {object} data
   * @param {string} userId
   * @returns {Promise<object>}
   */
  async createSubmission(data, userId) {
    const project = await db('projects').where({ id: data.projectId }).first();
    if (!project) {
      throw new NotFoundError(`Project '${data.projectId}' not found`);
    }

    if (data.questionnaireVersionId) {
      const qv = await db('questionnaire_versions').where({ id: data.questionnaireVersionId }).first();
      if (!qv) {
        throw new NotFoundError(`Questionnaire version '${data.questionnaireVersionId}' not found`);
      }
    }

    const businessSubmissionId = await this.generateSubmissionId(data.projectId);
    const subId = data.submissionId || businessSubmissionId;
    const respMeta = data.answers ? JSON.stringify(data.answers) : (data.respondentMetadata ? (typeof data.respondentMetadata === 'object' ? JSON.stringify(data.respondentMetadata) : data.respondentMetadata) : '{}');

    const payload = {
      submission_id: subId,
      project_id: data.projectId,
      vendor_id: data.vendorId || null,
      state_id: data.stateId || null,
      source_channel: data.sourceChannel || 'REMOTE_CATI',
      source_agent_id: userId || null,
      source_device_id: data.sourceDeviceId || null,
      source_call_id: data.sourceCallId || null,
      questionnaire_version_id: data.questionnaireVersionId || null,
      respondent_name: data.respondentName || null,
      respondent_phone: data.respondentPhone || null,
      respondent_metadata: respMeta,
      geography_data: data.geographyData ? (typeof data.geographyData === 'object' ? JSON.stringify(data.geographyData) : data.geographyData) : '{}',
      source_status: data.disposition ? 'COMPLETED' : 'STARTED',
      capi_status: 'PENDING',
      priority: data.priority !== undefined ? data.priority : 50,
      started_at: new Date(),
      completed_at: data.disposition ? new Date() : null,
    };

    const created = await submissionsModel.create(payload);

    // If leadId is provided (e.g. from CATI / CAPI survey), mark lead COMPLETED and sync to client output DB
    if (data.leadId) {
      try {
        const projectsService = require('../projects/projects.service');
        await projectsService.surveyCampaignLead(
          data.leadId,
          {
            responses: data.answers || (typeof data.respondentMetadata === 'object' ? data.respondentMetadata : {}),
            disposition: data.disposition || 'PASS',
          },
          { userId, organizationId: project.organization_id }
        );
      } catch (leadSyncErr) {
        logger.warn(`Non-blocking lead survey sync note: ${leadSyncErr.message}`);
      }
    }

    return created;
  },

  /**
   * Update submission details
   * @param {string} id
   * @param {object} data
   * @returns {Promise<object>}
   */
  async updateSubmission(id, data) {
    const submission = await submissionsModel.findById(id);
    if (!submission) {
      throw new NotFoundError(`Submission '${id}' not found`);
    }

    const payload = {};
    if (data.vendorId !== undefined) payload.vendor_id = data.vendorId;
    if (data.stateId !== undefined) payload.state_id = data.stateId;
    if (data.sourceChannel !== undefined) payload.source_channel = data.sourceChannel;
    if (data.questionnaireVersionId !== undefined) payload.questionnaire_version_id = data.questionnaireVersionId;
    if (data.respondentName !== undefined) payload.respondent_name = data.respondentName;
    if (data.respondentPhone !== undefined) payload.respondent_phone = data.respondentPhone;
    if (data.respondentMetadata !== undefined) payload.respondent_metadata = JSON.stringify(data.respondentMetadata);
    if (data.geographyData !== undefined) payload.geography_data = JSON.stringify(data.geographyData);
    if (data.sourceDeviceId !== undefined) payload.source_device_id = data.sourceDeviceId;
    if (data.sourceCallId !== undefined) payload.source_call_id = data.sourceCallId;
    if (data.priority !== undefined) payload.priority = data.priority;
    if (data.riskScore !== undefined) payload.risk_score = data.riskScore;
    if (data.labels !== undefined) payload.labels = JSON.stringify(data.labels);

    return submissionsModel.update(submission.id, payload);
  },

  /**
   * Update submission statuses
   * @param {string} id
   * @param {object} statusData - { sourceStatus, capiStatus, superAuditStatus, tvcStatus, faStatus }
   * @returns {Promise<object>}
   */
  async updateStatus(id, statusData) {
    const submission = await submissionsModel.findById(id);
    if (!submission) {
      throw new NotFoundError(`Submission '${id}' not found`);
    }

    const payload = {};
    if (statusData.sourceStatus) {
      payload.source_status = statusData.sourceStatus;
      if (statusData.sourceStatus === 'COMPLETED' || statusData.sourceStatus === 'SUBMITTED') {
        payload.completed_at = new Date();
      }
    }
    if (statusData.capiStatus) payload.capi_status = statusData.capiStatus;
    if (statusData.superAuditStatus) payload.super_audit_status = statusData.superAuditStatus;
    if (statusData.tvcStatus) payload.tvc_status = statusData.tvcStatus;
    if (statusData.faStatus) payload.fa_status = statusData.faStatus;

    return submissionsModel.update(submission.id, payload);
  },

  /**
   * Save batch answers/responses for a submission
   * @param {string} id
   * @param {Array<object>} responses
   * @returns {Promise<Array<object>>}
   */
  async saveResponses(id, responses) {
    const submission = await submissionsModel.findById(id);
    if (!submission) {
      throw new NotFoundError(`Submission '${id}' not found`);
    }

    return submissionsModel.saveResponses(submission.id, responses);
  },

  /**
   * Retrieve all responses for a submission
   * @param {string} id
   * @returns {Promise<Array<object>>}
   */
  async getResponses(id) {
    const submission = await submissionsModel.findById(id);
    if (!submission) {
      throw new NotFoundError(`Submission '${id}' not found`);
    }

    return submissionsModel.findResponses(submission.id);
  },

  /**
   * Get aggregated lifecycle events across modules for submission
   * @param {string} id
   * @returns {Promise<Array<object>>}
   */
  async getTimeline(id) {
    const submission = await submissionsModel.findById(id);
    if (!submission) {
      throw new NotFoundError(`Submission '${id}' not found`);
    }

    const timeline = [];

    // 1. Initial creation
    timeline.push({
      event: 'SUBMISSION_CREATED',
      timestamp: submission.created_at,
      status: submission.source_status,
      module: 'CATI',
      details: {
        submissionId: submission.submission_id,
        channel: submission.source_channel,
        agentId: submission.source_agent_id,
      },
    });

    if (submission.completed_at) {
      timeline.push({
        event: 'SUBMISSION_COMPLETED',
        timestamp: submission.completed_at,
        status: submission.source_status,
        module: 'CATI',
        details: {},
      });
    }

    // 2. Audit logs for this submission
    const auditLogs = await withDbFallback(
      () =>
        db('audit_logs')
          .where({ entity_type: 'submission', entity_id: submission.id })
          .orWhere({ entity_type: 'SUBMISSION', entity_id: submission.id })
          .orWhere({ entity_type: 'submissions', entity_id: submission.id })
          .orderBy('created_at', 'asc'),
      () =>
        mockStore.find('audit_logs', { entity_id: submission.id })
    );

    for (const log of auditLogs) {
      timeline.push({
        event: log.action,
        timestamp: log.created_at,
        module: log.module,
        userId: log.user_id,
        details: typeof log.new_values === 'string' ? JSON.parse(log.new_values || '{}') : log.new_values,
      });
    }

    // Sort timeline chronologically
    timeline.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    return timeline;
  },

  /**
   * Idempotent offline sync for mobile client submissions
   * @param {Array<object>} items
   * @param {string} userId
   * @returns {Promise<{ synced: number, created: number, updated: number, results: Array<object> }>}
   */
  async syncOfflineSubmissions(items, userId) {
    let createdCount = 0;
    let updatedCount = 0;
    const results = [];

    for (const item of items) {
      let submissionRecord;

      // Check if submission already exists by business code or matching client ID in metadata
      if (item.submissionId) {
        submissionRecord = await submissionsModel.findById(item.submissionId);
      }

      if (!submissionRecord && item.clientSubmissionId) {
        submissionRecord = await withDbFallback(
          () =>
            db('submissions')
              .whereRaw("respondent_metadata->>'clientSubmissionId' = ?", [item.clientSubmissionId])
              .first(),
          () =>
            mockStore.findOne('submissions', (s) => {
              const meta = typeof s.respondent_metadata === 'string' ? JSON.parse(s.respondent_metadata || '{}') : s.respondent_metadata;
              return meta && meta.clientSubmissionId === item.clientSubmissionId;
            })
        );
      }

      if (submissionRecord) {
        // Update existing
        await submissionsModel.update(submissionRecord.id, {
          source_status: item.sourceStatus || submissionRecord.source_status,
          completed_at: item.completedAt || submissionRecord.completed_at,
        });

        if (item.responses && item.responses.length > 0) {
          await submissionsModel.saveResponses(submissionRecord.id, item.responses);
        }

        updatedCount++;
        results.push({
          clientSubmissionId: item.clientSubmissionId,
          submissionId: submissionRecord.submission_id,
          status: 'UPDATED',
        });
      } else {
        // Create new record
        const businessId = item.submissionId || (await this.generateSubmissionId(item.projectId));
        const meta = item.respondentMetadata || {};
        meta.clientSubmissionId = item.clientSubmissionId;

        const newSub = await submissionsModel.create({
          submission_id: businessId,
          project_id: item.projectId,
          vendor_id: item.vendorId || null,
          state_id: item.stateId || null,
          source_channel: item.sourceChannel || 'FIELD_CATI',
          source_agent_id: userId || null,
          source_device_id: item.sourceDeviceId || null,
          questionnaire_version_id: item.questionnaireVersionId || null,
          respondent_name: item.respondentName || null,
          respondent_phone: item.respondentPhone || null,
          respondent_metadata: JSON.stringify(meta),
          geography_data: JSON.stringify(item.geographyData || {}),
          source_status: item.sourceStatus || 'SUBMITTED',
          capi_status: 'PENDING',
          started_at: item.startedAt || new Date(),
          completed_at: item.completedAt || new Date(),
        });

        if (item.responses && item.responses.length > 0) {
          await submissionsModel.saveResponses(newSub.id, item.responses);
        }

        createdCount++;
        results.push({
          clientSubmissionId: item.clientSubmissionId,
          submissionId: newSub.submission_id,
          status: 'CREATED',
        });
      }
    }

    return {
      synced: items.length,
      created: createdCount,
      updated: updatedCount,
      results,
    };
  },

  /**
   * Search submissions across identifier, phone, agent name
   * @param {string} query
   * @returns {Promise<Array<object>>}
   */
  /**
   * Search submissions across identifier, phone, agent name
   * @param {string} query
   * @returns {Promise<Array<object>>}
   */
  async searchSubmissions(query) {
    return submissionsModel.findAll({ search: query }, { limit: 20 });
  },

  /**
   * Authoritatively validates and saves a dynamic form submission
   * @param {string} projectId
   * @param {string} recordId
   * @param {object} payload - { formVersionId, answers, questionAudit, answerAudit, actual, disposition }
   * @param {string} userId
   * @returns {Promise<object>}
   */
  async submitDynamicForm(projectId, recordId, payload, userId) {
    let qVersionId = payload.formVersionId;
    let qVersion;
    if (qVersionId) {
      qVersion = await db('questionnaire_versions').where('id', qVersionId).first();
    } else {
      qVersion = await db('questionnaire_versions')
        .where('project_id', projectId)
        .where('status', 'PUBLISHED')
        .orderBy('version_number', 'desc')
        .first();
    }

    const schema = qVersion && qVersion.canonical_schema_jsonb
      ? (typeof qVersion.canonical_schema_jsonb === 'string'
          ? JSON.parse(qVersion.canonical_schema_jsonb)
          : qVersion.canonical_schema_jsonb)
      : null;

    const questions = schema?.questions || [];

    // Lookup hierarchy for dependent lookups (e.g. Gujarat Lok Sabha -> Vidhan Sabha)
    const lookupHierarchy = await lookupService.getHierarchyDictionary(projectId, 'gujarat_pc_ac');

    // Server-side authoritative validation
    const validation = validateSubmissionPayload(questions, payload, { lookupHierarchy });
    if (!validation.valid) {
      const err = new ValidationError('Submission failed server-side validation rules');
      err.details = validation.errors;
      throw err;
    }

    const { escalateToSuperAudit, escalationReasons } = validation.evaluation;

    const businessSubmissionId = recordId && !recordId.startsWith('REC-')
      ? recordId
      : await this.generateSubmissionId(projectId);

    const [sub] = await db('submissions')
      .insert({
        submission_id: businessSubmissionId,
        project_id: projectId,
        questionnaire_version_id: qVersion?.id || null,
        source_agent_id: userId || null,
        source_channel: schema?.module || 'TVC',
        overall_status: escalateToSuperAudit ? 'ESCALATED' : 'COMPLETED',
        capi_status: escalateToSuperAudit ? 'SUPER_AUDIT_PENDING' : 'APPROVED',
        form_data: JSON.stringify(validation.evaluation.normalizedAnswers),
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning('*');

    if (escalateToSuperAudit) {
      try {
        await db('super_audit_cases').insert({
          submission_id: sub.id,
          project_id: projectId,
          status: 'PENDING',
          reason_codes_jsonb: JSON.stringify(escalationReasons),
          created_at: new Date(),
        });
      } catch (_) {}
    }

    return {
      submission: sub,
      escalatedToSuperAudit: escalateToSuperAudit,
      escalationReasons,
      trace: validation.evaluation,
    };
  },

  /**
   * Generates exact target layout export (e.g. Output2 columns) with formula injection protection
   * @param {string} submissionId
   * @returns {Promise<object>}
   */
  async exportSubmissionToTarget(submissionId) {
    const sub = await this.getSubmissionById(submissionId);
    const qv = await db('questionnaire_versions').where('id', sub.questionnaire_version_id).first();
    const schema = qv?.canonical_schema_jsonb
      ? (typeof qv.canonical_schema_jsonb === 'string' ? JSON.parse(qv.canonical_schema_jsonb) : qv.canonical_schema_jsonb)
      : null;
    const output2Cols = schema?.exportLayout?.output2Columns || [];

    const answers = typeof sub.form_data === 'string' ? JSON.parse(sub.form_data) : (sub.form_data || {});
    const flatRecord = {};

    output2Cols.forEach((col) => {
      let val = answers[col] !== undefined ? answers[col] : (sub[col] || '');
      // Formula injection guard: prefix '=', '+', '-', '@'
      if (typeof val === 'string' && /^[=+\-@]/.test(val)) {
        val = `'${val}`;
      }
      flatRecord[col] = val;
    });

    return flatRecord;
  },
};

module.exports = submissionsService;
