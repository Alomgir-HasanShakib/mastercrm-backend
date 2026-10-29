/**
 * @file super-audit.service.js
 * @description Business logic layer for Super Audit engine: sampling, QC routing, confirm/overrule workflows.
 */

const db = require('../../database/connection');
const { NotFoundError, ConflictError } = require('../../utils/errors');
const superAuditModel = require('./super-audit.model');

const superAuditService = {
  /**
   * List super audits with tenant scoping and pagination
   * @param {object} filters
   * @param {object} pagination
   * @param {object} tenantContext
   * @returns {Promise<{ superAudits: Array<object>, total: number }>}
   */
  async listAudits(filters = {}, pagination = {}, tenantContext = {}) {
    const scopedFilters = { ...filters };

    if (tenantContext.vendorId) {
      scopedFilters.vendorId = tenantContext.vendorId;
    }

    const [superAudits, total] = await Promise.all([
      superAuditModel.findAll(scopedFilters, pagination),
      superAuditModel.count(scopedFilters),
    ]);

    return { superAudits, total };
  },

  /**
   * Get super audit by ID with items and side-by-side CAPI comparison
   * @param {string} id
   * @returns {Promise<object>}
   */
  async getAuditById(id) {
    const superAudit = await superAuditModel.findById(id);
    if (!superAudit) {
      throw new NotFoundError(`Super Audit '${id}' not found`);
    }

    const items = await superAuditModel.findAuditItems(superAudit.id);

    // Also fetch original responses for full context
    const responses = await db('submission_responses')
      .where('submission_id', superAudit.submission_id)
      .orderBy('created_at', 'asc');

    return {
      ...superAudit,
      items,
      responses,
    };
  },

  /**
   * Route a submission into the Super Audit QC queue
   * @param {object} data
   * @param {object} [tenantContext]
   * @returns {Promise<object>}
   */
  async routeSubmission(data, tenantContext = {}) {
    const submission = await db('submissions').where('id', data.submissionId).first();
    if (!submission) {
      throw new NotFoundError(`Submission '${data.submissionId}' not found`);
    }

    const existingSuperAudit = await superAuditModel.findBySubmissionId(data.submissionId);
    if (existingSuperAudit) {
      throw new ConflictError(`Super Audit already exists for submission '${data.submissionId}'`);
    }

    let capiAudit = null;
    if (data.capiAuditId) {
      capiAudit = await db('capi_audits').where('id', data.capiAuditId).first();
    } else {
      capiAudit = await db('capi_audits').where('submission_id', data.submissionId).first();
    }

    const payload = {
      submission_id: data.submissionId,
      project_id: submission.project_id,
      vendor_id: submission.vendor_id || tenantContext.vendorId || null,
      capi_audit_id: capiAudit ? capiAudit.id : null,
      super_auditor_id: data.superAuditorId || null,
      routing_reason: data.routingReason || 'RANDOM_SAMPLING',
      status: data.superAuditorId ? 'ASSIGNED' : 'PENDING',
      decision: 'PENDING',
      original_decision: capiAudit ? capiAudit.decision : null,
      capi_score: capiAudit ? capiAudit.score : 0,
      super_audit_score: 0,
      variance_score: 0,
      notes: data.notes || null,
      metadata: JSON.stringify({
        routedAt: new Date().toISOString(),
        capiScore: capiAudit?.score,
        capiStatus: submission.capi_status,
      }),
    };

    const created = await superAuditModel.create(payload);

    // If CAPI items exist, seed initial super audit items
    if (capiAudit) {
      const capiItems = await db('capi_audit_items').where('capi_audit_id', capiAudit.id);
      if (capiItems.length > 0) {
        const seedItems = capiItems.map((ci) => ({
          questionId: ci.question_id,
          questionTag: ci.question_tag,
          originalResponse: ci.audited_value || ci.original_value,
          capiEvalStatus: ci.status,
          superEvalStatus: 'AGREE',
        }));
        await superAuditModel.saveAuditItems(created.id, seedItems);
      }
    }

    await db('submissions')
      .where('id', data.submissionId)
      .update({
        super_audit_status: 'ROUTED_PENDING',
        updated_at: db.fn.now(),
      });

    return created;
  },

  /**
   * Run automated sampling batch to route percentage of submissions into Super Audit
   * @param {object} params
   * @param {object} [tenantContext]
   * @returns {Promise<{ routedCount: number, routed: Array<object> }>}
   */
  async runBatchSampling(params, tenantContext = {}) {
    const { projectId, samplingPercentage = 10, limit = 50, includeFailedCapi = true } = params;

    let eligibleQuery = db('submissions')
      .where('submissions.project_id', projectId)
      .whereNull('submissions.super_audit_status')
      .whereIn('submissions.capi_status', includeFailedCapi ? ['PASSED', 'FAILED'] : ['PASSED'])
      .whereNotExists(function () {
        this.select(1).from('super_audits').whereRaw('super_audits.submission_id = submissions.id');
      })
      .orderByRaw('RANDOM()')
      .limit(limit);

    if (tenantContext.vendorId) {
      eligibleQuery = eligibleQuery.where('submissions.vendor_id', tenantContext.vendorId);
    }

    const candidates = await eligibleQuery;
    const sampleSize = Math.max(1, Math.ceil((candidates.length * samplingPercentage) / 100));
    const toRoute = candidates.slice(0, sampleSize);

    const routed = [];
    for (const sub of toRoute) {
      const reason = sub.capi_status === 'FAILED' ? 'CAPI_FAIL_ESCALATION' : 'RANDOM_SAMPLING';
      const created = await this.routeSubmission({
        submissionId: sub.id,
        routingReason: reason,
        notes: `Auto-routed via batch sampling (${samplingPercentage}%)`,
      }, tenantContext);
      routed.push(created);
    }

    return {
      routedCount: routed.length,
      routed,
    };
  },

  /**
   * Assign a Super Auditor to the QC session
   * @param {string} id
   * @param {string} superAuditorId
   * @returns {Promise<object>}
   */
  async assignSuperAuditor(id, superAuditorId) {
    const audit = await superAuditModel.findById(id);
    if (!audit) {
      throw new NotFoundError(`Super Audit '${id}' not found`);
    }

    const auditor = await db('users').where('id', superAuditorId).first();
    if (!auditor) {
      throw new NotFoundError(`Auditor user '${superAuditorId}' not found`);
    }

    return superAuditModel.update(id, {
      super_auditor_id: superAuditorId,
      status: audit.status === 'PENDING' ? 'ASSIGNED' : audit.status,
    });
  },

  /**
   * Start super audit review session
   * @param {string} id
   * @param {string} userId
   * @returns {Promise<object>}
   */
  async startAudit(id, userId) {
    const audit = await superAuditModel.findById(id);
    if (!audit) {
      throw new NotFoundError(`Super Audit '${id}' not found`);
    }

    const payload = {
      status: 'IN_PROGRESS',
      started_at: audit.started_at || new Date(),
    };

    if (!audit.super_auditor_id) {
      payload.super_auditor_id = userId;
    }

    return superAuditModel.update(id, payload);
  },

  /**
   * Save super audit item evaluations
   * @param {string} id
   * @param {Array<object>} items
   * @returns {Promise<Array<object>>}
   */
  async saveAuditItems(id, items) {
    const audit = await superAuditModel.findById(id);
    if (!audit) {
      throw new NotFoundError(`Super Audit '${id}' not found`);
    }

    return superAuditModel.saveAuditItems(audit.id, items);
  },

  /**
   * Finalize Super Audit decision (Confirm vs Overrule)
   * @param {string} id
   * @param {object} decisionData
   * @param {object} user
   * @returns {Promise<object>}
   */
  async submitDecision(id, decisionData, user = {}) {
    const audit = await superAuditModel.findById(id);
    if (!audit) {
      throw new NotFoundError(`Super Audit '${id}' not found`);
    }

    if (decisionData.items && decisionData.items.length > 0) {
      await superAuditModel.saveAuditItems(audit.id, decisionData.items);
    }

    const allItems = await superAuditModel.findAuditItems(audit.id);

    let superAuditScore = decisionData.superAuditScore;
    if (superAuditScore === undefined || superAuditScore === null) {
      if (allItems.length > 0) {
        const agreedCount = allItems.filter((i) => i.super_eval_status === 'AGREE').length;
        superAuditScore = parseFloat(((agreedCount / allItems.length) * 100).toFixed(2));
      } else {
        superAuditScore = audit.capi_score || 100;
      }
    }

    const capiScore = Number(audit.capi_score || 0);
    const varianceScore = parseFloat(Math.abs(superAuditScore - capiScore).toFixed(2));
    const completedAt = new Date();

    const updatePayload = {
      decision: decisionData.decision,
      final_decision: decisionData.finalDecision || (decisionData.decision === 'CONFIRM' ? audit.original_decision : 'OVERRULED'),
      status: 'COMPLETED',
      super_audit_score: superAuditScore,
      variance_score: varianceScore,
      notes: decisionData.notes || audit.notes,
      completed_at: completedAt,
    };

    if (!audit.super_auditor_id && user.id) {
      updatePayload.super_auditor_id = user.id;
    }

    const updated = await superAuditModel.update(audit.id, updatePayload);

    // Sync status to canonical submissions table
    await db('submissions')
      .where('id', audit.submission_id)
      .update({
        super_audit_status: decisionData.decision === 'CONFIRM' ? 'CONFIRMED' : 'OVERRULED',
        updated_at: db.fn.now(),
      });

    const refreshedItems = await superAuditModel.findAuditItems(audit.id);
    return {
      ...updated,
      items: refreshedItems,
    };
  },

  /**
   * Get Super Audit QC KPIs & metrics
   * @param {object} filters
   * @param {object} tenantContext
   * @returns {Promise<object>}
   */
  async getMetrics(filters = {}, tenantContext = {}) {
    const scopedFilters = { ...filters };
    if (tenantContext.vendorId) {
      scopedFilters.vendorId = tenantContext.vendorId;
    }
    return superAuditModel.getMetrics(scopedFilters);
  },
};

module.exports = superAuditService;
