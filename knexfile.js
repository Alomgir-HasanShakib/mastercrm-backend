/**
 * @file knexfile.js
 * @description Knex CLI configuration for database migrations and seeds across environments.
 */

require('dotenv').config();

const isSsl = process.env.DB_SSL === 'true';

const connection = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: isSsl ? { rejectUnauthorized: false } : false,
    }
  : {
      host: process.env.DB_HOST || '127.0.0.1',
      port: parseInt(process.env.DB_PORT, 10) || 5432,
      database: process.env.DB_NAME || 'master_crm_dev',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      ssl: isSsl ? { rejectUnauthorized: false } : false,
    };

const baseConfig = {
  client: 'pg',
  connection,
  pool: {
    min: parseInt(process.env.DB_POOL_MIN, 10) || 0,
    max: parseInt(process.env.DB_POOL_MAX, 10) || 10,
  },
  migrations: {
    directory: './src/database/migrations',
    tableName: 'knex_migrations',
  },
  seeds: {
    directory: './src/database/seeds',
  },
};

module.exports = {
  development: {
    ...baseConfig,
    debug: false,
  },

  test: {
    ...baseConfig,
    connection: {
      ...baseConfig.connection,
      database: process.env.DB_TEST_NAME || 'master_crm_test',
    },
    pool: {
      min: 1,
      max: 5,
    },
  },

  production: {
    ...baseConfig,
    connection: {
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT, 10) || 5432,
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    },
    pool: {
      min: parseInt(process.env.DB_POOL_MIN, 10) || 2,
      max: parseInt(process.env.DB_POOL_MAX, 10) || 20,
    },
  },
};
