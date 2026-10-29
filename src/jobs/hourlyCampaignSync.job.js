/**
 * @file hourlyCampaignSync.job.js
 * @description Hourly scheduled cron job running at (0 * * * *) to synchronize client DB records into CRM database.
 * Supports running on scheduled interval, tracking status, and manual immediate pull.
 */

const logger = require('../utils/logger');
const hourlyCampaignSyncService = require('../services/hourlyCampaignSync.service');

const CRON_SCHEDULE = '0 * * * *'; // Top of every hour
let jobTimer = null;
let jobInterval = null;
let isJobRunning = false;
let isJobActive = false;
let lastRunAt = null;
let nextRunAt = null;
let lastRunResult = null;

/**
 * Execute the hourly cycle across all active campaigns.
 *
 * @param {string} [triggeredBy] - Reason for execution
 * @returns {Promise<object>} Summary of sync execution
 */
const runSyncJob = async (triggeredBy = 'HOURLY_CRON') => {
  if (isJobRunning) {
    logger.warn('[HourlySyncJob] Previous sync job execution is still in progress. Skipping iteration.');
    return { skipped: true, reason: 'JOB_ALREADY_IN_PROGRESS' };
  }

  isJobRunning = true;
  lastRunAt = new Date();

  try {
    logger.info(`[HourlySyncJob] Executing hourly sync job (Triggered by: ${triggeredBy})...`);
    const result = await hourlyCampaignSyncService.syncAllActiveCampaigns({ triggeredBy });
    lastRunResult = result;
    return result;
  } catch (err) {
    logger.error(`[HourlySyncJob] Hourly sync job execution failed: ${err.message}`, { error: err.stack });
    lastRunResult = { error: err.message, failedAt: new Date() };
    throw err;
  } finally {
    isJobRunning = false;
  }
};

/**
 * Start the recurring hourly cron job (0 * * * *).
 *
 * @param {boolean} [runImmediately=false] - Run one cycle immediately upon start
 */
const startHourlySyncJob = (runImmediately = false) => {
  if (isJobActive) {
    logger.info('[HourlySyncJob] Hourly sync cron job is already active.');
    return;
  }

  isJobActive = true;
  logger.info(`[HourlySyncJob] Initializing Hourly Campaign Cron Job with schedule "${CRON_SCHEDULE}"...`);

  if (runImmediately) {
    runSyncJob('BOOT_IMMEDIATE').catch((err) => {
      logger.warn(`[HourlySyncJob] Immediate boot run warning: ${err.message}`);
    });
  }

  // Calculate milliseconds until the next exact top of the hour (:00:00.000)
  const now = new Date();
  const nextHour = new Date(now);
  nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0);
  nextRunAt = nextHour;

  const msUntilNextHour = nextHour.getTime() - now.getTime();
  logger.info(`[HourlySyncJob] Scheduled next run at ${nextHour.toISOString()} (in ${Math.round(msUntilNextHour / 1000)}s).`);

  jobTimer = setTimeout(() => {
    runSyncJob('HOURLY_CRON').catch(() => null);

    // Compute subsequent next run
    const computeNext = new Date();
    computeNext.setHours(computeNext.getHours() + 1, 0, 0, 0);
    nextRunAt = computeNext;

    jobInterval = setInterval(() => {
      const future = new Date();
      future.setHours(future.getHours() + 1, 0, 0, 0);
      nextRunAt = future;
      runSyncJob('HOURLY_CRON').catch(() => null);
    }, 60 * 60 * 1000);
  }, msUntilNextHour);
};

/**
 * Stop the recurring hourly cron job cleanly.
 */
const stopHourlySyncJob = () => {
  if (jobTimer) {
    clearTimeout(jobTimer);
    jobTimer = null;
  }
  if (jobInterval) {
    clearInterval(jobInterval);
    jobInterval = null;
  }
  isJobActive = false;
  isJobRunning = false;
  nextRunAt = null;
  logger.info('[HourlySyncJob] Hourly sync cron job stopped.');
};

/**
 * Trigger an immediate manual sync for all campaigns or a single campaign.
 *
 * @param {string} [projectId] - Optional specific campaign ID to sync
 * @param {object} [options]
 * @returns {Promise<object>}
 */
const runManualSyncNow = async (projectId = null, options = {}) => {
  logger.info(`[HourlySyncJob] Manual pull triggered immediately${projectId ? ` for project ${projectId}` : ' for all active campaigns'}...`);
  if (projectId) {
    return hourlyCampaignSyncService.syncCampaignLeads(projectId, {
      ...options,
      triggeredBy: 'MANUAL_TRIGGER',
    });
  }
  return runSyncJob('MANUAL_TRIGGER');
};

/**
 * Get current health and scheduling status of the hourly sync job.
 *
 * @returns {object} Status descriptor
 */
const getJobStatus = () => ({
  schedule: CRON_SCHEDULE,
  isActive: isJobActive,
  isRunning: isJobRunning,
  lastRunAt,
  nextRunAt,
  lastRunResult,
});

module.exports = {
  CRON_SCHEDULE,
  startHourlySyncJob,
  stopHourlySyncJob,
  runSyncJob,
  runManualSyncNow,
  getJobStatus,
};
