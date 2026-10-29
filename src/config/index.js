/**
 * @file index.js
 * @description Centralized configuration loader for the Master CRM application.
 */

const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from .env file in backend directory
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

const config = {
  app: {
    env: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT, 10) || 5000,
    name: process.env.APP_NAME || 'Master CRM Backend',
    apiPrefix: process.env.API_PREFIX || '/api/v1',
    url: process.env.APP_URL || 'http://localhost:5000',
    clientUrl: process.env.CLIENT_URL || 'http://localhost:3000',
  },

  cors: {
    origin: process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',').map((origin) => origin.trim())
      : ['http://localhost:3000', 'http://127.0.0.1:3000'],
    credentials: process.env.CORS_CREDENTIALS === 'true',
  },

  db: {
    connectionString: process.env.DATABASE_URL || null,
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    database: process.env.DB_NAME || 'master_crm_dev',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    poolMin: parseInt(process.env.DB_POOL_MIN, 10) || 0,
    poolMax: parseInt(process.env.DB_POOL_MAX, 10) || 20,
    timeout: parseInt(process.env.DB_TIMEOUT, 10) || 60000,
    ssl: process.env.DB_SSL !== undefined
      ? process.env.DB_SSL === 'true'
      : !!(process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('localhost') && !process.env.DATABASE_URL.includes('127.0.0.1')),
  },

  clientDb: {
    host: process.env.CLIENT_DB_HOST || process.env.CLIENT_MYSQL_HOST || '127.0.0.1',
    port: parseInt(process.env.CLIENT_DB_PORT || process.env.CLIENT_MYSQL_PORT, 10) || 3306,
    user: process.env.CLIENT_DB_USER || process.env.CLIENT_MYSQL_USER || 'root',
    password: process.env.CLIENT_DB_PASSWORD || process.env.CLIENT_MYSQL_PASSWORD || '',
    database: process.env.CLIENT_DB_NAME || process.env.CLIENT_MYSQL_DATABASE || 'client_crm',
    poolMax: parseInt(process.env.CLIENT_DB_POOL_MAX, 10) || 10,
    connectTimeout: 10000,
  },

  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD || null,
    db: parseInt(process.env.REDIS_DB, 10) || 0,
    keyPrefix: process.env.REDIS_KEY_PREFIX || 'master_crm:',
  },

  jwt: {
    secret: process.env.JWT_SECRET || process.env.JWT_ACCESS_SECRET || 'master_crm_dev_access_secret_key_123456',
    expiresIn: process.env.JWT_EXPIRES_IN || process.env.JWT_ACCESS_EXPIRATION || '24h',
    accessSecret: process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || 'master_crm_dev_access_secret_key_123456',
    accessExpiration: process.env.JWT_ACCESS_EXPIRATION || process.env.JWT_EXPIRES_IN || '24h',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'master_crm_dev_refresh_secret_key_123456',
    refreshExpiration: process.env.JWT_REFRESH_EXPIRATION || '30d',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || process.env.JWT_REFRESH_EXPIRATION || '30d',
  },

  storage: {
    uploadDir: process.env.UPLOAD_DESTINATION || 'uploads/',
    maxFileSize: (parseInt(process.env.MAX_FILE_SIZE_MB, 10) || 25) * 1024 * 1024,
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 5000,
    authMax: parseInt(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS, 10) || 20,
  },

  logger: {
    level: process.env.LOG_LEVEL || 'debug',
    fileEnabled: process.env.LOG_FILE_ENABLED !== 'false',
    dir: process.env.LOG_DIR || 'logs',
  },

  crypto: {
    encryptionKey: process.env.DATA_ENCRYPTION_KEY || '12345678901234567890123456789012',
  },
};

module.exports = config;
