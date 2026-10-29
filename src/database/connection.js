/**
 * @file connection.js
 * @description Knex PostgreSQL database connection configuration, health monitoring, and resilient fallback exports.
 */

const knex = require('knex');
const path = require('path');
const config = require('../config');

const environment = config.app.env || 'development';
const isDev = environment === 'development';

const connectionConfig = config.db.connectionString
  ? {
      connectionString: config.db.connectionString,
      ssl: config.db.ssl ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: 10000,
    }
  : {
      host: config.db.host,
      port: config.db.port,
      database: config.db.database,
      user: config.db.user,
      password: config.db.password,
      ssl: config.db.ssl ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: isDev ? 1500 : 5000,
    };

const dbConfig = {
  client: 'pg',
  connection: connectionConfig,
  pool: {
    min: config.db.poolMin || 0,
    max: config.db.poolMax || 10,
    acquireTimeoutMillis: config.db.timeout || 60000,
  },
  migrations: {
    directory: path.resolve(__dirname, './migrations'),
    tableName: 'knex_migrations',
  },
  seeds: {
    directory: path.resolve(__dirname, './seeds'),
  },
};

/**
 * Knex database connection instance
 * @type {import('knex').Knex}
 */
const db = knex(dbConfig);

let _isDbHealthy = false;
let _hasCheckedDb = false;

/**
 * Checks health of PostgreSQL connection.
 * @returns {Promise<{ status: string, latencyMs?: number, error?: string }>}
 */
async function checkDatabaseHealth() {
  const startTime = Date.now();
  try {
    await db.raw('SELECT 1');
    _isDbHealthy = true;
    _hasCheckedDb = true;
    return {
      status: 'healthy',
      latencyMs: Date.now() - startTime,
    };
  } catch (error) {
    _isDbHealthy = false;
    _hasCheckedDb = true;
    return {
      status: 'unhealthy',
      latencyMs: Date.now() - startTime,
      error: error.message,
    };
  }
}

/**
 * Automatically applies pending migrations and seeds default admin if the database is uninitialized
 */
async function ensureDatabaseSchema() {
  if (!_isDbHealthy) {
    return false;
  }
  try {
    const hasOrgTable = await db.schema.hasTable('organizations');
    if (!hasOrgTable) {
      console.log('[Database] Schema uninitialized. Automatically running Knex migrations...');
      await db.migrate.latest({
        directory: path.resolve(__dirname, './migrations'),
      });
      console.log('[Database] Migrations applied successfully. Seeding default roles & super admin...');
      await db.seed.run({
        directory: path.resolve(__dirname, './seeds'),
      });
      console.log('[Database] Master Super Admin seeded successfully: admin@mastercrm.com / Password123!');
      return true;
    } else {
      // Run any pending incremental migrations
      await db.migrate.latest({
        directory: path.resolve(__dirname, './migrations'),
      });
    }

    // Ensure ORGANIZATION_ADMIN role exists and fix any users incorrectly marked as CLIENT_ADMIN
    const hasRolesTable = await db.schema.hasTable('roles');
    if (hasRolesTable) {
      let orgAdminRole = await db('roles').where('slug', 'ORGANIZATION_ADMIN').first();
      if (!orgAdminRole) {
        const { randomUUID } = require('crypto');
        const [inserted] = await db('roles')
          .insert({
            id: randomUUID(),
            name: 'Organization Administrator',
            slug: 'ORGANIZATION_ADMIN',
            display_name: 'Organization Admin',
            description: 'Tenant Organization Administrator managing organization vendors, users, campaigns, and operations.',
            is_system: true,
            permissions: JSON.stringify([
              'tenancy:*',
              'organizations:read',
              'clients:*',
              'vendors:*',
              'projects:*',
              'users:*',
              'questionnaires:*',
              'submissions:*',
              'capi:*',
              'super_audit:*',
              'tvc:*',
              'fa:*',
              'reports:*',
              'audit_logs:read',
            ]),
            created_at: new Date(),
            updated_at: new Date(),
          })
          .returning('*');
        orgAdminRole = inserted;
        console.log('[Database] Verified and provisioned ORGANIZATION_ADMIN role.');
      }

      // Auto-migrate any existing organization administrators who were created as CLIENT_ADMIN
      const clientAdminRole = await db('roles').where('slug', 'CLIENT_ADMIN').first();
      if (orgAdminRole && clientAdminRole) {
        const fixedUsersCount = await db('users')
          .where('role_id', clientAdminRole.id)
          .whereNotNull('organization_id')
          .whereNull('vendor_id')
          .update({
            role_id: orgAdminRole.id,
            updated_at: new Date(),
          });
        if (fixedUsersCount > 0) {
          console.log(`[Database] Auto-migrated ${fixedUsersCount} organization admin user(s) from CLIENT_ADMIN to ORGANIZATION_ADMIN.`);
        }
      }
    }

    return true;
  } catch (err) {
    console.warn('[Database] Auto-migration check notice:', err.message);
    return false;
  }
}

/**
 * Returns whether the PostgreSQL database is currently verified as healthy.
 * @returns {boolean}
 */
function isDbHealthy() {
  return _isDbHealthy;
}

/**
 * Marks database health status as unhealthy.
 * @param {Error|string} [error]
 */
function markDbUnhealthy(error) {
  _isDbHealthy = false;
  _hasCheckedDb = true;
}

/**
 * Marks database health status as healthy.
 */
function markDbHealthy() {
  _isDbHealthy = true;
  _hasCheckedDb = true;
}

/**
 * Helper to execute a database query with automatic fallback to mockStore
 * if DB is not reachable or throws an error.
 *
 * @template T
 * @param {() => Promise<T>} dbAction
 * @param {() => Promise<T>|T} mockAction
 * @returns {Promise<T>}
 */
async function withDbFallback(dbAction, mockAction) {
  if (!_hasCheckedDb) {
    await checkDatabaseHealth();
  }
  if (_isDbHealthy) {
    try {
      const result = await dbAction();
      if (result !== undefined && result !== null) {
        return result;
      }
      if (typeof mockAction === 'function') {
        const mockResult = await mockAction();
        return mockResult !== undefined && mockResult !== null ? mockResult : result;
      }
      return result;
    } catch (err) {
      console.warn('Database action error, falling back to mockStore:', err.message);
      return typeof mockAction === 'function' ? await mockAction() : mockAction;
    }
  }
  return typeof mockAction === 'function' ? await mockAction() : mockAction;
}

/**
 * Gracefully terminates the Knex connection pool.
 * @returns {Promise<void>}
 */
async function closeDatabase() {
  try {
    await db.destroy();
  } catch (_) {
    // Ignore pool teardown errors on shutdown
  }
}

// Bind helpers directly onto db object for backward compatibility
db.db = db;
db.checkDatabaseHealth = checkDatabaseHealth;
db.closeDatabase = closeDatabase;
db.isDbHealthy = isDbHealthy;
db.markDbUnhealthy = markDbUnhealthy;
db.markDbHealthy = markDbHealthy;
db.withDbFallback = withDbFallback;

db.ensureDatabaseSchema = ensureDatabaseSchema;

module.exports = db;
module.exports.db = db;
module.exports.checkDatabaseHealth = checkDatabaseHealth;
module.exports.ensureDatabaseSchema = ensureDatabaseSchema;
module.exports.closeDatabase = closeDatabase;
module.exports.isDbHealthy = isDbHealthy;
module.exports.markDbUnhealthy = markDbUnhealthy;
module.exports.markDbHealthy = markDbHealthy;
module.exports.withDbFallback = withDbFallback;
