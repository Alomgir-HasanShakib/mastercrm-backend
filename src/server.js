/**
 * @file server.js
 * @description Application entry point: initializes database, Redis, starts HTTP server and binds graceful shutdown handlers.
 */

require('dotenv').config();

const http = require('http');
const app = require('./app');
const config = require('./config');
const logger = require('./utils/logger');
const { db, checkDatabaseHealth, closeDatabase } = require('./database/connection');
const { initRedis, checkRedisHealth, closeRedis } = require('./config/redisClient');
const { initSocketServer, closeSocketServer } = require('./modules/realtime');
const { startSyncWorker, stopSyncWorker } = require('./modules/client-db/clientDbSync.service');
const { startHourlyCampaignSyncScheduler, stopHourlyCampaignSyncScheduler } = require('./services/hourlyCampaignSync.service');
const { startAllJobs, stopAllJobs } = require('./jobs');
const { startKeepAliveService, stopKeepAliveService } = require('./services/keepAlive.service');

const server = http.createServer(app);

initSocketServer(server);

/**
 * Initializes external connections and starts HTTP listener.
 */
async function startServer() {
  try {
    logger.info('Initializing Master CRM Server...');

    // 1. Verify Database Connection
    logger.info(`Connecting to PostgreSQL database at ${config.db.host}:${config.db.port}/${config.db.database}...`);
    const dbHealth = await checkDatabaseHealth();
    if (dbHealth.status === 'healthy') {
      logger.info(`PostgreSQL database connected successfully (latency: ${dbHealth.latencyMs}ms).`);
    } else {
      logger.warn(`PostgreSQL connection check reported: ${dbHealth.error || 'unhealthy'}. Server will still boot.`);
    }

    // 2. Initialize Redis (BullMQ / Caching)
    logger.info(`Initializing Redis client at ${config.redis.host}:${config.redis.port}...`);
    initRedis();
    const redisHealth = await checkRedisHealth();
    if (redisHealth.status === 'healthy') {
      logger.info(`Redis connected successfully (latency: ${redisHealth.latencyMs}ms).`);
    } else {
      logger.warn(`Redis connection check reported: ${redisHealth.error || 'degraded'}. Operating with degraded queue support.`);
    }

    // 3. Start Listening
    server.listen(config.app.port, () => {
      logger.info('====================================================');
      logger.info(`🚀 ${config.app.name} is running!`);
      logger.info(`🌐 Environment : ${config.app.env}`);
      logger.info(`🚪 Port        : ${config.app.port}`);
      logger.info(`📍 Base URL    : ${config.app.url}`);
      logger.info(`🔗 API Prefix  : ${config.app.apiPrefix}`);
      logger.info(`🩺 Health Check: ${config.app.url}/health`);
      logger.info('====================================================');

      // 4. Start Client DB Continuous Sync Engine
      startSyncWorker();

      // 5. Start Hourly Campaign Auto-Pull Sync Scheduler & Cron Jobs (0 * * * *)
      startHourlyCampaignSyncScheduler();
      startAllJobs();

      // 6. Start Render/Cloud Keep-Alive Auto-Ping Service (Keeps free server awake 24/7)
      startKeepAliveService();
    });

  } catch (error) {
    logger.error('Fatal error during application startup:', { error: error.message, stack: error.stack });
    process.exit(1);
  }
}

/**
 * Handles graceful shutdown for SIGTERM and SIGINT.
 *
 * @param {string} signal - Received OS signal
 */
async function handleGracefulShutdown(signal) {
  logger.info(`Received ${signal}. Commencing graceful shutdown...`);

  server.close(async () => {
    logger.info('HTTP server closed. Terminating active connections...');

    try {
      stopSyncWorker();
      stopHourlyCampaignSyncScheduler();
      stopAllJobs();
      stopKeepAliveService();
      if (typeof stopSuperAuditWorker === 'function') stopSuperAuditWorker();
      await closeSocketServer();
      await closeDatabase();
      await closeRedis();
      logger.info('Graceful shutdown completed successfully. Process exiting.');

      process.exit(0);
    } catch (err) {
      logger.error('Error during graceful shutdown:', { error: err.message });
      process.exit(1);
    }
  });

  // Force shutdown after timeout if pending connections hang
  setTimeout(() => {
    logger.error('Graceful shutdown timed out after 10s. Forcing exit.');
    process.exit(1);
  }, 10000).unref();
}

// OS Signal Listeners
process.on('SIGTERM', () => handleGracefulShutdown('SIGTERM'));
process.on('SIGINT', () => handleGracefulShutdown('SIGINT'));

// Uncaught Exception and Unhandled Rejection Listeners
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', { error: err.message, stack: err.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection:', { reason, promise });
});

// Boot application
startServer();

module.exports = server;
