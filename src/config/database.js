/**
 * @file database.js
 * @description Knex configuration module for different environments.
 */

const path = require('path');
const config = require('./index');

/**
 * Knex configuration object for development, test, and production.
 */
const databaseConfig = {
  development: {
    client: 'pg',
    connection: {
      host: config.db.host,
      port: config.db.port,
      database: config.db.database,
      user: config.db.user,
      password: config.db.password,
      ssl: config.db.ssl ? { rejectUnauthorized: false } : false,
    },
    pool: {
      min: config.db.poolMin,
      max: config.db.poolMax,
      acquireTimeoutMillis: config.db.timeout,
    },
    migrations: {
      directory: path.join(__dirname, '../database/migrations'),
      tableName: 'knex_migrations',
    },
    seeds: {
      directory: path.join(__dirname, '../database/seeds'),
    },
    debug: false,
  },

  test: {
    client: 'pg',
    connection: {
      host: config.db.host,
      port: config.db.port,
      database: process.env.DB_TEST_NAME || 'master_crm_test',
      user: config.db.user,
      password: config.db.password,
    },
    pool: {
      min: 1,
      max: 5,
    },
    migrations: {
      directory: path.join(__dirname, '../database/migrations'),
      tableName: 'knex_migrations',
    },
    seeds: {
      directory: path.join(__dirname, '../database/seeds'),
    },
  },

  production: {
    client: 'pg',
    connection: {
      host: config.db.host,
      port: config.db.port,
      database: config.db.database,
      user: config.db.user,
      password: config.db.password,
      ssl: config.db.ssl ? { rejectUnauthorized: false } : false,
    },
    pool: {
      min: config.db.poolMin,
      max: config.db.poolMax,
      acquireTimeoutMillis: config.db.timeout,
    },
    migrations: {
      directory: path.join(__dirname, '../database/migrations'),
      tableName: 'knex_migrations',
    },
    seeds: {
      directory: path.join(__dirname, '../database/seeds'),
    },
  },
};

module.exports = databaseConfig;
