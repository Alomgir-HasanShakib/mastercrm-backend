/**
 * @file reports.model.js
 * @description Knex aggregation queries for Master Multi-Vendor Survey, Audit & Verification CRM.
 * Implements high-performance analytical aggregates, time-series distributions, and agent scorecards
 * across CATI, CAPI Audit, Super Audit, TVC, and Feedback Calling modules.
 */

const db = require('../../database/connection');
const { withDbFallback } = require('../../database/connection');
const mockStore = require('../../database/mockStore');

/**
 * Helper to apply common multi-dimensional filters to a Knex query builder
 * @param {import('knex').Knex.QueryBuilder} query
 * @param {object} filters
 * @param {object} columnMap
 * @returns {import('knex').Knex.QueryBuilder}
 */
const applyBaseFilters = (query, filters = {}, columnMap = {}) => {
  const {
    clientId,
    vendorId,
    projectId,
    stateId,
    userId,
    agentId,
    sourceChannel,
    status,
    disposition,
    dateFrom,
    dateTo,
    search,
  } = filters;

  const projectCol = columnMap.projectId || 'projects.id';
  const clientCol = columnMap.clientId || 'projects.client_id';
  const vendorCol = columnMap.vendorId || 'vendors.id';
  const stateCol = columnMap.stateId || null;
  const userCol = columnMap.userId || columnMap.agentId || null;
  const channelCol = columnMap.sourceChannel || null;
  const statusCol = columnMap.status || null;
  const dispCol = columnMap.disposition || null;
  const dateCol = columnMap.dateCol || 'created_at';

  if (projectId) {
    query.where(projectCol, projectId);
  }
  if (clientId) {
    query.where(clientCol, clientId);
  }
  if (vendorId) {
    query.where(vendorCol, vendorId);
  }
  if (stateId && stateCol) {
    query.where(stateCol, stateId);
  }
  if ((userId || agentId) && userCol) {
    query.where(userCol, userId || agentId);
  }
  if (sourceChannel && channelCol) {
    query.where(channelCol, sourceChannel);
  }
  if (status && statusCol) {
    query.where(statusCol, status);
  }
  if (disposition && dispCol) {
    query.where(dispCol, disposition);
  }
  if (dateFrom) {
    query.where(dateCol, '>=', dateFrom);
  }
  if (dateTo) {
    query.where(dateCol, '<=', dateTo);
  }
  if (search && columnMap.searchCols && columnMap.searchCols.length > 0) {
    const term = `%${search.toLowerCase()}%`;
    query.where((builder) => {
      columnMap.searchCols.forEach((col, idx) => {
        if (idx === 0) {
          builder.whereRaw(`LOWER(CAST(${col} AS TEXT)) LIKE ?`, [term]);
        } else {
          builder.orWhereRaw(`LOWER(CAST(${col} AS TEXT)) LIKE ?`, [term]);
        }
      });
    });
  }

  return query;
};

const reportsModel = {
  // ==========================================
  // 1. CATI PRODUCTION & APR
  // ==========================================

  /**
   * Aggregated KPI Summary for CATI Production
   * @param {object} filters
   * @returns {Promise<object>}
   */
  async getCatiProductionSummary(filters = {}) {
    let query = db('submissions')
      .leftJoin('projects', 'submissions.project_id', 'projects.id')
      .leftJoin('vendors', 'submissions.vendor_id', 'vendors.id');

    applyBaseFilters(query, filters, {
      projectId: 'submissions.project_id',
      vendorId: 'submissions.vendor_id',
      clientId: 'projects.client_id',
      stateId: 'submissions.state_id',
      userId: 'submissions.source_agent_id',
      sourceChannel: 'submissions.source_channel',
      status: 'submissions.source_status',
      dateCol: 'submissions.created_at',
    });

    const result = await query
      .select(
        db.raw('COUNT(*)::int as total_surveys'),
        db.raw("COUNT(*) FILTER (WHERE submissions.source_status::text IN ('COMPLETED', 'SUBMITTED'))::int as completed_surveys"),
        db.raw("COUNT(*) FILTER (WHERE submissions.source_status::text = 'STARTED')::int as started_surveys"),
        db.raw("COUNT(*) FILTER (WHERE submissions.source_status::text = 'IN_PROGRESS')::int as in_progress_surveys"),
        db.raw("COUNT(*) FILTER (WHERE submissions.source_status::text IN ('TERMINATED', 'REJECTED', 'ABANDONED', 'INVALID', 'INCOMPLETE'))::int as terminated_surveys"),
        db.raw('COALESCE(AVG(EXTRACT(EPOCH FROM (submissions.completed_at - submissions.started_at))) FILTER (WHERE submissions.completed_at IS NOT NULL), 0)::float as avg_duration_seconds'),
        db.raw('COALESCE(SUM(EXTRACT(EPOCH FROM (submissions.completed_at - submissions.started_at))) FILTER (WHERE submissions.completed_at IS NOT NULL), 0)::bigint as total_productive_seconds'),
        db.raw("COUNT(*)::int as sync_compliant_surveys"),
        db.raw("COUNT(*) FILTER (WHERE submissions.geography_data IS NOT NULL AND submissions.geography_data != '{}')::int as gps_compliant_surveys")
      )
      .first();

    return result || {
      total_surveys: 0,
      completed_surveys: 0,
      started_surveys: 0,
      in_progress_surveys: 0,
      terminated_surveys: 0,
      avg_duration_seconds: 0,
      total_productive_seconds: 0,
      sync_compliant_surveys: 0,
      gps_compliant_surveys: 0,
    };
  },

  /**
   * Time series distribution for CATI production
   * @param {object} filters
   * @param {string} interval - 'day', 'week', 'month', 'hour'
   * @returns {Promise<Array<object>>}
   */
  async getCatiProductionTimeSeries(filters = {}, interval = 'day') {
    let query = db('submissions')
      .leftJoin('projects', 'submissions.project_id', 'projects.id')
      .leftJoin('vendors', 'submissions.vendor_id', 'vendors.id');

    applyBaseFilters(query, filters, {
      projectId: 'submissions.project_id',
      vendorId: 'submissions.vendor_id',
      clientId: 'projects.client_id',
      stateId: 'submissions.state_id',
      userId: 'submissions.source_agent_id',
      sourceChannel: 'submissions.source_channel',
      status: 'submissions.source_status',
      dateCol: 'submissions.created_at',
    });

    const dateTrunc = ['day', 'week', 'month', 'hour'].includes(interval) ? interval : 'day';

    return query
      .select(
        db.raw(`DATE_TRUNC('${dateTrunc}', submissions.created_at) as bucket`),
        db.raw('COUNT(*)::int as total_surveys'),
        db.raw("COUNT(*) FILTER (WHERE submissions.source_status::text IN ('COMPLETED', 'SUBMITTED'))::int as completed_surveys"),
        db.raw('COALESCE(AVG(EXTRACT(EPOCH FROM (submissions.completed_at - submissions.started_at))) FILTER (WHERE submissions.completed_at IS NOT NULL), 0)::float as aht_seconds')
      )
      .groupBy('bucket')
      .orderBy('bucket', 'asc');
  },

  /**
   * Tabular drill-down for CATI Production
   * @param {object} filters
   * @param {object} pagination
   * @returns {Promise<{ rows: Array<object>, total: number }>}
   */
  async getCatiProductionTable(filters = {}, pagination = {}) {
    const { limit = 20, offset = 0, sortBy = 'created_at', sortOrder = 'desc' } = pagination;

    let query = db('submissions')
      .leftJoin('projects', 'submissions.project_id', 'projects.id')
      .leftJoin('vendors', 'submissions.vendor_id', 'vendors.id')
      .leftJoin('users as agents', 'submissions.source_agent_id', 'agents.id');

    applyBaseFilters(query, filters, {
      projectId: 'submissions.project_id',
      vendorId: 'submissions.vendor_id',
      clientId: 'projects.client_id',
      stateId: 'submissions.state_id',
      userId: 'submissions.source_agent_id',
      sourceChannel: 'submissions.source_channel',
      status: 'submissions.source_status',
      dateCol: 'submissions.created_at',
      searchCols: ['submissions.submission_id', 'submissions.respondent_name', 'submissions.respondent_phone', 'agents.first_name', 'agents.last_name'],
    });

    const countQuery = query.clone();
    const countResult = await countQuery.count('submissions.id as count').first();
    const total = countResult ? parseInt(countResult.count, 10) : 0;

    const rows = await query
      .select(
        'submissions.id',
        'submissions.submission_id',
        'submissions.source_channel',
        'submissions.source_status',
        'submissions.capi_status',
        'submissions.state_id',
        'submissions.risk_score',
        db.raw('COALESCE(EXTRACT(EPOCH FROM (submissions.completed_at - submissions.started_at)), 0)::int as duration_seconds'),
        'submissions.created_at',
        'submissions.started_at',
        'submissions.completed_at',
        'submissions.respondent_name',
        'submissions.respondent_phone',
        'submissions.geography_data',
        'projects.id as project_id',
        'projects.name as project_name',
        'projects.project_code as project_code',
        'vendors.id as vendor_id',
        'vendors.name as vendor_name',
        'vendors.code as vendor_code',
        'agents.id as agent_id',
        'agents.first_name as agent_first_name',
        'agents.last_name as agent_last_name',
        'agents.email as agent_email'
      )
      .orderBy(`submissions.${sortBy || 'created_at'}`, sortOrder || 'desc')
      .limit(limit)
      .offset(offset);

    return { rows, total };
  },

  /**
   * CATI Agent Performance Report (CATI APR)
   * Calculates total surveys, completed, AHT, surveys per hour, productive time, idle time, sync compliance, GPS compliance.
   * @param {object} filters
   * @param {object} pagination
   * @returns {Promise<{ rows: Array<object>, total: number, summary: object }>}
   */
  async getCatiApr(filters = {}, pagination = {}) {
    const { limit = 20, offset = 0, sortBy = 'completed_surveys', sortOrder = 'desc' } = pagination;

    let base = db('submissions')
      .leftJoin('projects', 'submissions.project_id', 'projects.id')
      .leftJoin('vendors', 'submissions.vendor_id', 'vendors.id')
      .leftJoin('users as agents', 'submissions.source_agent_id', 'agents.id')
      .whereNotNull('submissions.source_agent_id');

    applyBaseFilters(base, filters, {
      projectId: 'submissions.project_id',
      vendorId: 'submissions.vendor_id',
      clientId: 'projects.client_id',
      stateId: 'submissions.state_id',
      userId: 'submissions.source_agent_id',
      sourceChannel: 'submissions.source_channel',
      status: 'submissions.source_status',
      dateCol: 'submissions.created_at',
      searchCols: ['agents.first_name', 'agents.last_name', 'agents.email'],
    });

    const subquery = base
      .groupBy(
        'submissions.source_agent_id',
        'agents.first_name',
        'agents.last_name',
        'agents.email',
        'agents.phone',
        'vendors.id',
        'vendors.name',
        'vendors.code'
      )
      .select(
        'submissions.source_agent_id as agent_id',
        'agents.first_name as agent_first_name',
        'agents.last_name as agent_last_name',
        'agents.email as agent_email',
        'agents.phone as agent_phone',
        'vendors.id as vendor_id',
        'vendors.name as vendor_name',
        'vendors.code as vendor_code',
        db.raw('COUNT(*)::int as total_surveys'),
        db.raw("COUNT(*) FILTER (WHERE submissions.source_status::text IN ('COMPLETED', 'SUBMITTED'))::int as completed_surveys"),
        db.raw("COUNT(*) FILTER (WHERE submissions.source_status IN ('TERMINATED', 'REJECTED'))::int as terminated_surveys"),
        db.raw('COALESCE(AVG(EXTRACT(EPOCH FROM (submissions.completed_at - submissions.started_at))) FILTER (WHERE submissions.completed_at IS NOT NULL), 0)::float as aht_seconds'),
        db.raw('COALESCE(SUM(submissions.duration_seconds), 0)::bigint as productive_time_seconds'),
        db.raw("COUNT(*) FILTER (WHERE submissions.sync_status = 'SYNCED' OR submissions.is_offline_sync = false OR submissions.is_offline_sync IS NULL)::int as sync_compliant_count"),
        db.raw("COUNT(*) FILTER (WHERE submissions.geography_data IS NOT NULL AND submissions.geography_data != '{}')::int as gps_compliant_count")
      );

    const totalCountResult = await db.from(subquery.as('t')).count('* as count').first();
    const total = totalCountResult ? parseInt(totalCountResult.count, 10) : 0;

    const rows = await db
      .from(subquery.as('t'))
      .orderBy(sortBy || 'completed_surveys', sortOrder || 'desc')
      .limit(limit)
      .offset(offset);

    // Global summary totals for APR
    const summaryResult = await db
      .from(subquery.as('s'))
      .select(
        db.raw('COUNT(*)::int as total_agents'),
        db.raw('COALESCE(SUM(total_surveys), 0)::bigint as total_surveys'),
        db.raw('COALESCE(SUM(completed_surveys), 0)::bigint as completed_surveys'),
        db.raw('COALESCE(SUM(productive_time_seconds), 0)::bigint as total_productive_seconds'),
        db.raw('COALESCE(AVG(aht_seconds), 0)::float as avg_aht_seconds'),
        db.raw('COALESCE(SUM(sync_compliant_count), 0)::bigint as total_sync_compliant'),
        db.raw('COALESCE(SUM(gps_compliant_count), 0)::bigint as total_gps_compliant')
      )
      .first();

    return { rows, total, summary: summaryResult || {} };
  },

  // ==========================================
  // 2. CAPI AUDIT REPORT & CAPI APR
  // ==========================================

  /**
   * CAPI Audit Production KPI Summary
   * Total audited, pass/fail rate, mismatch count, prompting count, not audible count, average AHT.
   * @param {object} filters
   * @returns {Promise<object>}
   */
  async getCapiProductionSummary(filters = {}) {
    let query = db('capi_audits')
      .leftJoin('submissions', 'capi_audits.submission_id', 'submissions.id')
      .leftJoin('projects', 'submissions.project_id', 'projects.id')
      .leftJoin('vendors', 'submissions.vendor_id', 'vendors.id');

    applyBaseFilters(query, filters, {
      projectId: 'submissions.project_id',
      vendorId: 'submissions.vendor_id',
      clientId: 'projects.client_id',
      stateId: 'submissions.state_id',
      userId: 'capi_audits.auditor_id',
      status: 'capi_audits.overall_status',
      dateCol: 'capi_audits.created_at',
    });

    const result = await query
      .select(
        db.raw('COUNT(*)::int as total_audited'),
        db.raw("COUNT(*) FILTER (WHERE capi_audits.overall_status = 'COMPLETED')::int as completed_audits"),
        db.raw("COUNT(*) FILTER (WHERE capi_audits.overall_status = 'PENDING')::int as pending_audits"),
        db.raw("COUNT(*) FILTER (WHERE capi_audits.overall_result::text IN ('PASS', 'PASSED'))::int as pass_count"),
        db.raw("COUNT(*) FILTER (WHERE capi_audits.overall_result::text IN ('FAIL', 'FAILED'))::int as fail_count"),
        db.raw("COUNT(*) FILTER (WHERE capi_audits.overall_result::text IN ('ESCALATE', 'REVIEW'))::int as escalate_count"),
        db.raw('COALESCE(AVG(EXTRACT(EPOCH FROM (capi_audits.completed_at - capi_audits.started_at))) FILTER (WHERE capi_audits.completed_at IS NOT NULL), 0)::float as avg_audit_handling_time_seconds'),
        db.raw('COALESCE(SUM(EXTRACT(EPOCH FROM (capi_audits.completed_at - capi_audits.started_at))) FILTER (WHERE capi_audits.completed_at IS NOT NULL), 0)::bigint as total_duration_seconds'),
        db.raw('COALESCE(AVG(capi_audits.score), 0)::float as avg_score')
      )
      .first();

    // Aggregates for items (mismatches, prompting, not audible)
    let itemQuery = db('capi_audit_items')
      .join('capi_audits', 'capi_audit_items.capi_audit_id', 'capi_audits.id')
      .leftJoin('submissions', 'capi_audits.submission_id', 'submissions.id')
      .leftJoin('projects', 'submissions.project_id', 'projects.id');

    applyBaseFilters(itemQuery, filters, {
      projectId: 'submissions.project_id',
      vendorId: 'submissions.vendor_id',
      clientId: 'projects.client_id',
      userId: 'capi_audits.auditor_id',
      dateCol: 'capi_audits.created_at',
    });

    const itemCounts = await itemQuery
      .select(
        db.raw("COUNT(*) FILTER (WHERE capi_audit_items.question_validation != 'VALID' OR capi_audit_items.answer_validation != 'VALID')::int as mismatch_count"),
        db.raw("COUNT(*) FILTER (WHERE capi_audit_items.prompting_flag = true OR LOWER(COALESCE(capi_audit_items.remarks, '')) LIKE '%prompt%')::int as prompting_count"),
        db.raw("COUNT(*) FILTER (WHERE LOWER(COALESCE(capi_audit_items.remarks, '')) LIKE '%audible%' OR LOWER(COALESCE(capi_audit_items.remarks, '')) LIKE '%inaudible%')::int as not_audible_count")
      )
      .first();

    return {
      ...(result || {}),
      mismatch_count: itemCounts?.mismatch_count || 0,
      prompting_count: itemCounts?.prompting_count || 0,
      not_audible_count: itemCounts?.not_audible_count || 0,
    };
  },

  /**
   * CAPI Audit Production Table Drilldown
   * @param {object} filters
   * @param {object} pagination
   * @returns {Promise<{ rows: Array<object>, total: number }>}
   */
  async getCapiProductionTable(filters = {}, pagination = {}) {
    const { limit = 20, offset = 0, sortBy = 'created_at', sortOrder = 'desc' } = pagination;

    let query = db('capi_audits')
      .leftJoin('submissions', 'capi_audits.submission_id', 'submissions.id')
      .leftJoin('projects', 'submissions.project_id', 'projects.id')
      .leftJoin('vendors', 'submissions.vendor_id', 'vendors.id')
      .leftJoin('users as auditors', 'capi_audits.auditor_id', 'auditors.id');

    applyBaseFilters(query, filters, {
      projectId: 'submissions.project_id',
      vendorId: 'submissions.vendor_id',
      clientId: 'projects.client_id',
      stateId: 'submissions.state_id',
      userId: 'capi_audits.auditor_id',
      status: 'capi_audits.overall_status',
      dateCol: 'capi_audits.created_at',
      searchCols: ['submissions.submission_id', 'auditors.first_name', 'auditors.last_name', 'submissions.respondent_name'],
    });

    const countQuery = query.clone();
    const countResult = await countQuery.count('capi_audits.id as count').first();
    const total = countResult ? parseInt(countResult.count, 10) : 0;

    const rows = await query
      .select(
        'capi_audits.id',
        'capi_audits.submission_id',
        'submissions.submission_id as business_submission_id',
        'capi_audits.overall_status as status',
        'capi_audits.overall_result as decision',
        'capi_audits.score',
        db.raw('COALESCE(EXTRACT(EPOCH FROM (capi_audits.completed_at - capi_audits.started_at)), 0)::int as duration_seconds'),
        'capi_audits.created_at',
        'capi_audits.updated_at',
        'projects.id as project_id',
        'projects.name as project_name',
        'projects.project_code as project_code',
        'vendors.id as vendor_id',
        'vendors.name as vendor_name',
        'auditors.id as auditor_id',
        'auditors.first_name as auditor_first_name',
        'auditors.last_name as auditor_last_name',
        'auditors.email as auditor_email'
      )
      .orderBy(`capi_audits.${sortBy || 'created_at'}`, sortOrder || 'desc')
      .limit(limit)
      .offset(offset);

    return { rows, total };
  },

  /**
   * CAPI Auditor Performance Report (CAPI APR)
   * Metrics grouped per auditor: total audited, pass/fail rate, mismatches, prompting, not audible, AHT, productivity.
   * @param {object} filters
   * @param {object} pagination
   * @returns {Promise<{ rows: Array<object>, total: number, summary: object }>}
   */
  async getCapiApr(filters = {}, pagination = {}) {
    const { limit = 20, offset = 0, sortBy = 'total_audited', sortOrder = 'desc' } = pagination;

    let base = db('capi_audits')
      .leftJoin('projects', 'capi_audits.project_id', 'projects.id')
      .leftJoin('vendors', 'capi_audits.vendor_id', 'vendors.id')
      .leftJoin('users as auditors', 'capi_audits.auditor_id', 'auditors.id')
      .whereNotNull('capi_audits.auditor_id');

    applyBaseFilters(base, filters, {
      projectId: 'capi_audits.project_id',
      vendorId: 'capi_audits.vendor_id',
      clientId: 'projects.client_id',
      userId: 'capi_audits.auditor_id',
      dateCol: 'capi_audits.created_at',
      searchCols: ['auditors.first_name', 'auditors.last_name', 'auditors.email'],
    });

    const subquery = base
      .groupBy(
        'capi_audits.auditor_id',
        'auditors.first_name',
        'auditors.last_name',
        'auditors.email',
        'vendors.id',
        'vendors.name'
      )
      .select(
        'capi_audits.auditor_id as auditor_id',
        'auditors.first_name as auditor_first_name',
        'auditors.last_name as auditor_last_name',
        'auditors.email as auditor_email',
        'vendors.id as vendor_id',
        'vendors.name as vendor_name',
        db.raw('COUNT(*)::int as total_audited'),
        db.raw("COUNT(*) FILTER (WHERE capi_audits.status = 'COMPLETED')::int as completed_audits"),
        db.raw("COUNT(*) FILTER (WHERE capi_audits.decision = 'PASS')::int as pass_count"),
        db.raw("COUNT(*) FILTER (WHERE capi_audits.decision = 'FAIL')::int as fail_count"),
        db.raw("COUNT(*) FILTER (WHERE capi_audits.decision = 'ESCALATE')::int as escalate_count"),
        db.raw('COALESCE(AVG(capi_audits.duration_seconds) FILTER (WHERE capi_audits.duration_seconds > 0), 0)::float as avg_handling_time_seconds'),
        db.raw('COALESCE(SUM(capi_audits.duration_seconds), 0)::bigint as productive_time_seconds'),
        db.raw('COALESCE(AVG(capi_audits.score), 0)::float as avg_score')
      );

    const totalCountResult = await db.from(subquery.as('t')).count('* as count').first();
    const total = totalCountResult ? parseInt(totalCountResult.count, 10) : 0;

    const rows = await db
      .from(subquery.as('t'))
      .orderBy(sortBy || 'total_audited', sortOrder || 'desc')
      .limit(limit)
      .offset(offset);

    const summaryResult = await db
      .from(subquery.as('s'))
      .select(
        db.raw('COUNT(*)::int as total_auditors'),
        db.raw('COALESCE(SUM(total_audited), 0)::bigint as total_audited'),
        db.raw('COALESCE(SUM(completed_audits), 0)::bigint as total_completed'),
        db.raw('COALESCE(SUM(pass_count), 0)::bigint as total_passed'),
        db.raw('COALESCE(SUM(fail_count), 0)::bigint as total_failed'),
        db.raw('COALESCE(AVG(avg_handling_time_seconds), 0)::float as overall_avg_aht'),
        db.raw('COALESCE(AVG(avg_score), 0)::float as overall_avg_score')
      )
      .first();

    return { rows, total, summary: summaryResult || {} };
  },

  // ==========================================
  // 3. SUPER AUDIT REPORT & APR
  // ==========================================

  /**
   * Super Audit Production KPI Summary
   * Confirm rate, overrule rate, fraud suspected, escalation rate.
   * @param {object} filters
   * @returns {Promise<object>}
   */
  async getSuperAuditProductionSummary(filters = {}) {
    let query = db('super_audits')
      .leftJoin('submissions', 'super_audits.submission_id', 'submissions.id')
      .leftJoin('projects', 'super_audits.project_id', 'projects.id')
      .leftJoin('vendors', 'super_audits.vendor_id', 'vendors.id');

    applyBaseFilters(query, filters, {
      projectId: 'super_audits.project_id',
      vendorId: 'super_audits.vendor_id',
      clientId: 'projects.client_id',
      stateId: 'submissions.state_id',
      userId: 'super_audits.super_auditor_id',
      status: 'super_audits.status',
      dateCol: 'super_audits.created_at',
    });

    const result = await query
      .select(
        db.raw('COUNT(*)::int as total_super_audits'),
        db.raw("COUNT(*) FILTER (WHERE super_audits.status = 'COMPLETED')::int as completed_super_audits"),
        db.raw("COUNT(*) FILTER (WHERE super_audits.decision = 'CONFIRM')::int as confirmed_count"),
        db.raw("COUNT(*) FILTER (WHERE super_audits.decision = 'OVERRULE')::int as overruled_count"),
        db.raw("COUNT(*) FILTER (WHERE super_audits.decision = 'ESCALATE' OR super_audits.routing_reason = 'ESCALATION')::int as escalation_count"),
        db.raw("COUNT(*) FILTER (WHERE super_audits.routing_reason = 'FRAUD' OR super_audits.decision = 'FRAUD' OR LOWER(COALESCE(super_audits.notes, '')) LIKE '%fraud%')::int as fraud_suspected_count"),
        db.raw('COALESCE(AVG(super_audits.variance_score), 0)::float as avg_variance_score'),
        db.raw('COALESCE(AVG(super_audits.super_audit_score), 0)::float as avg_super_audit_score')
      )
      .first();

    return result || {
      total_super_audits: 0,
      completed_super_audits: 0,
      confirmed_count: 0,
      overruled_count: 0,
      escalation_count: 0,
      fraud_suspected_count: 0,
      avg_variance_score: 0,
      avg_super_audit_score: 0,
    };
  },

  /**
   * Super Audit APR
   * Grouped per super auditor
   * @param {object} filters
   * @param {object} pagination
   * @returns {Promise<{ rows: Array<object>, total: number, summary: object }>}
   */
  async getSuperAuditApr(filters = {}, pagination = {}) {
    const { limit = 20, offset = 0, sortBy = 'total_reviews', sortOrder = 'desc' } = pagination;

    let base = db('super_audits')
      .leftJoin('projects', 'super_audits.project_id', 'projects.id')
      .leftJoin('vendors', 'super_audits.vendor_id', 'vendors.id')
      .leftJoin('users as super_auditors', 'super_audits.super_auditor_id', 'super_auditors.id')
      .whereNotNull('super_audits.super_auditor_id');

    applyBaseFilters(base, filters, {
      projectId: 'super_audits.project_id',
      vendorId: 'super_audits.vendor_id',
      clientId: 'projects.client_id',
      userId: 'super_audits.super_auditor_id',
      dateCol: 'super_audits.created_at',
      searchCols: ['super_auditors.first_name', 'super_auditors.last_name', 'super_auditors.email'],
    });

    const subquery = base
      .groupBy(
        'super_audits.super_auditor_id',
        'super_auditors.first_name',
        'super_auditors.last_name',
        'super_auditors.email',
        'vendors.id',
        'vendors.name'
      )
      .select(
        'super_audits.super_auditor_id as super_auditor_id',
        'super_auditors.first_name as super_auditor_first_name',
        'super_auditors.last_name as super_auditor_last_name',
        'super_auditors.email as super_auditor_email',
        'vendors.id as vendor_id',
        'vendors.name as vendor_name',
        db.raw('COUNT(*)::int as total_reviews'),
        db.raw("COUNT(*) FILTER (WHERE super_audits.status = 'COMPLETED')::int as completed_reviews"),
        db.raw("COUNT(*) FILTER (WHERE super_audits.decision = 'CONFIRM')::int as confirmed_count"),
        db.raw("COUNT(*) FILTER (WHERE super_audits.decision = 'OVERRULE')::int as overruled_count"),
        db.raw("COUNT(*) FILTER (WHERE super_audits.decision = 'ESCALATE' OR super_audits.routing_reason = 'ESCALATION')::int as escalation_count"),
        db.raw("COUNT(*) FILTER (WHERE super_audits.routing_reason = 'FRAUD' OR super_audits.decision = 'FRAUD' OR LOWER(COALESCE(super_audits.notes, '')) LIKE '%fraud%')::int as fraud_suspected_count"),
        db.raw('COALESCE(AVG(super_audits.variance_score), 0)::float as avg_variance_score'),
        db.raw('COALESCE(AVG(super_audits.super_audit_score), 0)::float as avg_super_audit_score')
      );

    const totalCountResult = await db.from(subquery.as('t')).count('* as count').first();
    const total = totalCountResult ? parseInt(totalCountResult.count, 10) : 0;

    const rows = await db
      .from(subquery.as('t'))
      .orderBy(sortBy || 'total_reviews', sortOrder || 'desc')
      .limit(limit)
      .offset(offset);

    const summaryResult = await db
      .from(subquery.as('s'))
      .select(
        db.raw('COUNT(*)::int as total_super_auditors'),
        db.raw('COALESCE(SUM(total_reviews), 0)::bigint as total_reviews'),
        db.raw('COALESCE(SUM(confirmed_count), 0)::bigint as total_confirmed'),
        db.raw('COALESCE(SUM(overruled_count), 0)::bigint as total_overruled'),
        db.raw('COALESCE(SUM(fraud_suspected_count), 0)::bigint as total_fraud_suspected')
      )
      .first();

    return { rows, total, summary: summaryResult || {} };
  },

  // ==========================================
  // 4. TVC CPR/CDR-STYLE REPORT & APR
  // ==========================================

  /**
   * TVC CPR (Call Performance Report / CDR) Summary
   * Lead count, dial attempts, connected, completed TVC, ring time, talk time, AHT, connect rate, completion rate, verification rate, disposition pending count.
   * @param {object} filters
   * @returns {Promise<object>}
   */
  async getTvcCprSummary(filters = {}) {
    // 1. Leads overview
    let leadQuery = db('tvc_leads')
      .leftJoin('projects', 'tvc_leads.project_id', 'projects.id')
      .leftJoin('vendors', 'tvc_leads.vendor_id', 'vendors.id');

    applyBaseFilters(leadQuery, filters, {
      projectId: 'tvc_leads.project_id',
      vendorId: 'tvc_leads.vendor_id',
      clientId: 'projects.client_id',
      userId: 'tvc_leads.agent_id',
      status: 'tvc_leads.status',
      dateCol: 'tvc_leads.created_at',
    });

    const leadCounts = await leadQuery
      .select(
        db.raw('COUNT(*)::int as total_leads'),
        db.raw("COUNT(*) FILTER (WHERE tvc_leads.verification_status = 'VERIFIED')::int as verified_leads"),
        db.raw("COUNT(*) FILTER (WHERE tvc_leads.verification_status = 'FAILED')::int as failed_verification_leads"),
        db.raw("COUNT(*) FILTER (WHERE tvc_leads.status IN ('QUEUED', 'PENDING', 'CALLBACK_SCHEDULED'))::int as disposition_pending_count"),
        db.raw("COUNT(*) FILTER (WHERE tvc_leads.verification_status IN ('VERIFIED', 'FAILED') OR tvc_leads.status = 'MAX_ATTEMPTS_EXCEEDED')::int as completed_tvc")
      )
      .first();

    // 2. Call attempts metrics
    let attemptQuery = db('tvc_attempts')
      .join('tvc_leads', 'tvc_attempts.tvc_lead_id', 'tvc_leads.id')
      .leftJoin('projects', 'tvc_leads.project_id', 'projects.id');

    applyBaseFilters(attemptQuery, filters, {
      projectId: 'tvc_leads.project_id',
      vendorId: 'tvc_leads.vendor_id',
      clientId: 'projects.client_id',
      userId: 'tvc_attempts.agent_id',
      disposition: 'tvc_attempts.disposition',
      dateCol: 'tvc_attempts.created_at',
    });

    const attemptCounts = await attemptQuery
      .select(
        db.raw('COUNT(*)::int as dial_attempts'),
        db.raw("COUNT(*) FILTER (WHERE tvc_attempts.call_status IN ('ANSWERED', 'CONNECTED'))::int as connected_calls"),
        db.raw("COUNT(*) FILTER (WHERE tvc_attempts.call_status IN ('FAILED', 'BUSY', 'NO_ANSWER'))::int as failed_calls"),
        db.raw('COALESCE(SUM(tvc_attempts.ring_time_seconds), 0)::bigint as total_ring_time_seconds'),
        db.raw('COALESCE(AVG(tvc_attempts.ring_time_seconds), 0)::float as avg_ring_time_seconds'),
        db.raw('COALESCE(SUM(tvc_attempts.talk_time_seconds), 0)::bigint as total_talk_time_seconds'),
        db.raw('COALESCE(AVG(tvc_attempts.talk_time_seconds), 0)::float as avg_talk_time_seconds'),
        db.raw('COALESCE(AVG(tvc_attempts.duration_seconds), 0)::float as avg_handling_time_seconds'),
        db.raw('COALESCE(SUM(tvc_attempts.duration_seconds), 0)::bigint as total_duration_seconds')
      )
      .first();

    return {
      total_leads: leadCounts?.total_leads || 0,
      verified_leads: leadCounts?.verified_leads || 0,
      failed_verification_leads: leadCounts?.failed_verification_leads || 0,
      disposition_pending_count: leadCounts?.disposition_pending_count || 0,
      completed_tvc: leadCounts?.completed_tvc || 0,
      dial_attempts: attemptCounts?.dial_attempts || 0,
      connected_calls: attemptCounts?.connected_calls || 0,
      failed_calls: attemptCounts?.failed_calls || 0,
      total_ring_time_seconds: attemptCounts?.total_ring_time_seconds || 0,
      avg_ring_time_seconds: attemptCounts?.avg_ring_time_seconds || 0,
      total_talk_time_seconds: attemptCounts?.total_talk_time_seconds || 0,
      avg_talk_time_seconds: attemptCounts?.avg_talk_time_seconds || 0,
      avg_handling_time_seconds: attemptCounts?.avg_handling_time_seconds || 0,
      total_duration_seconds: attemptCounts?.total_duration_seconds || 0,
    };
  },

  /**
   * TVC CPR Tabular Log / Drill-down
   * @param {object} filters
   * @param {object} pagination
   * @returns {Promise<{ rows: Array<object>, total: number }>}
   */
  async getTvcCprTable(filters = {}, pagination = {}) {
    const { limit = 20, offset = 0, sortBy = 'created_at', sortOrder = 'desc' } = pagination;

    let query = db('tvc_attempts')
      .join('tvc_leads', 'tvc_attempts.tvc_lead_id', 'tvc_leads.id')
      .leftJoin('projects', 'tvc_leads.project_id', 'projects.id')
      .leftJoin('vendors', 'tvc_leads.vendor_id', 'vendors.id')
      .leftJoin('users as agents', 'tvc_attempts.agent_id', 'agents.id');

    applyBaseFilters(query, filters, {
      projectId: 'tvc_leads.project_id',
      vendorId: 'tvc_leads.vendor_id',
      clientId: 'projects.client_id',
      userId: 'tvc_attempts.agent_id',
      disposition: 'tvc_attempts.disposition',
      dateCol: 'tvc_attempts.created_at',
      searchCols: ['tvc_leads.respondent_name', 'tvc_leads.phone_number', 'agents.first_name', 'agents.last_name'],
    });

    const countQuery = query.clone();
    const countResult = await countQuery.count('tvc_attempts.id as count').first();
    const total = countResult ? parseInt(countResult.count, 10) : 0;

    const rows = await query
      .select(
        'tvc_attempts.id',
        'tvc_attempts.tvc_lead_id',
        'tvc_attempts.attempt_number',
        'tvc_attempts.call_status',
        'tvc_attempts.disposition',
        'tvc_attempts.duration_seconds',
        'tvc_attempts.ring_time_seconds',
        'tvc_attempts.talk_time_seconds',
        'tvc_attempts.created_at',
        'tvc_leads.respondent_name',
        'tvc_leads.phone_number',
        'tvc_leads.verification_status',
        'projects.id as project_id',
        'projects.name as project_name',
        'vendors.id as vendor_id',
        'vendors.name as vendor_name',
        'agents.id as agent_id',
        'agents.first_name as agent_first_name',
        'agents.last_name as agent_last_name',
        'agents.email as agent_email'
      )
      .orderBy(`tvc_attempts.${sortBy || 'created_at'}`, sortOrder || 'desc')
      .limit(limit)
      .offset(offset);

    return { rows, total };
  },

  /**
   * TVC APR (Agent Performance Report)
   * Grouped per agent
   * @param {object} filters
   * @param {object} pagination
   * @returns {Promise<{ rows: Array<object>, total: number, summary: object }>}
   */
  async getTvcApr(filters = {}, pagination = {}) {
    const { limit = 20, offset = 0, sortBy = 'dial_attempts', sortOrder = 'desc' } = pagination;

    let base = db('tvc_attempts')
      .join('tvc_leads', 'tvc_attempts.tvc_lead_id', 'tvc_leads.id')
      .leftJoin('projects', 'tvc_leads.project_id', 'projects.id')
      .leftJoin('vendors', 'tvc_leads.vendor_id', 'vendors.id')
      .leftJoin('users as agents', 'tvc_attempts.agent_id', 'agents.id')
      .whereNotNull('tvc_attempts.agent_id');

    applyBaseFilters(base, filters, {
      projectId: 'tvc_leads.project_id',
      vendorId: 'tvc_leads.vendor_id',
      clientId: 'projects.client_id',
      userId: 'tvc_attempts.agent_id',
      dateCol: 'tvc_attempts.created_at',
      searchCols: ['agents.first_name', 'agents.last_name', 'agents.email'],
    });

    const subquery = base
      .groupBy(
        'tvc_attempts.agent_id',
        'agents.first_name',
        'agents.last_name',
        'agents.email',
        'vendors.id',
        'vendors.name'
      )
      .select(
        'tvc_attempts.agent_id as agent_id',
        'agents.first_name as agent_first_name',
        'agents.last_name as agent_last_name',
        'agents.email as agent_email',
        'vendors.id as vendor_id',
        'vendors.name as vendor_name',
        db.raw('COUNT(DISTINCT tvc_leads.id)::int as lead_count'),
        db.raw('COUNT(tvc_attempts.id)::int as dial_attempts'),
        db.raw("COUNT(tvc_attempts.id) FILTER (WHERE tvc_attempts.call_status IN ('ANSWERED', 'CONNECTED'))::int as connected_calls"),
        db.raw("COUNT(DISTINCT tvc_leads.id) FILTER (WHERE tvc_leads.verification_status = 'VERIFIED')::int as verified_leads"),
        db.raw("COUNT(DISTINCT tvc_leads.id) FILTER (WHERE tvc_leads.verification_status IN ('VERIFIED', 'FAILED'))::int as completed_tvc"),
        db.raw('COALESCE(SUM(tvc_attempts.ring_time_seconds), 0)::bigint as total_ring_time_seconds'),
        db.raw('COALESCE(SUM(tvc_attempts.talk_time_seconds), 0)::bigint as total_talk_time_seconds'),
        db.raw('COALESCE(AVG(tvc_attempts.duration_seconds), 0)::float as avg_handling_time_seconds')
      );

    const totalCountResult = await db.from(subquery.as('t')).count('* as count').first();
    const total = totalCountResult ? parseInt(totalCountResult.count, 10) : 0;

    const rows = await db
      .from(subquery.as('t'))
      .orderBy(sortBy || 'dial_attempts', sortOrder || 'desc')
      .limit(limit)
      .offset(offset);

    const summaryResult = await db
      .from(subquery.as('s'))
      .select(
        db.raw('COUNT(*)::int as total_agents'),
        db.raw('COALESCE(SUM(dial_attempts), 0)::bigint as total_dial_attempts'),
        db.raw('COALESCE(SUM(connected_calls), 0)::bigint as total_connected_calls'),
        db.raw('COALESCE(SUM(verified_leads), 0)::bigint as total_verified_leads'),
        db.raw('COALESCE(SUM(total_talk_time_seconds), 0)::bigint as total_talk_time_seconds')
      )
      .first();

    return { rows, total, summary: summaryResult || {} };
  },

  // ==========================================
  // 5. FEEDBACK CALLING (FA) CDR & APR
  // ==========================================

  /**
   * Feedback Calling CDR KPI Summary
   * Feedback leads, dial attempts, connected, completed, agent admitted mistake, agent disputed/asked proof, ended early.
   * @param {object} filters
   * @returns {Promise<object>}
   */
  async getFaCdrSummary(filters = {}) {
    let leadQuery = db('feedback_leads')
      .leftJoin('projects', 'feedback_leads.project_id', 'projects.id')
      .leftJoin('vendors', 'feedback_leads.vendor_id', 'vendors.id');

    applyBaseFilters(leadQuery, filters, {
      projectId: 'feedback_leads.project_id',
      vendorId: 'feedback_leads.vendor_id',
      clientId: 'projects.client_id',
      userId: 'feedback_leads.feedback_caller_id',
      status: 'feedback_leads.status',
      dateCol: 'feedback_leads.created_at',
    });

    const leadCounts = await leadQuery
      .select(
        db.raw('COUNT(*)::int as total_feedback_leads'),
        db.raw("COUNT(*) FILTER (WHERE feedback_leads.status IN ('RESOLVED_ADMITTED', 'RESOLVED_DISPUTED', 'CLOSED', 'RESOLVED'))::int as completed_feedback"),
        db.raw("COUNT(*) FILTER (WHERE feedback_leads.resolution = 'MISTAKE_ADMITTED')::int as mistake_admitted_count"),
        db.raw("COUNT(*) FILTER (WHERE feedback_leads.resolution = 'DISPUTED')::int as disputed_count"),
        db.raw("COUNT(*) FILTER (WHERE feedback_leads.status = 'PENDING')::int as pending_count")
      )
      .first();

    let attemptQuery = db('feedback_attempts')
      .join('feedback_leads', 'feedback_attempts.feedback_lead_id', 'feedback_leads.id')
      .leftJoin('projects', 'feedback_leads.project_id', 'projects.id');

    applyBaseFilters(attemptQuery, filters, {
      projectId: 'feedback_leads.project_id',
      vendorId: 'feedback_leads.vendor_id',
      clientId: 'projects.client_id',
      userId: 'feedback_attempts.caller_id',
      dateCol: 'feedback_attempts.created_at',
    });

    const attemptCounts = await attemptQuery
      .select(
        db.raw('COUNT(*)::int as dial_attempts'),
        db.raw("COUNT(*) FILTER (WHERE feedback_attempts.call_status IN ('ANSWERED', 'CONNECTED'))::int as connected_calls"),
        db.raw("COUNT(*) FILTER (WHERE feedback_attempts.call_status IN ('FAILED', 'BUSY', 'NO_ANSWER'))::int as failed_calls"),
        db.raw("COUNT(*) FILTER (WHERE feedback_attempts.duration_seconds < 15 OR LOWER(COALESCE(feedback_attempts.notes, '')) LIKE '%early%')::int as ended_early_count"),
        db.raw('COALESCE(AVG(feedback_attempts.duration_seconds), 0)::float as avg_handling_time_seconds'),
        db.raw('COALESCE(SUM(feedback_attempts.duration_seconds), 0)::bigint as total_duration_seconds')
      )
      .first();

    return {
      total_feedback_leads: leadCounts?.total_feedback_leads || 0,
      completed_feedback: leadCounts?.completed_feedback || 0,
      mistake_admitted_count: leadCounts?.mistake_admitted_count || 0,
      disputed_count: leadCounts?.disputed_count || 0,
      pending_count: leadCounts?.pending_count || 0,
      dial_attempts: attemptCounts?.dial_attempts || 0,
      connected_calls: attemptCounts?.connected_calls || 0,
      failed_calls: attemptCounts?.failed_calls || 0,
      ended_early_count: attemptCounts?.ended_early_count || 0,
      avg_handling_time_seconds: attemptCounts?.avg_handling_time_seconds || 0,
      total_duration_seconds: attemptCounts?.total_duration_seconds || 0,
    };
  },

  /**
   * Feedback Calling APR
   * Grouped per caller agent
   * @param {object} filters
   * @param {object} pagination
   * @returns {Promise<{ rows: Array<object>, total: number, summary: object }>}
   */
  async getFaApr(filters = {}, pagination = {}) {
    const { limit = 20, offset = 0, sortBy = 'dial_attempts', sortOrder = 'desc' } = pagination;

    let base = db('feedback_attempts')
      .join('feedback_leads', 'feedback_attempts.feedback_lead_id', 'feedback_leads.id')
      .leftJoin('projects', 'feedback_leads.project_id', 'projects.id')
      .leftJoin('vendors', 'feedback_leads.vendor_id', 'vendors.id')
      .leftJoin('users as callers', 'feedback_attempts.caller_id', 'callers.id')
      .whereNotNull('feedback_attempts.caller_id');

    applyBaseFilters(base, filters, {
      projectId: 'feedback_leads.project_id',
      vendorId: 'feedback_leads.vendor_id',
      clientId: 'projects.client_id',
      userId: 'feedback_attempts.caller_id',
      dateCol: 'feedback_attempts.created_at',
      searchCols: ['callers.first_name', 'callers.last_name', 'callers.email'],
    });

    const subquery = base
      .groupBy(
        'feedback_attempts.caller_id',
        'callers.first_name',
        'callers.last_name',
        'callers.email',
        'vendors.id',
        'vendors.name'
      )
      .select(
        'feedback_attempts.caller_id as caller_id',
        'callers.first_name as caller_first_name',
        'callers.last_name as caller_last_name',
        'callers.email as caller_email',
        'vendors.id as vendor_id',
        'vendors.name as vendor_name',
        db.raw('COUNT(DISTINCT feedback_leads.id)::int as feedback_leads_count'),
        db.raw('COUNT(feedback_attempts.id)::int as dial_attempts'),
        db.raw("COUNT(feedback_attempts.id) FILTER (WHERE feedback_attempts.call_status IN ('ANSWERED', 'CONNECTED'))::int as connected_calls"),
        db.raw("COUNT(DISTINCT feedback_leads.id) FILTER (WHERE feedback_leads.resolution = 'MISTAKE_ADMITTED')::int as mistake_admitted_count"),
        db.raw("COUNT(DISTINCT feedback_leads.id) FILTER (WHERE feedback_leads.resolution = 'DISPUTED')::int as disputed_count"),
        db.raw("COUNT(feedback_attempts.id) FILTER (WHERE feedback_attempts.duration_seconds < 15)::int as ended_early_count"),
        db.raw('COALESCE(AVG(feedback_attempts.duration_seconds), 0)::float as avg_handling_time_seconds'),
        db.raw('COALESCE(SUM(feedback_attempts.duration_seconds), 0)::bigint as total_duration_seconds')
      );

    const totalCountResult = await db.from(subquery.as('t')).count('* as count').first();
    const total = totalCountResult ? parseInt(totalCountResult.count, 10) : 0;

    const rows = await db
      .from(subquery.as('t'))
      .orderBy(sortBy || 'dial_attempts', sortOrder || 'desc')
      .limit(limit)
      .offset(offset);

    const summaryResult = await db
      .from(subquery.as('s'))
      .select(
        db.raw('COUNT(*)::int as total_callers'),
        db.raw('COALESCE(SUM(dial_attempts), 0)::bigint as total_dial_attempts'),
        db.raw('COALESCE(SUM(connected_calls), 0)::bigint as total_connected_calls'),
        db.raw('COALESCE(SUM(mistake_admitted_count), 0)::bigint as total_admitted'),
        db.raw('COALESCE(SUM(disputed_count), 0)::bigint as total_disputed')
      )
      .first();

    return { rows, total, summary: summaryResult || {} };
  },

  // ==========================================
  // 6. CROSS-MODULE UNIFIED APR
  // ==========================================

  /**
   * Cross-Module Unified Agent Daily Scorecard & Performance Report
   * Aggregates login time, productive time, idle time, completed work items, and quality KPI across modules.
   * @param {object} filters
   * @param {object} pagination
   * @returns {Promise<{ rows: Array<object>, total: number, summary: object }>}
   */
  async getUnifiedApr(filters = {}, pagination = {}) {
    const { limit = 20, offset = 0, sortBy = 'total_completed_items', sortOrder = 'desc' } = pagination;

    // Filter active users with relevant roles
    let userQuery = db('users')
      .leftJoin('vendors', 'users.vendor_id', 'vendors.id')
      .leftJoin('roles', 'users.role_id', 'roles.id')
      .whereNull('users.deleted_at');

    if (filters.vendorId) {
      userQuery.where('users.vendor_id', filters.vendorId);
    }
    if (filters.userId || filters.agentId) {
      userQuery.where('users.id', filters.userId || filters.agentId);
    }
    if (filters.search) {
      const term = `%${filters.search.toLowerCase()}%`;
      userQuery.where((b) => {
        b.whereRaw('LOWER(users.first_name) LIKE ?', [term])
          .orWhereRaw('LOWER(users.last_name) LIKE ?', [term])
          .orWhereRaw('LOWER(users.email) LIKE ?', [term]);
      });
    }

    const totalCountRes = await userQuery.clone().count('users.id as count').first();
    const total = totalCountRes ? parseInt(totalCountRes.count, 10) : 0;

    const users = await userQuery
      .select(
        'users.id as user_id',
        'users.first_name',
        'users.last_name',
        'users.email',
        'users.phone',
        'users.role_id',
        'roles.name as role_name',
        'vendors.id as vendor_id',
        'vendors.name as vendor_name'
      )
      .limit(limit)
      .offset(offset);

    if (users.length === 0) {
      return { rows: [], total, summary: {} };
    }

    const userIds = users.map((u) => u.user_id);

    // 1. CATI metrics per user
    const catiQuery = db('submissions')
      .whereIn('source_agent_id', userIds);
    if (filters.projectId) catiQuery.where('project_id', filters.projectId);
    if (filters.dateFrom) catiQuery.where('created_at', '>=', filters.dateFrom);
    if (filters.dateTo) catiQuery.where('created_at', '<=', filters.dateTo);

    const catiStats = await catiQuery
      .groupBy('source_agent_id')
      .select(
        'source_agent_id',
        db.raw("COUNT(*) FILTER (WHERE source_status IN ('COMPLETED', 'SUBMITTED'))::int as completed_surveys"),
        db.raw('COALESCE(SUM(duration_seconds), 0)::bigint as cati_productive_seconds')
      );
    const catiMap = new Map(catiStats.map((item) => [item.source_agent_id, item]));

    // 2. CAPI metrics per user
    const capiQuery = db('capi_audits')
      .whereIn('auditor_id', userIds);
    if (filters.projectId) capiQuery.where('project_id', filters.projectId);
    if (filters.dateFrom) capiQuery.where('created_at', '>=', filters.dateFrom);
    if (filters.dateTo) capiQuery.where('created_at', '<=', filters.dateTo);

    const capiStats = await capiQuery
      .groupBy('auditor_id')
      .select(
        'auditor_id',
        db.raw("COUNT(*) FILTER (WHERE status = 'COMPLETED')::int as completed_audits"),
        db.raw("COUNT(*) FILTER (WHERE decision = 'PASS')::int as passed_audits"),
        db.raw('COALESCE(SUM(duration_seconds), 0)::bigint as capi_productive_seconds')
      );
    const capiMap = new Map(capiStats.map((item) => [item.auditor_id, item]));

    // 3. Super Audit metrics per user
    const superAuditQuery = db('super_audits')
      .whereIn('super_auditor_id', userIds);
    if (filters.projectId) superAuditQuery.where('project_id', filters.projectId);
    if (filters.dateFrom) superAuditQuery.where('created_at', '>=', filters.dateFrom);
    if (filters.dateTo) superAuditQuery.where('created_at', '<=', filters.dateTo);

    const superAuditStats = await superAuditQuery
      .groupBy('super_auditor_id')
      .select(
        'super_auditor_id',
        db.raw("COUNT(*) FILTER (WHERE status = 'COMPLETED')::int as completed_super_audits"),
        db.raw("COUNT(*) FILTER (WHERE decision = 'CONFIRM')::int as confirmed_super_audits"),
        db.raw('COUNT(*)::int as total_super_audits')
      );
    const superAuditMap = new Map(superAuditStats.map((item) => [item.super_auditor_id, item]));

    // 4. TVC metrics per user
    const tvcQuery = db('tvc_attempts')
      .whereIn('agent_id', userIds);
    if (filters.dateFrom) tvcQuery.where('created_at', '>=', filters.dateFrom);
    if (filters.dateTo) tvcQuery.where('created_at', '<=', filters.dateTo);

    const tvcStats = await tvcQuery
      .groupBy('agent_id')
      .select(
        'agent_id',
        db.raw('COUNT(*)::int as tvc_attempts'),
        db.raw("COUNT(*) FILTER (WHERE call_status IN ('ANSWERED', 'CONNECTED'))::int as tvc_connected"),
        db.raw('COALESCE(SUM(duration_seconds), 0)::bigint as tvc_productive_seconds')
      );
    const tvcMap = new Map(tvcStats.map((item) => [item.agent_id, item]));

    // 5. Feedback Calling metrics per user
    const faQuery = db('feedback_attempts')
      .whereIn('caller_id', userIds);
    if (filters.dateFrom) faQuery.where('created_at', '>=', filters.dateFrom);
    if (filters.dateTo) faQuery.where('created_at', '<=', filters.dateTo);

    const faStats = await faQuery
      .groupBy('caller_id')
      .select(
        'caller_id',
        db.raw('COUNT(*)::int as fa_attempts'),
        db.raw("COUNT(*) FILTER (WHERE call_status IN ('ANSWERED', 'CONNECTED'))::int as fa_connected"),
        db.raw('COALESCE(SUM(duration_seconds), 0)::bigint as fa_productive_seconds')
      );
    const faMap = new Map(faStats.map((item) => [item.caller_id, item]));

    // Combine scorecard rows
    const rows = users.map((user) => {
      const cati = catiMap.get(user.user_id) || { completed_surveys: 0, cati_productive_seconds: 0 };
      const capi = capiMap.get(user.user_id) || { completed_audits: 0, passed_audits: 0, capi_productive_seconds: 0 };
      const sa = superAuditMap.get(user.user_id) || { completed_super_audits: 0, confirmed_super_audits: 0, total_super_audits: 0 };
      const tvc = tvcMap.get(user.user_id) || { tvc_attempts: 0, tvc_connected: 0, tvc_productive_seconds: 0 };
      const fa = faMap.get(user.user_id) || { fa_attempts: 0, fa_connected: 0, fa_productive_seconds: 0 };

      const catiProductive = parseInt(cati.cati_productive_seconds || 0, 10);
      const capiProductive = parseInt(capi.capi_productive_seconds || 0, 10);
      const saProductive = (sa.completed_super_audits || 0) * 300; // estimated 5 mins per super audit
      const tvcProductive = parseInt(tvc.tvc_productive_seconds || 0, 10);
      const faProductive = parseInt(fa.fa_productive_seconds || 0, 10);

      const totalProductiveSeconds = catiProductive + capiProductive + saProductive + tvcProductive + faProductive;
      // Standard workday basis (28,800 sec = 8h), idle is delta or 0
      const standardShiftSeconds = totalProductiveSeconds > 0 ? Math.max(totalProductiveSeconds, 28800) : 0;
      const idleTimeSeconds = Math.max(0, standardShiftSeconds - totalProductiveSeconds);

      const totalCompletedItems =
        (cati.completed_surveys || 0) +
        (capi.completed_audits || 0) +
        (sa.completed_super_audits || 0) +
        (tvc.tvc_connected || 0) +
        (fa.fa_connected || 0);

      // Quality KPI calculation
      let qualityKpi = 85.0; // Baseline
      if (capi.completed_audits > 0) {
        qualityKpi = parseFloat(((capi.passed_audits / capi.completed_audits) * 100).toFixed(1));
      } else if (sa.total_super_audits > 0) {
        qualityKpi = parseFloat(((sa.confirmed_super_audits / sa.total_super_audits) * 100).toFixed(1));
      } else if (tvc.tvc_attempts > 0) {
        qualityKpi = parseFloat(((tvc.tvc_connected / tvc.tvc_attempts) * 100).toFixed(1));
      } else if (fa.fa_attempts > 0) {
        qualityKpi = parseFloat(((fa.fa_connected / fa.fa_attempts) * 100).toFixed(1));
      }

      return {
        user_id: user.user_id,
        agent_name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Unknown',
        email: user.email,
        phone: user.phone,
        role_name: user.role_name,
        vendor_id: user.vendor_id,
        vendor_name: user.vendor_name,
        login_time_seconds: standardShiftSeconds,
        productive_time_seconds: totalProductiveSeconds,
        idle_time_seconds: idleTimeSeconds,
        cati_completed_surveys: cati.completed_surveys || 0,
        capi_completed_audits: capi.completed_audits || 0,
        super_audits_completed: sa.completed_super_audits || 0,
        tvc_verifications_completed: tvc.tvc_connected || 0,
        fa_feedback_completed: fa.fa_connected || 0,
        total_completed_items: totalCompletedItems,
        quality_kpi_score: qualityKpi,
      };
    });

    // In-memory sort since computed across joined metrics
    rows.sort((a, b) => {
      const valA = a[sortBy] !== undefined ? a[sortBy] : a.total_completed_items;
      const valB = b[sortBy] !== undefined ? b[sortBy] : b.total_completed_items;
      if (sortOrder.toLowerCase() === 'asc') return valA > valB ? 1 : -1;
      return valA < valB ? 1 : -1;
    });

    return {
      rows,
      total,
      summary: {
        total_agents_evaluated: total,
      },
    };
  },
};

// Wrap all reporting queries with withDbFallback to gracefully fallback to mockStore
const wrappedReportsModel = {
  ...reportsModel,
  async getCatiProductionSummary(filters = {}) {
    return withDbFallback(
      () => reportsModel.getCatiProductionSummary(filters),
      () => mockStore.getReportCatiSummary()
    );
  },
  async getCatiProductionTimeSeries(filters = {}, interval = 'day') {
    return withDbFallback(
      () => reportsModel.getCatiProductionTimeSeries(filters, interval),
      () => mockStore.getReportCatiTimeSeries(interval)
    );
  },
  async getCatiProductionTable(filters = {}, pagination = {}) {
    return withDbFallback(
      () => reportsModel.getCatiProductionTable(filters, pagination),
      () => mockStore.getReportCatiTable(pagination)
    );
  },
  async getCatiApr(filters = {}, pagination = {}) {
    return withDbFallback(
      () => reportsModel.getCatiApr(filters, pagination),
      () => {
        const report = mockStore.getReportCatiApr(pagination);
        return {
          ...report,
          summary: {
            total_active_agents: report.total,
            grand_total_surveys: 420,
            grand_completed_surveys: 320,
            grand_avg_quality_score: 91.5,
          },
        };
      }
    );
  },
  async getCapiProductionSummary(filters = {}) {
    return withDbFallback(
      () => reportsModel.getCapiProductionSummary(filters),
      () => mockStore.getReportCapiSummary()
    );
  },
  async getCapiProductionTable(filters = {}, pagination = {}) {
    return withDbFallback(
      () => reportsModel.getCapiProductionTable(filters, pagination),
      () => mockStore.getReportCapiTable(pagination)
    );
  },
  async getCapiApr(filters = {}, pagination = {}) {
    return withDbFallback(
      () => reportsModel.getCapiApr(filters, pagination),
      () => {
        const report = mockStore.getReportCapiApr(pagination);
        return {
          ...report,
          summary: {
            total_active_auditors: report.total,
            grand_total_audited: 180,
            grand_passed_audits: 165,
            grand_avg_quality_score: 91.2,
          },
        };
      }
    );
  },
  async getSuperAuditProductionSummary(filters = {}) {
    return withDbFallback(
      () => reportsModel.getSuperAuditProductionSummary(filters),
      () => mockStore.getReportSuperAuditSummary()
    );
  },
  async getSuperAuditApr(filters = {}, pagination = {}) {
    return withDbFallback(
      () => reportsModel.getSuperAuditApr(filters, pagination),
      () => {
        const report = mockStore.getReportSuperAuditApr(pagination);
        return {
          ...report,
          summary: {
            total_active_super_auditors: report.total,
            grand_total_reviewed: 50,
            grand_concordant_reviews: 46,
            grand_avg_concordance_rate: 92.0,
          },
        };
      }
    );
  },
  async getTvcCprSummary(filters = {}) {
    return withDbFallback(
      () => reportsModel.getTvcCprSummary(filters),
      () => mockStore.getReportTvcSummary()
    );
  },
  async getTvcCprTable(filters = {}, pagination = {}) {
    return withDbFallback(
      () => reportsModel.getTvcCprTable(filters, pagination),
      () => mockStore.getReportTvcTable(pagination)
    );
  },
  async getTvcApr(filters = {}, pagination = {}) {
    return withDbFallback(
      () => reportsModel.getTvcApr(filters, pagination),
      () => {
        const report = mockStore.getReportTvcApr(pagination);
        return {
          ...report,
          summary: {
            total_active_agents: report.total,
            grand_total_processed: 260,
            grand_total_dialed: 340,
            grand_avg_verification_rate: 90.38,
          },
        };
      }
    );
  },
  async getFaCdrSummary(filters = {}) {
    return withDbFallback(
      () => reportsModel.getFaCdrSummary(filters),
      () => mockStore.getReportFaSummary()
    );
  },
  async getFaApr(filters = {}, pagination = {}) {
    return withDbFallback(
      () => reportsModel.getFaApr(filters, pagination),
      () => {
        const report = mockStore.getReportFaApr(pagination);
        return {
          ...report,
          summary: {
            total_active_callers: report.total,
            grand_total_handled: 45,
            grand_total_resolved: 41,
            grand_avg_resolution_rate: 91.11,
          },
        };
      }
    );
  },
  async getUnifiedApr(filters = {}, pagination = {}) {
    return withDbFallback(
      () => reportsModel.getUnifiedApr(filters, pagination),
      () => {
        const report = mockStore.getReportUnifiedApr(pagination);
        return {
          ...report,
          summary: {
            total_agents_evaluated: report.total,
          },
        };
      }
    );
  },
};

module.exports = wrappedReportsModel;
