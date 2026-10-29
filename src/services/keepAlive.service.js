/**
 * @file keepAlive.service.js
 * @description Automated self-ping service designed for Render/free-tier cloud hosts.
 * Randomly pings the application's public health endpoint every 7 to 12 minutes (well before
 * Render's 15-minute inactivity idle spin-down timer) to keep the instance warm and 24/7 responsive.
 */

const logger = require('../utils/logger');
const config = require('../config');

let timerId = null;
let isRunning = false;

/**
 * Returns a randomized interval in milliseconds between min and max minutes
 * @param {number} minMinutes - Minimum minutes
 * @param {number} maxMinutes - Maximum minutes
 * @returns {number} Delay in milliseconds
 */
function getRandomIntervalMs(minMinutes = 7, maxMinutes = 11) {
  const minMs = minMinutes * 60 * 1000;
  const maxMs = maxMinutes * 60 * 1000;
  return Math.floor(minMs + Math.random() * (maxMs - minMs));
}

/**
 * Resolves the target URL to ping
 * Prioritizes:
 * 1. KEEP_ALIVE_URL
 * 2. RENDER_EXTERNAL_URL (Render automatically injects this e.g. https://service-name.onrender.com)
 * 3. APP_URL (if it is not localhost)
 */
function resolveTargetUrl() {
  if (process.env.KEEP_ALIVE_URL) {
    return process.env.KEEP_ALIVE_URL.replace(/\/+$/, '');
  }

  if (process.env.RENDER_EXTERNAL_URL) {
    return process.env.RENDER_EXTERNAL_URL.replace(/\/+$/, '');
  }

  if (config.app.url && !config.app.url.includes('localhost') && !config.app.url.includes('127.0.0.1')) {
    return config.app.url.replace(/\/+$/, '');
  }

  return null;
}

/**
 * Executes a single ping to the health endpoint
 */
async function pingService() {
  const targetBaseUrl = resolveTargetUrl();

  if (!targetBaseUrl) {
    // If running strictly locally on localhost, no need to send external keep-alive
    return;
  }

  const healthUrl = `${targetBaseUrl}/health`;
  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(healthUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Render-KeepAlive-Bot/1.0',
        'x-keep-alive-ping': 'true',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const durationMs = Date.now() - startTime;

    if (response.ok) {
      logger.info(`[KeepAlive] 🟢 Health check succeeded (${response.status}) in ${durationMs}ms: ${healthUrl}`);
    } else {
      logger.warn(`[KeepAlive] ⚠️ Health check returned status ${response.status} in ${durationMs}ms: ${healthUrl}`);
    }
  } catch (error) {
    logger.warn(`[KeepAlive] 🔴 Health ping failed: ${error.message} (${healthUrl})`);
  }
}

/**
 * Schedules the next ping with a randomized delay
 */
function scheduleNextPing() {
  if (!isRunning) return;

  const delayMs = getRandomIntervalMs(7, 11);
  const minutes = (delayMs / 60000).toFixed(1);

  timerId = setTimeout(async () => {
    try {
      await pingService();
    } finally {
      scheduleNextPing();
    }
  }, delayMs);

  if (typeof timerId.unref === 'function') {
    timerId.unref();
  }

  logger.debug(`[KeepAlive] Next self-ping scheduled in ${minutes} minutes.`);
}

/**
 * Starts the Keep-Alive background worker
 */
function startKeepAliveService() {
  if (isRunning) return;

  // Enabled by default in production or when KEEP_ALIVE_URL / RENDER_EXTERNAL_URL is set
  const isExplicitlyDisabled = process.env.KEEP_ALIVE_ENABLED === 'false';
  if (isExplicitlyDisabled) {
    logger.info('[KeepAlive] Keep-Alive service is disabled via KEEP_ALIVE_ENABLED=false.');
    return;
  }

  const targetUrl = resolveTargetUrl();
  isRunning = true;

  if (targetUrl) {
    logger.info(`[KeepAlive] 🚀 Keep-Alive service initialized for ${targetUrl} (Random interval: 7-11 mins).`);
    // Initial warmup ping after 30 seconds
    setTimeout(() => {
      pingService().catch(() => {});
      scheduleNextPing();
    }, 30000);
  } else {
    logger.info('[KeepAlive] Running on local environment without public URL. Keep-alive on standby.');
  }
}

/**
 * Stops the Keep-Alive service
 */
function stopKeepAliveService() {
  if (!isRunning) return;
  isRunning = false;
  if (timerId) {
    clearTimeout(timerId);
    timerId = null;
  }
  logger.info('[KeepAlive] Keep-Alive service stopped.');
}

module.exports = {
  startKeepAliveService,
  stopKeepAliveService,
  pingService,
};
