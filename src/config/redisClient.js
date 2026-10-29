/**
 * @file redisClient.js
 * @description Redis client initialization and lifecycle management using ioredis.
 */

const Redis = require('ioredis');
const redisConfig = require('./redis');
const logger = require('../utils/logger');

let redisClient = null;

/**
 * Initializes and returns the Redis client instance.
 *
 * @returns {Redis} ioredis instance
 */
const initRedis = () => {
  if (redisClient) {
    return redisClient;
  }

  redisClient = new Redis(redisConfig);

  redisClient.on('connect', () => {
    logger.info('Redis client connected successfully.');
  });

  redisClient.on('ready', () => {
    logger.info('Redis client ready to accept commands.');
  });

  redisClient.on('error', (err) => {
    logger.error('Redis client error:', { error: err.message });
  });

  redisClient.on('close', () => {
    logger.warn('Redis connection closed.');
  });

  return redisClient;
};

/**
 * Returns the active Redis client or initializes one.
 *
 * @returns {Redis}
 */
const getRedisClient = () => {
  if (!redisClient) {
    return initRedis();
  }
  return redisClient;
};

/**
 * Health check function for Redis.
 *
 * @returns {Promise<{ status: string, latencyMs: number }>}
 */
const checkRedisHealth = async () => {
  const start = Date.now();
  try {
    const client = getRedisClient();
    const pong = await client.ping();
    const latencyMs = Date.now() - start;
    return {
      status: pong === 'PONG' ? 'healthy' : 'degraded',
      latencyMs,
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message,
      latencyMs: Date.now() - start,
    };
  }
};

/**
 * Gracefully disconnects the Redis client.
 *
 * @returns {Promise<void>}
 */
const closeRedis = async () => {
  if (redisClient) {
    try {
      await redisClient.quit();
      logger.info('Redis connection closed gracefully.');
    } catch (err) {
      logger.error('Error closing Redis connection:', { error: err.message });
    }
  }
};

module.exports = {
  initRedis,
  getRedisClient,
  checkRedisHealth,
  closeRedis,
};
