/**
 * @file auth.model.js
 * @description Knex database query methods for authentication and refresh tokens with mockStore resilience.
 */

const db = require('../../database/connection');
const { withDbFallback } = db;
const mockStore = require('../../database/mockStore');

/**
 * Finds an active user by email address with role and permissions.
 *
 * @param {string} email - User email address
 * @returns {Promise<object|null>} User database record or null
 */
const findUserByEmail = async (email) => {
  return withDbFallback(
    async () => {
      const user = await db('users')
        .leftJoin('roles', 'users.role_id', 'roles.id')
        .select(
          'users.*',
          'roles.name as role_name',
          'roles.slug as role_slug',
          'roles.slug as role',
          'roles.permissions as role_permissions'
        )
        .whereRaw('LOWER(users.email) = ?', [email.toLowerCase()])
        .whereNull('users.deleted_at')
        .first();

      return user || null;
    },
    () => mockStore.findUserByEmail(email)
  );
};

/**
 * Finds a user by primary ID with role, organization, and vendor details.
 *
 * @param {string|number} id - User primary ID
 * @returns {Promise<object|null>} User record with relations or null
 */
const findUserById = async (id) => {
  return withDbFallback(
    async () => {
      const user = await db('users')
        .leftJoin('roles', 'users.role_id', 'roles.id')
        .leftJoin('vendors', 'users.vendor_id', 'vendors.id')
        .select(
          'users.*',
          'roles.name as role_name',
          'roles.slug as role_slug',
          'roles.slug as role',
          'roles.permissions as role_permissions',
          'vendors.name as vendor_name',
          'vendors.code as vendor_code'
        )
        .where('users.id', id)
        .whereNull('users.deleted_at')
        .first();

      return user || null;
    },
    () => mockStore.findUserById(id)
  );
};

/**
 * Updates last login timestamp for a user.
 *
 * @param {string|number} userId - User ID
 * @returns {Promise<number>} Number of affected rows
 */
const updateLastLogin = async (userId) => {
  return withDbFallback(
    async () => {
      return db('users')
        .where('id', userId)
        .update({
          last_login_at: new Date(),
          updated_at: new Date(),
        });
    },
    () => {
      mockStore.update('users', userId, { last_login_at: new Date() });
      return 1;
    }
  );
};

/**
 * Persists a new refresh token record in the database.
 *
 * @param {string|number} userId - User ID owner of token
 * @param {string} tokenHash - Hashed refresh token string
 * @param {Date|string} expiresAt - Expiration timestamp
 * @returns {Promise<object>} Created refresh token record
 */
const createRefreshToken = async (userId, tokenHash, expiresAt) => {
  return withDbFallback(
    async () => {
      const [tokenRecord] = await db('refresh_tokens')
        .insert({
          user_id: userId,
          token_hash: tokenHash,
          expires_at: expiresAt,
          created_at: new Date(),
          updated_at: new Date(),
        })
        .returning('*');

      return tokenRecord;
    },
    () =>
      mockStore.insert('refresh_tokens', {
        user_id: userId,
        token_hash: tokenHash,
        expires_at: expiresAt,
      })
  );
};

/**
 * Finds a refresh token record by token hash.
 *
 * @param {string} tokenHash - Hashed token string
 * @returns {Promise<object|null>} Refresh token record or null
 */
const findRefreshToken = async (tokenHash) => {
  return withDbFallback(
    async () => {
      const tokenRecord = await db('refresh_tokens')
        .where('token_hash', tokenHash)
        .first();

      return tokenRecord || null;
    },
    () => mockStore.findOne('refresh_tokens', { token_hash: tokenHash })
  );
};

/**
 * Deletes a single refresh token record by ID.
 *
 * @param {string|number} id - Refresh token record ID
 * @returns {Promise<number>} Count of deleted records
 */
const deleteRefreshToken = async (id) => {
  return withDbFallback(
    async () => {
      return db('refresh_tokens')
        .where('id', id)
        .del();
    },
    () => mockStore.delete('refresh_tokens', id)
  );
};

/**
 * Deletes all refresh tokens belonging to a user (used on logout-all or password change).
 *
 * @param {string|number} userId - User ID
 * @returns {Promise<number>} Count of deleted records
 */
const deleteAllUserRefreshTokens = async (userId) => {
  return withDbFallback(
    async () => {
      return db('refresh_tokens')
        .where('user_id', userId)
        .del();
    },
    () => {
      const initial = mockStore.count('refresh_tokens', { user_id: userId });
      mockStore.data.refresh_tokens = mockStore.data.refresh_tokens.filter((t) => t.user_id !== userId);
      return initial;
    }
  );
};

/**
 * Updates a user's password hash in the database.
 *
 * @param {string|number} userId - User ID
 * @param {string} passwordHash - New bcrypt password hash
 * @returns {Promise<number>} Number of updated rows
 */
const updatePassword = async (userId, passwordHash) => {
  return withDbFallback(
    async () => {
      return db('users')
        .where('id', userId)
        .update({
          password_hash: passwordHash,
          updated_at: new Date(),
        });
    },
    () => {
      mockStore.update('users', userId, { password_hash: passwordHash });
      return 1;
    }
  );
};

/**
 * Finds project assignments for a user.
 *
 * @param {string|number} userId - User ID
 * @returns {Promise<Array<object>>} List of project assignment records
 */
const findUserAssignments = async (userId) => {
  return withDbFallback(
    async () => {
      return db('user_project_assignments')
        .leftJoin('projects', 'user_project_assignments.project_id', 'projects.id')
        .select(
          'user_project_assignments.*',
          'projects.name as project_name',
          'projects.code as project_code',
          'projects.status as project_status'
        )
        .where('user_project_assignments.user_id', userId);
    },
    () => {
      const items = mockStore.find('user_project_assignments', { user_id: userId });
      return items.map((a) => {
        const proj = mockStore.findById('projects', a.project_id) || {};
        return {
          ...a,
          project_name: proj.name,
          project_code: proj.project_code || proj.code,
          project_status: proj.status,
        };
      });
    }
  );
};

module.exports = {
  findUserByEmail,
  findUserById,
  updateLastLogin,
  createRefreshToken,
  findRefreshToken,
  deleteRefreshToken,
  deleteAllUserRefreshTokens,
  updatePassword,
  findUserAssignments,
};
