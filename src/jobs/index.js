/**
 * @file index.js
 * @description Central registry of backend cron and background jobs.
 */

const hourlyCampaignSyncJob = require('./hourlyCampaignSync.job');
const logger = require('../utils/logger');

/**
 * Start all background scheduled jobs.
 */
const startAllJobs = () => {
  logger.info('[JobsManager] Starting scheduled background jobs...');
  hourlyCampaignSyncJob.startHourlySyncJob();
};

/**
 * Stop all background scheduled jobs cleanly.
 */
const stopAllJobs = () => {
  logger.info('[JobsManager] Stopping background jobs...');
  hourlyCampaignSyncJob.stopHourlySyncJob();
};

module.exports = {
  hourlyCampaignSyncJob,
  startAllJobs,
  stopAllJobs,
};
