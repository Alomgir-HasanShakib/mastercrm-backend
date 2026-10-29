/**
 * @file clientDb.js
 * @description Connection pool helper and health monitor for the external Client Data Warehouse (e_solutions).
 */

const mysql = require('mysql2/promise');
const config = require('../config');
const logger = require('../utils/logger');

const clientDbConfig = {
  host: config.clientDb.host,
  port: config.clientDb.port,
  user: config.clientDb.user,
  password: config.clientDb.password,
  database: config.clientDb.database,
  waitForConnections: true,
  connectionLimit: config.clientDb.poolMax,
  queueLimit: 0,
  connectTimeout: config.clientDb.connectTimeout,
};

let pool = null;

/**
 * Returns or initializes the client database connection pool.
 * @returns {import('mysql2/promise').Pool}
 */
function getClientDbPool() {
  if (!pool) {
    pool = mysql.createPool(clientDbConfig);
  }
  return pool;
}

/**
 * Verifies connectivity to the external client database.
 * @returns {Promise<{ status: string, latencyMs?: number, error?: string }>}
 */
async function checkClientDbHealth() {
  const start = Date.now();
  try {
    const currentPool = getClientDbPool();
    const [rows] = await currentPool.query('SELECT 1 as ping');
    return {
      status: 'healthy',
      latencyMs: Date.now() - start,
      ping: rows[0]?.ping,
    };
  } catch (error) {
    logger.error('Client DB connection health check failed:', error.message);
    return {
      status: 'unhealthy',
      latencyMs: Date.now() - start,
      error: error.message,
    };
  }
}

/**
 * Closes the client database pool gracefully.
 * @returns {Promise<void>}
 */
async function closeClientDbPool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = {
  clientDbConfig,
  getClientDbPool,
  checkClientDbHealth,
  closeClientDbPool,
};
