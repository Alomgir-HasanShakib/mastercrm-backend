/**
 * @file reports.service.js
 * @description Business logic layer for Unified Reporting & Analytics.
 * Handles calculation of complex rates, durations, time-series formatting, and on-demand Excel/CSV export generation.
 */

const XLSX = require('xlsx');
const dayjs = require('dayjs');
const reportsModel = require('./reports.model');
const { ValidationError } = require('../../utils/errors');

/**
 * Calculates a clean percentage rate
 * @param {number} numerator
 * @param {number} denominator
 * @param {number} [decimals=2]
 * @returns {number}
 */
const calculateRate = (numerator, denominator, decimals = 2) => {
  const num = Number(numerator) || 0;
  const den = Number(denominator) || 0;
  if (den === 0) return 0;
  return parseFloat(((num / den) * 100).toFixed(decimals));
};

/**
 * Formats seconds into human-readable HH:mm:ss format
 * @param {number} totalSeconds
 * @returns {string}
 */
const formatDuration = (totalSeconds) => {
  const sec = Math.max(0, Math.round(Number(totalSeconds) || 0));
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const remainingSeconds = sec % 60;

  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(remainingSeconds)}`;
};

/**
 * Calculates items per hour rate
 * @param {number} itemsCount
 * @param {number} durationSeconds
 * @returns {number}
 */
const calculatePerHour = (itemsCount, durationSeconds) => {
  const items = Number(itemsCount) || 0;
  const seconds = Number(durationSeconds) || 0;
  if (seconds <= 0) return 0;
  const hours = seconds / 3600;
  return parseFloat((items / hours).toFixed(2));
};

const reportsService = {
  // ==========================================
  // 1. CATI PRODUCTION & APR
  // ==========================================

  /**
   * Retrieves full CATI Production Report including KPI summary, time-series, and tabular drilldown.
   * @param {object} filters
   * @param {object} pagination
   * @param {string} [interval='day']
   * @returns {Promise<object>}
   */
  async getCatiProductionReport(filters = {}, pagination = {}, interval = 'day') {
    const [rawSummary, timeSeries, tableData] = await Promise.all([
      reportsModel.getCatiProductionSummary(filters),
      reportsModel.getCatiProductionTimeSeries(filters, interval),
      reportsModel.getCatiProductionTable(filters, pagination),
    ]);

    const totalSurveys = rawSummary.total_surveys || 0;
    const completedSurveys = rawSummary.completed_surveys || 0;

    const summary = {
      totalSurveys,
      completedSurveys,
      startedSurveys: rawSummary.started_surveys || 0,
      inProgressSurveys: rawSummary.in_progress_surveys || 0,
      terminatedSurveys: rawSummary.terminated_surveys || 0,
      completionRate: calculateRate(completedSurveys, totalSurveys),
      avgHandlingTimeSeconds: Math.round(rawSummary.avg_duration_seconds || 0),
      avgHandlingTimeFormatted: formatDuration(rawSummary.avg_duration_seconds || 0),
      totalProductiveTimeSeconds: Number(rawSummary.total_productive_seconds) || 0,
      totalProductiveTimeFormatted: formatDuration(rawSummary.total_productive_seconds || 0),
      surveysPerHour: calculatePerHour(completedSurveys, rawSummary.total_productive_seconds),
      syncComplianceCount: rawSummary.sync_compliant_surveys || 0,
      syncComplianceRate: calculateRate(rawSummary.sync_compliant_surveys, totalSurveys),
      gpsComplianceCount: rawSummary.gps_compliant_surveys || 0,
      gpsComplianceRate: calculateRate(rawSummary.gps_compliant_surveys, totalSurveys),
    };

    return {
      summary,
      timeSeries: timeSeries.map((t) => ({
        timestamp: t.bucket,
        totalSurveys: t.total_surveys,
        completedSurveys: t.completed_surveys,
        completionRate: calculateRate(t.completed_surveys, t.total_surveys),
        avgHandlingTimeSeconds: Math.round(t.aht_seconds || 0),
      })),
      table: {
        rows: tableData.rows,
        total: tableData.total,
        page: pagination.page || 1,
        limit: pagination.limit || 20,
      },
    };
  },

  /**
   * Retrieves CATI Agent Performance Report (CATI APR)
   * @param {object} filters
   * @param {object} pagination
   * @returns {Promise<object>}
   */
  async getCatiAprReport(filters = {}, pagination = {}) {
    const { rows, total, summary: rawSummary } = await reportsModel.getCatiApr(filters, pagination);

    const formattedRows = rows.map((r) => {
      const completed = r.completed_surveys || 0;
      const totalSurveys = r.total_surveys || 0;
      const productiveSeconds = Number(r.productive_time_seconds) || 0;
      const standardShiftSeconds = productiveSeconds > 0 ? Math.max(productiveSeconds, 28800) : 0;
      const idleSeconds = Math.max(0, standardShiftSeconds - productiveSeconds);

      return {
        agentId: r.agent_id,
        agentName: `${r.agent_first_name || ''} ${r.agent_last_name || ''}`.trim() || 'Unknown',
        email: r.agent_email,
        phone: r.agent_phone,
        vendorName: r.vendor_name || 'N/A',
        totalSurveys,
        completedSurveys: completed,
        terminatedSurveys: r.terminated_surveys || 0,
        completionRate: calculateRate(completed, totalSurveys),
        avgHandlingTimeSeconds: Math.round(r.aht_seconds || 0),
        avgHandlingTimeFormatted: formatDuration(r.aht_seconds || 0),
        productiveTimeSeconds: productiveSeconds,
        productiveTimeFormatted: formatDuration(productiveSeconds),
        idleTimeSeconds: idleSeconds,
        idleTimeFormatted: formatDuration(idleSeconds),
        surveysPerHour: calculatePerHour(completed, productiveSeconds),
        syncComplianceCount: r.sync_compliant_count || 0,
        syncComplianceRate: calculateRate(r.sync_compliant_count, totalSurveys),
        gpsComplianceCount: r.gps_compliant_count || 0,
        gpsComplianceRate: calculateRate(r.gps_compliant_count, totalSurveys),
      };
    });

    const totalSurveys = Number(rawSummary.total_surveys) || 0;
    const completedSurveys = Number(rawSummary.completed_surveys) || 0;
    const totalProductiveSeconds = Number(rawSummary.total_productive_seconds) || 0;

    const summary = {
      totalAgents: rawSummary.total_agents || 0,
      totalSurveys,
      completedSurveys,
      overallCompletionRate: calculateRate(completedSurveys, totalSurveys),
      avgHandlingTimeSeconds: Math.round(rawSummary.avg_aht_seconds || 0),
      avgHandlingTimeFormatted: formatDuration(rawSummary.avg_aht_seconds || 0),
      totalProductiveTimeSeconds: totalProductiveSeconds,
      totalProductiveTimeFormatted: formatDuration(totalProductiveSeconds),
      overallSurveysPerHour: calculatePerHour(completedSurveys, totalProductiveSeconds),
      overallSyncComplianceRate: calculateRate(rawSummary.total_sync_compliant, totalSurveys),
      overallGpsComplianceRate: calculateRate(rawSummary.total_gps_compliant, totalSurveys),
    };

    return {
      summary,
      rows: formattedRows,
      pagination: {
        total,
        page: pagination.page || 1,
        limit: pagination.limit || 20,
      },
    };
  },

  // ==========================================
  // 2. CAPI AUDIT REPORT & CAPI APR
  // ==========================================

  /**
   * Retrieves CAPI Audit Production Report
   * @param {object} filters
   * @param {object} pagination
   * @returns {Promise<object>}
   */
  async getCapiProductionReport(filters = {}, pagination = {}) {
    const [rawSummary, tableData] = await Promise.all([
      reportsModel.getCapiProductionSummary(filters),
      reportsModel.getCapiProductionTable(filters, pagination),
    ]);

    const totalAudited = rawSummary.total_audited || 0;
    const completedAudits = rawSummary.completed_audits || 0;
    const passCount = rawSummary.pass_count || 0;
    const failCount = rawSummary.fail_count || 0;
    const totalDuration = Number(rawSummary.total_duration_seconds) || 0;

    const summary = {
      totalAudited,
      completedAudits,
      pendingAudits: rawSummary.pending_audits || 0,
      passCount,
      failCount,
      escalateCount: rawSummary.escalate_count || 0,
      passRate: calculateRate(passCount, completedAudits),
      failRate: calculateRate(failCount, completedAudits),
      mismatchCount: rawSummary.mismatch_count || 0,
      promptingCount: rawSummary.prompting_count || 0,
      notAudibleCount: rawSummary.not_audible_count || 0,
      avgAuditHandlingTimeSeconds: Math.round(rawSummary.avg_audit_handling_time_seconds || 0),
      avgAuditHandlingTimeFormatted: formatDuration(rawSummary.avg_audit_handling_time_seconds || 0),
      totalAuditTimeSeconds: totalDuration,
      totalAuditTimeFormatted: formatDuration(totalDuration),
      auditsPerHour: calculatePerHour(completedAudits, totalDuration),
      avgScore: parseFloat(Number(rawSummary.avg_score || 0).toFixed(2)),
    };

    return {
      summary,
      table: {
        rows: tableData.rows,
        total: tableData.total,
        page: pagination.page || 1,
        limit: pagination.limit || 20,
      },
    };
  },

  /**
   * Retrieves CAPI Auditor Performance Report (CAPI APR)
   * @param {object} filters
   * @param {object} pagination
   * @returns {Promise<object>}
   */
  async getCapiAprReport(filters = {}, pagination = {}) {
    const { rows, total, summary: rawSummary } = await reportsModel.getCapiApr(filters, pagination);

    const formattedRows = rows.map((r) => {
      const completed = r.completed_audits || 0;
      const passed = r.pass_count || 0;
      const failed = r.fail_count || 0;
      const productiveSeconds = Number(r.productive_time_seconds) || 0;

      return {
        auditorId: r.auditor_id,
        auditorName: `${r.auditor_first_name || ''} ${r.auditor_last_name || ''}`.trim() || 'Unknown',
        email: r.auditor_email,
        vendorName: r.vendor_name || 'N/A',
        totalAudited: r.total_audited || 0,
        completedAudits: completed,
        passCount: passed,
        failCount: failed,
        escalateCount: r.escalate_count || 0,
        passRate: calculateRate(passed, completed),
        failRate: calculateRate(failed, completed),
        avgHandlingTimeSeconds: Math.round(r.avg_handling_time_seconds || 0),
        avgHandlingTimeFormatted: formatDuration(r.avg_handling_time_seconds || 0),
        productiveTimeSeconds: productiveSeconds,
        productiveTimeFormatted: formatDuration(productiveSeconds),
        auditsPerHour: calculatePerHour(completed, productiveSeconds),
        avgScore: parseFloat(Number(r.avg_score || 0).toFixed(2)),
      };
    });

    const totalCompleted = Number(rawSummary.total_completed) || 0;
    const totalPassed = Number(rawSummary.total_passed) || 0;
    const totalFailed = Number(rawSummary.total_failed) || 0;

    const summary = {
      totalAuditors: rawSummary.total_auditors || 0,
      totalAudited: Number(rawSummary.total_audited) || 0,
      totalCompleted,
      totalPassed,
      totalFailed,
      overallPassRate: calculateRate(totalPassed, totalCompleted),
      overallFailRate: calculateRate(totalFailed, totalCompleted),
      overallAvgAhtSeconds: Math.round(rawSummary.overall_avg_aht || 0),
      overallAvgScore: parseFloat(Number(rawSummary.overall_avg_score || 0).toFixed(2)),
    };

    return {
      summary,
      rows: formattedRows,
      pagination: {
        total,
        page: pagination.page || 1,
        limit: pagination.limit || 20,
      },
    };
  },

  // ==========================================
  // 3. SUPER AUDIT REPORT & APR
  // ==========================================

  /**
   * Retrieves Super Audit Production Report
   * @param {object} filters
   * @returns {Promise<object>}
   */
  async getSuperAuditProductionReport(filters = {}) {
    const rawSummary = await reportsModel.getSuperAuditProductionSummary(filters);

    const totalSuperAudits = rawSummary.total_super_audits || 0;
    const completedSuperAudits = rawSummary.completed_super_audits || 0;
    const confirmedCount = rawSummary.confirmed_count || 0;
    const overruledCount = rawSummary.overruled_count || 0;
    const escalationCount = rawSummary.escalation_count || 0;
    const fraudSuspectedCount = rawSummary.fraud_suspected_count || 0;

    return {
      summary: {
        totalSuperAudits,
        completedSuperAudits,
        confirmedCount,
        overruledCount,
        confirmRate: calculateRate(confirmedCount, completedSuperAudits),
        overruleRate: calculateRate(overruledCount, completedSuperAudits),
        fraudSuspectedCount,
        fraudSuspectedRate: calculateRate(fraudSuspectedCount, totalSuperAudits),
        escalationCount,
        escalationRate: calculateRate(escalationCount, totalSuperAudits),
        avgVarianceScore: parseFloat(Number(rawSummary.avg_variance_score || 0).toFixed(2)),
        avgSuperAuditScore: parseFloat(Number(rawSummary.avg_super_audit_score || 0).toFixed(2)),
      },
    };
  },

  /**
   * Retrieves Super Audit Auditor Performance Report (Super Audit APR)
   * @param {object} filters
   * @param {object} pagination
   * @returns {Promise<object>}
   */
  async getSuperAuditAprReport(filters = {}, pagination = {}) {
    const { rows, total, summary: rawSummary } = await reportsModel.getSuperAuditApr(filters, pagination);

    const formattedRows = rows.map((r) => {
      const completed = r.completed_reviews || 0;
      const confirmed = r.confirmed_count || 0;
      const overruled = r.overruled_count || 0;

      return {
        superAuditorId: r.super_auditor_id,
        superAuditorName: `${r.super_auditor_first_name || ''} ${r.super_auditor_last_name || ''}`.trim() || 'Unknown',
        email: r.super_auditor_email,
        vendorName: r.vendor_name || 'N/A',
        totalReviews: r.total_reviews || 0,
        completedReviews: completed,
        confirmedCount: confirmed,
        overruledCount: overruled,
        confirmRate: calculateRate(confirmed, completed),
        overruleRate: calculateRate(overruled, completed),
        fraudSuspectedCount: r.fraud_suspected_count || 0,
        escalationCount: r.escalation_count || 0,
        avgVarianceScore: parseFloat(Number(r.avg_variance_score || 0).toFixed(2)),
        avgSuperAuditScore: parseFloat(Number(r.avg_super_audit_score || 0).toFixed(2)),
      };
    });

    const summary = {
      totalSuperAuditors: rawSummary.total_super_auditors || 0,
      totalReviews: Number(rawSummary.total_reviews) || 0,
      totalConfirmed: Number(rawSummary.total_confirmed) || 0,
      totalOverruled: Number(rawSummary.total_overruled) || 0,
      totalFraudSuspected: Number(rawSummary.total_fraud_suspected) || 0,
    };

    return {
      summary,
      rows: formattedRows,
      pagination: {
        total,
        page: pagination.page || 1,
        limit: pagination.limit || 20,
      },
    };
  },

  // ==========================================
  // 4. TVC CPR & APR
  // ==========================================

  /**
   * Retrieves TVC Call Performance Report (CPR / CDR-Style)
   * @param {object} filters
   * @param {object} pagination
   * @returns {Promise<object>}
   */
  async getTvcCprReport(filters = {}, pagination = {}) {
    const [rawSummary, tableData] = await Promise.all([
      reportsModel.getTvcCprSummary(filters),
      reportsModel.getTvcCprTable(filters, pagination),
    ]);

    const leadCount = rawSummary.total_leads || 0;
    const dialAttempts = rawSummary.dial_attempts || 0;
    const connectedCalls = rawSummary.connected_calls || 0;
    const completedTvc = rawSummary.completed_tvc || 0;
    const verifiedLeads = rawSummary.verified_leads || 0;

    const summary = {
      leadCount,
      dialAttempts,
      connectedCalls,
      completedTvc,
      connectRate: calculateRate(connectedCalls, dialAttempts),
      completionRate: calculateRate(completedTvc, leadCount),
      verifiedCount: verifiedLeads,
      verificationRate: calculateRate(verifiedLeads, completedTvc),
      dispositionPendingCount: rawSummary.disposition_pending_count || 0,
      totalRingTimeSeconds: rawSummary.total_ring_time_seconds || 0,
      avgRingTimeSeconds: Math.round(rawSummary.avg_ring_time_seconds || 0),
      avgRingTimeFormatted: formatDuration(rawSummary.avg_ring_time_seconds || 0),
      totalTalkTimeSeconds: rawSummary.total_talk_time_seconds || 0,
      avgTalkTimeSeconds: Math.round(rawSummary.avg_talk_time_seconds || 0),
      avgTalkTimeFormatted: formatDuration(rawSummary.avg_talk_time_seconds || 0),
      avgHandlingTimeSeconds: Math.round(rawSummary.avg_handling_time_seconds || 0),
      avgHandlingTimeFormatted: formatDuration(rawSummary.avg_handling_time_seconds || 0),
    };

    return {
      summary,
      table: {
        rows: tableData.rows,
        total: tableData.total,
        page: pagination.page || 1,
        limit: pagination.limit || 20,
      },
    };
  },

  /**
   * Retrieves TVC Agent Performance Report (TVC APR)
   * @param {object} filters
   * @param {object} pagination
   * @returns {Promise<object>}
   */
  async getTvcAprReport(filters = {}, pagination = {}) {
    const { rows, total, summary: rawSummary } = await reportsModel.getTvcApr(filters, pagination);

    const formattedRows = rows.map((r) => {
      const attempts = r.dial_attempts || 0;
      const connected = r.connected_calls || 0;
      const completed = r.completed_tvc || 0;
      const verified = r.verified_leads || 0;

      return {
        agentId: r.agent_id,
        agentName: `${r.agent_first_name || ''} ${r.agent_last_name || ''}`.trim() || 'Unknown',
        email: r.agent_email,
        vendorName: r.vendor_name || 'N/A',
        leadCount: r.lead_count || 0,
        dialAttempts: attempts,
        connectedCalls: connected,
        connectRate: calculateRate(connected, attempts),
        completedTvc: completed,
        verifiedLeads: verified,
        verificationRate: calculateRate(verified, completed),
        totalRingTimeSeconds: r.total_ring_time_seconds || 0,
        totalTalkTimeSeconds: r.total_talk_time_seconds || 0,
        totalTalkTimeFormatted: formatDuration(r.total_talk_time_seconds || 0),
        avgHandlingTimeSeconds: Math.round(r.avg_handling_time_seconds || 0),
        avgHandlingTimeFormatted: formatDuration(r.avg_handling_time_seconds || 0),
      };
    });

    const summary = {
      totalAgents: rawSummary.total_agents || 0,
      totalDialAttempts: Number(rawSummary.total_dial_attempts) || 0,
      totalConnectedCalls: Number(rawSummary.total_connected_calls) || 0,
      totalVerifiedLeads: Number(rawSummary.total_verified_leads) || 0,
      totalTalkTimeSeconds: Number(rawSummary.total_talk_time_seconds) || 0,
      totalTalkTimeFormatted: formatDuration(rawSummary.total_talk_time_seconds || 0),
    };

    return {
      summary,
      rows: formattedRows,
      pagination: {
        total,
        page: pagination.page || 1,
        limit: pagination.limit || 20,
      },
    };
  },

  // ==========================================
  // 5. FEEDBACK CALLING CDR & APR
  // ==========================================

  /**
   * Retrieves Feedback Calling CDR Report
   * @param {object} filters
   * @returns {Promise<object>}
   */
  async getFaCdrReport(filters = {}) {
    const rawSummary = await reportsModel.getFaCdrSummary(filters);

    const totalLeads = rawSummary.total_feedback_leads || 0;
    const dialAttempts = rawSummary.dial_attempts || 0;
    const connectedCalls = rawSummary.connected_calls || 0;
    const completedFeedback = rawSummary.completed_feedback || 0;
    const mistakeAdmitted = rawSummary.mistake_admitted_count || 0;
    const disputed = rawSummary.disputed_count || 0;

    return {
      summary: {
        totalFeedbackLeads: totalLeads,
        dialAttempts,
        connectedCalls,
        connectRate: calculateRate(connectedCalls, dialAttempts),
        completedFeedback,
        completionRate: calculateRate(completedFeedback, totalLeads),
        agentAdmittedMistakeCount: mistakeAdmitted,
        agentAdmittedMistakeRate: calculateRate(mistakeAdmitted, completedFeedback),
        agentDisputedCount: disputed,
        agentDisputedRate: calculateRate(disputed, completedFeedback),
        endedEarlyCount: rawSummary.ended_early_count || 0,
        pendingCount: rawSummary.pending_count || 0,
        avgHandlingTimeSeconds: Math.round(rawSummary.avg_handling_time_seconds || 0),
        avgHandlingTimeFormatted: formatDuration(rawSummary.avg_handling_time_seconds || 0),
        totalDurationSeconds: rawSummary.total_duration_seconds || 0,
        totalDurationFormatted: formatDuration(rawSummary.total_duration_seconds || 0),
      },
    };
  },

  /**
   * Retrieves Feedback Calling APR Report
   * @param {object} filters
   * @param {object} pagination
   * @returns {Promise<object>}
   */
  async getFaAprReport(filters = {}, pagination = {}) {
    const { rows, total, summary: rawSummary } = await reportsModel.getFaApr(filters, pagination);

    const formattedRows = rows.map((r) => {
      const attempts = r.dial_attempts || 0;
      const connected = r.connected_calls || 0;
      const admitted = r.mistake_admitted_count || 0;
      const disputed = r.disputed_count || 0;

      return {
        callerId: r.caller_id,
        callerName: `${r.caller_first_name || ''} ${r.caller_last_name || ''}`.trim() || 'Unknown',
        email: r.caller_email,
        vendorName: r.vendor_name || 'N/A',
        feedbackLeadsCount: r.feedback_leads_count || 0,
        dialAttempts: attempts,
        connectedCalls: connected,
        connectRate: calculateRate(connected, attempts),
        mistakeAdmittedCount: admitted,
        mistakeAdmittedRate: calculateRate(admitted, connected),
        disputedCount: disputed,
        disputeRate: calculateRate(disputed, connected),
        endedEarlyCount: r.ended_early_count || 0,
        avgHandlingTimeSeconds: Math.round(r.avg_handling_time_seconds || 0),
        avgHandlingTimeFormatted: formatDuration(r.avg_handling_time_seconds || 0),
        totalDurationSeconds: r.total_duration_seconds || 0,
        totalDurationFormatted: formatDuration(r.total_duration_seconds || 0),
      };
    });

    const summary = {
      totalCallers: rawSummary.total_callers || 0,
      totalDialAttempts: Number(rawSummary.total_dial_attempts) || 0,
      totalConnectedCalls: Number(rawSummary.total_connected_calls) || 0,
      totalAdmitted: Number(rawSummary.total_admitted) || 0,
      totalDisputed: Number(rawSummary.total_disputed) || 0,
    };

    return {
      summary,
      rows: formattedRows,
      pagination: {
        total,
        page: pagination.page || 1,
        limit: pagination.limit || 20,
      },
    };
  },

  // ==========================================
  // 6. CROSS-MODULE UNIFIED APR
  // ==========================================

  /**
   * Retrieves Unified Cross-Module Agent Daily Scorecard & APR
   * @param {object} filters
   * @param {object} pagination
   * @returns {Promise<object>}
   */
  async getUnifiedAprReport(filters = {}, pagination = {}) {
    const { rows, total, summary } = await reportsModel.getUnifiedApr(filters, pagination);

    const formattedRows = rows.map((r) => ({
      ...r,
      loginTimeFormatted: formatDuration(r.login_time_seconds),
      productiveTimeFormatted: formatDuration(r.productive_time_seconds),
      idleTimeFormatted: formatDuration(r.idle_time_seconds),
      productivePercentage: calculateRate(r.productive_time_seconds, r.login_time_seconds),
    }));

    return {
      summary,
      rows: formattedRows,
      pagination: {
        total,
        page: pagination.page || 1,
        limit: pagination.limit || 20,
      },
    };
  },

  // ==========================================
  // 7. ON-DEMAND EXCEL & CSV EXPORT
  // ==========================================

  /**
   * Generates formatted XLSX or CSV file buffer for export
   * @param {string} reportType
   * @param {'xlsx'|'csv'} format
   * @param {object} filters
   * @returns {Promise<{ buffer: Buffer, filename: string, contentType: string }>}
   */
  async generateExport(reportType, format = 'xlsx', filters = {}) {
    let dataRows = [];
    let reportTitle = '';
    const exportPagination = { page: 1, limit: 10000, sortBy: 'created_at', sortOrder: 'desc' };

    switch (reportType) {
      case 'cati_production': {
        reportTitle = 'CATI_Production_Report';
        const res = await this.getCatiProductionReport(filters, exportPagination);
        dataRows = (res.table?.rows || []).map((row) => ({
          'Submission ID': row.submission_id,
          Project: row.project_name || row.project_code || 'N/A',
          Vendor: row.vendor_name || 'N/A',
          Agent: `${row.agent_first_name || ''} ${row.agent_last_name || ''}`.trim() || 'N/A',
          'Source Channel': row.source_channel,
          Status: row.source_status,
          'CAPI Status': row.capi_status,
          'Duration (Sec)': row.duration_seconds || 0,
          'Duration (HH:MM:SS)': formatDuration(row.duration_seconds || 0),
          'Sync Status': row.sync_status || (row.is_offline_sync ? 'OFFLINE' : 'ONLINE'),
          'Created At': row.created_at ? dayjs(row.created_at).format('YYYY-MM-DD HH:mm:ss') : 'N/A',
        }));
        break;
      }

      case 'cati_apr': {
        reportTitle = 'CATI_Agent_Performance_Report';
        const res = await this.getCatiAprReport(filters, exportPagination);
        dataRows = (res.rows || []).map((row) => ({
          'Agent Name': row.agentName,
          Email: row.email,
          Vendor: row.vendorName,
          'Total Surveys': row.totalSurveys,
          'Completed Surveys': row.completedSurveys,
          'Terminated Surveys': row.terminatedSurveys,
          'Completion Rate (%)': row.completionRate,
          'AHT (Sec)': row.avgHandlingTimeSeconds,
          'AHT (Formatted)': row.avgHandlingTimeFormatted,
          'Productive Time': row.productiveTimeFormatted,
          'Idle Time': row.idleTimeFormatted,
          'Surveys Per Hour': row.surveysPerHour,
          'Sync Compliance (%)': row.syncComplianceRate,
          'GPS Compliance (%)': row.gpsComplianceRate,
        }));
        break;
      }

      case 'capi_production': {
        reportTitle = 'CAPI_Audit_Production_Report';
        const res = await this.getCapiProductionReport(filters, exportPagination);
        dataRows = (res.table?.rows || []).map((row) => ({
          'Audit ID': row.id,
          'Submission ID': row.business_submission_id,
          Project: row.project_name || 'N/A',
          Vendor: row.vendor_name || 'N/A',
          Auditor: `${row.auditor_first_name || ''} ${row.auditor_last_name || ''}`.trim() || 'N/A',
          Status: row.status,
          Decision: row.decision,
          Score: row.score,
          'Duration (Sec)': row.duration_seconds || 0,
          'Duration (Formatted)': formatDuration(row.duration_seconds || 0),
          'Created At': row.created_at ? dayjs(row.created_at).format('YYYY-MM-DD HH:mm:ss') : 'N/A',
        }));
        break;
      }

      case 'capi_apr': {
        reportTitle = 'CAPI_Auditor_Performance_Report';
        const res = await this.getCapiAprReport(filters, exportPagination);
        dataRows = (res.rows || []).map((row) => ({
          'Auditor Name': row.auditorName,
          Email: row.email,
          Vendor: row.vendorName,
          'Total Audited': row.totalAudited,
          Completed: row.completedAudits,
          Passed: row.passCount,
          Failed: row.failCount,
          Escalated: row.escalateCount,
          'Pass Rate (%)': row.passRate,
          'Fail Rate (%)': row.failRate,
          'AHT (Sec)': row.avgHandlingTimeSeconds,
          'AHT (Formatted)': row.avgHandlingTimeFormatted,
          'Audits Per Hour': row.auditsPerHour,
          'Avg Score': row.avgScore,
        }));
        break;
      }

      case 'super_audit_production':
      case 'super_audit_apr': {
        reportTitle = 'Super_Audit_Performance_Report';
        const res = await this.getSuperAuditAprReport(filters, exportPagination);
        dataRows = (res.rows || []).map((row) => ({
          'Super Auditor': row.superAuditorName,
          Email: row.email,
          Vendor: row.vendorName,
          'Total Reviews': row.totalReviews,
          Completed: row.completedReviews,
          Confirmed: row.confirmedCount,
          Overruled: row.overruledCount,
          'Confirm Rate (%)': row.confirmRate,
          'Overrule Rate (%)': row.overruleRate,
          'Fraud Suspected': row.fraudSuspectedCount,
          Escalated: row.escalationCount,
          'Avg Variance Score': row.avgVarianceScore,
        }));
        break;
      }

      case 'tvc_cpr': {
        reportTitle = 'TVC_Call_Performance_Report';
        const res = await this.getTvcCprReport(filters, exportPagination);
        dataRows = (res.table?.rows || []).map((row) => ({
          'Attempt ID': row.id,
          'Respondent Name': row.respondent_name || 'N/A',
          Phone: row.phone_number || 'N/A',
          'Attempt No': row.attempt_number,
          'Call Status': row.call_status,
          Disposition: row.disposition || 'N/A',
          'Verification Status': row.verification_status,
          Agent: `${row.agent_first_name || ''} ${row.agent_last_name || ''}`.trim() || 'N/A',
          'Ring Time (Sec)': row.ring_time_seconds || 0,
          'Talk Time (Sec)': row.talk_time_seconds || 0,
          'Duration (Sec)': row.duration_seconds || 0,
          'Created At': row.created_at ? dayjs(row.created_at).format('YYYY-MM-DD HH:mm:ss') : 'N/A',
        }));
        break;
      }

      case 'tvc_apr': {
        reportTitle = 'TVC_Agent_Performance_Report';
        const res = await this.getTvcAprReport(filters, exportPagination);
        dataRows = (res.rows || []).map((row) => ({
          'Agent Name': row.agentName,
          Email: row.email,
          Vendor: row.vendorName,
          'Leads Assigned': row.leadCount,
          'Dial Attempts': row.dialAttempts,
          Connected: row.connectedCalls,
          'Connect Rate (%)': row.connectRate,
          'Completed TVC': row.completedTvc,
          'Verified Leads': row.verifiedLeads,
          'Verification Rate (%)': row.verificationRate,
          'Talk Time': row.totalTalkTimeFormatted,
          'AHT (Formatted)': row.avgHandlingTimeFormatted,
        }));
        break;
      }

      case 'fa_cdr':
      case 'fa_apr': {
        reportTitle = 'Feedback_Calling_APR';
        const res = await this.getFaAprReport(filters, exportPagination);
        dataRows = (res.rows || []).map((row) => ({
          'Caller Name': row.callerName,
          Email: row.email,
          Vendor: row.vendorName,
          'Feedback Leads': row.feedbackLeadsCount,
          'Dial Attempts': row.dialAttempts,
          Connected: row.connectedCalls,
          'Connect Rate (%)': row.connectRate,
          'Mistake Admitted': row.mistakeAdmittedCount,
          'Disputed Count': row.disputedCount,
          'Ended Early': row.endedEarlyCount,
          'AHT (Formatted)': row.avgHandlingTimeFormatted,
          'Total Duration': row.totalDurationFormatted,
        }));
        break;
      }

      case 'unified_apr': {
        reportTitle = 'Unified_Agent_Daily_Scorecard';
        const res = await this.getUnifiedAprReport(filters, exportPagination);
        dataRows = (res.rows || []).map((row) => ({
          'Agent Name': row.agent_name,
          Email: row.email,
          Role: row.role_name || 'N/A',
          Vendor: row.vendor_name || 'N/A',
          'Login Time': row.loginTimeFormatted,
          'Productive Time': row.productiveTimeFormatted,
          'Idle Time': row.idleTimeFormatted,
          'Productive (%)': row.productivePercentage,
          'CATI Surveys Done': row.cati_completed_surveys,
          'CAPI Audits Done': row.capi_completed_audits,
          'Super Audits Done': row.super_audits_completed,
          'TVC Calls Done': row.tvc_verifications_completed,
          'FA Feedback Done': row.fa_feedback_completed,
          'Total Work Items': row.total_completed_items,
          'Quality KPI Score (%)': row.quality_kpi_score,
        }));
        break;
      }

      default:
        throw new ValidationError(`Unsupported report export type: ${reportType}`);
    }

    // Default row if empty
    if (dataRows.length === 0) {
      dataRows = [{ 'No Data': 'No records matched the filter criteria' }];
    }

    const timestamp = dayjs().format('YYYYMMDD_HHmmss');
    const ws = XLSX.utils.json_to_sheet(dataRows);

    if (format === 'csv') {
      const csvContent = XLSX.utils.sheet_to_csv(ws);
      const buffer = Buffer.from(csvContent, 'utf-8');
      return {
        buffer,
        filename: `${reportTitle}_${timestamp}.csv`,
        contentType: 'text/csv; charset=utf-8',
      };
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Report Data');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    return {
      buffer,
      filename: `${reportTitle}_${timestamp}.xlsx`,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  },
};

module.exports = reportsService;
