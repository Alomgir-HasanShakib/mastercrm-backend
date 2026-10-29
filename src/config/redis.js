/**
 * @file redis.js
 * @description Redis connection configuration and ioredis options.
 */

const config = require('./index');

/**
 * ioredis connection options object.
 */
const redisConfig = {
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password || undefined,
  db: config.redis.db,
  keyPrefix: config.redis.keyPrefix,
  maxRetriesPerRequest: null, // Required by BullMQ
  enableReadyCheck: false,
  retryStrategy(times) {
    if (times > 3) {
      // Don't flood logs if local redis is not running
      return null;
    }
    const delay = Math.min(times * 200, 1000);
    return delay;
  },
  reconnectOnError(err) {
    const targetError = 'READONLY';
    if (err.message.includes(targetError)) {
      // Reconnect if read only error
      return true;
    }
    return false;
  },
};

module.exports = redisConfig;
