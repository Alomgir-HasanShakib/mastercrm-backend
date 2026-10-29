/**
 * @file users.model.js
 * @description Knex database query methods for user management and assignments with mockStore resilience.
 */

const db = require('../../database/connection');
const { withDbFallback } = db;
const mockStore = require('../../database/mockStore');

/**
 * Builds base Knex query with joins and filtering conditions.
 *
 * @param {object} filters - Filter criteria
 * @returns {import('knex').Knex.QueryBuilder}
 */
const buildUserFilterQuery = (filters = {}) => {
  let query = db('users')
    .leftJoin('roles', 'users.role_id', 'roles.id')
    .leftJoin('vendors', 'users.vendor_id', 'vendors.id')
    .whereNull('users.deleted_at');

  if (filters.organizationId) {
    query = query.where('users.organization_id', filters.organizationId);
  }

  if (filters.roleId) {
    query = query.where('users.role_id', filters.roleId);
  }

  if (filters.vendorId) {
    query = query.where('users.vendor_id', filters.vendorId);
  }

  if (filters.status) {
    query = query.where('users.status', filters.status);
  }

  if (filters.projectId) {
    query = query.whereExists(function () {
      this.select(1)
        .from('user_project_assignments')
        .whereRaw('user_project_assignments.user_id = users.id')
        .andWhere('user_project_assignments.project_id', filters.projectId);
    });
  }

  if (filters.search) {
    const term = `%${filters.search.toLowerCase()}%`;
    query = query.where((builder) => {
      builder
        .whereRaw('LOWER(users.email) LIKE ?', [term])
        .orWhereRaw('LOWER(users.first_name) LIKE ?', [term])
        .orWhereRaw('LOWER(users.last_name) LIKE ?', [term])
        .orWhereRaw('users.phone LIKE ?', [`%${filters.search}%`]);
    });
  }

  return query;
};

/**
 * Retrieves a paginated list of users matching query filters.
 *
 * @param {object} filters - Filtering criteria
 * @param {object} pagination - Pagination parameters
 * @returns {Promise<Array<object>>} List of user records
 */
const findAll = async (filters = {}, pagination = {}) => {
  return withDbFallback(
    async () => {
      const { limit = 20, offset = 0, sortBy = 'created_at', sortOrder = 'desc' } = pagination;

      const validSortColumns = {
        created_at: 'users.created_at',
        email: 'users.email',
        first_name: 'users.first_name',
        last_name: 'users.last_name',
        status: 'users.status',
        id: 'users.id',
      };

      const sortColumn = validSortColumns[sortBy] || 'users.created_at';
      const query = buildUserFilterQuery(filters);

      return query
        .select(
          'users.id',
          'users.email',
          'users.first_name',
          'users.last_name',
          'users.phone',
          'users.status',
          'users.role_id',
          'users.vendor_id',
          'users.organization_id',
          'users.validity_start',
          'users.validity_end',
          'users.is_lifetime',
          'users.voice_kyc_status',
          'users.user_code',
          'users.language',
          'users.last_login_at',
          'users.created_at',
          'users.updated_at',
          'roles.name as role_name',
          'roles.slug as role_slug',
          'roles.name as role_display_name',
          'vendors.name as vendor_name',
          'vendors.code as vendor_code'
        )
        .orderBy(sortColumn, sortOrder.toLowerCase())
        .limit(limit)
        .offset(offset);
    },
    () => mockStore.getUsersList(filters, pagination)
  );
};

/**
 * Counts the total number of users matching filter criteria.
 *
 * @param {object} filters - Filtering options
 * @returns {Promise<number>} Total count
 */
const count = async (filters = {}) => {
  return withDbFallback(
    async () => {
      const query = buildUserFilterQuery(filters);
      const result = await query.count('users.id as total').first();
      return result ? parseInt(result.total, 10) : 0;
    },
    () => mockStore.count('users', filters)
  );
};

/**
 * Finds a single user by primary ID with role and vendor details.
 *
 * @param {string|number} id - User primary ID
 * @param {string|number} [organizationId] - Optional tenant organization ID filter
 * @returns {Promise<object|null>} User record or null
 */
const findById = async (id, organizationId = null) => {
  return withDbFallback(
    async () => {
      let query = db('users')
        .leftJoin('roles', 'users.role_id', 'roles.id')
        .leftJoin('vendors', 'users.vendor_id', 'vendors.id')
        .select(
          'users.id',
          'users.email',
          'users.first_name',
          'users.last_name',
          'users.phone',
          'users.status',
          'users.role_id',
          'users.vendor_id',
          'users.organization_id',
          'users.validity_start',
          'users.validity_end',
          'users.is_lifetime',
          'users.voice_kyc_status',
          'users.user_code',
          'users.language',
          'users.last_login_at',
          'users.created_at',
          'users.updated_at',
          'roles.name as role_name',
          'roles.slug as role_slug',
          'roles.slug as role',
          'roles.permissions as role_permissions',
          'vendors.name as vendor_name',
          'vendors.code as vendor_code'
        )
        .where('users.id', id)
        .whereNull('users.deleted_at');

      if (organizationId) {
        query = query.where('users.organization_id', organizationId);
      }

      const user = await query.first();
      return user || null;
    },
    () => {
      const user = mockStore.findUserById(id);
      if (user && organizationId && user.organization_id !== organizationId) return null;
      return user;
    }
  );
};

/**
 * Finds a user by email address.
 *
 * @param {string} email - Email address
 * @param {string|number} [organizationId] - Optional tenant filter
 * @returns {Promise<object|null>} User record or null
 */
const findByEmail = async (email, organizationId = null) => {
  return withDbFallback(
    async () => {
      let query = db('users')
        .whereRaw('LOWER(email) = ?', [email.toLowerCase()])
        .whereNull('deleted_at');

      if (organizationId) {
        query = query.where('organization_id', organizationId);
      }

      const user = await query.first();
      return user || null;
    },
    () => {
      const user = mockStore.findUserByEmail(email);
      if (user && organizationId && user.organization_id !== organizationId) return null;
      return user;
    }
  );
};

/**
 * Inserts a new user record.
 *
 * @param {object} data - New user attributes
 * @returns {Promise<object>} Created user record
 */
const create = async (data) => {
  return withDbFallback(
    async () => {
      const allowedCols = [
        'id',
        'organization_id',
        'email',
        'password_hash',
        'first_name',
        'last_name',
        'phone',
        'role_id',
        'vendor_id',
        'status',
        'validity_start',
        'validity_end',
        'is_lifetime',
        'voice_kyc_status',
        'user_code',
        'language',
        'created_at',
        'updated_at',
      ];

      const insertPayload = {
        id: data.id || require('crypto').randomUUID(),
        organization_id: data.organization_id || data.organizationId || null,
        email: (data.email || '').toLowerCase().trim(),
        password_hash: data.password_hash || data.passwordHash,
        first_name: data.first_name || data.firstName || '',
        last_name: data.last_name || data.lastName || '',
        phone: data.phone || null,
        role_id: data.role_id || data.roleId || null,
        vendor_id: data.vendor_id || data.vendorId || null,
        status: data.status || 'ACTIVE',
        validity_start: data.validity_start || data.validityStart || null,
        validity_end: data.validity_end || data.validityEnd || null,
        is_lifetime: data.is_lifetime !== undefined ? Boolean(data.is_lifetime) : (data.isLifetime !== undefined ? Boolean(data.isLifetime) : false),
        voice_kyc_status: data.voice_kyc_status || data.voiceKycStatus || 'PENDING',
        user_code: data.user_code || data.userCode || null,
        language: data.language || 'Hindi, English',
        created_at: new Date(),
        updated_at: new Date(),
      };

      // Strip any fields not in allowedCols
      Object.keys(insertPayload).forEach((k) => {
        if (!allowedCols.includes(k)) delete insertPayload[k];
      });

      const [createdUser] = await db('users').insert(insertPayload).returning('*');
      return createdUser;
    },
    () => mockStore.insert('users', data)
  );
};

/**
 * Updates a user record by ID.
 *
 * @param {string|number} id - User primary ID
 * @param {object} data - Fields to update
 * @returns {Promise<object>} Updated user record
 */
const update = async (id, data) => {
  return withDbFallback(
    async () => {
      const allowedCols = [
        'organization_id',
        'email',
        'password_hash',
        'first_name',
        'last_name',
        'phone',
        'role_id',
        'vendor_id',
        'status',
        'validity_start',
        'validity_end',
        'is_lifetime',
        'voice_kyc_status',
        'user_code',
        'language',
        'last_login_at',
        'updated_at',
        'deleted_at',
      ];

      const updatePayload = { updated_at: new Date() };
      if (data.first_name !== undefined || data.firstName !== undefined) {
        updatePayload.first_name = data.first_name || data.firstName;
      }
      if (data.last_name !== undefined || data.lastName !== undefined) {
        updatePayload.last_name = data.last_name || data.lastName;
      }
      if (data.phone !== undefined) updatePayload.phone = data.phone;
      if (data.email !== undefined) updatePayload.email = data.email.toLowerCase().trim();
      if (data.role_id !== undefined || data.roleId !== undefined) {
        updatePayload.role_id = data.role_id || data.roleId;
      }
      if (data.vendor_id !== undefined || data.vendorId !== undefined) {
        updatePayload.vendor_id = data.vendor_id || data.vendorId;
      }
      if (data.organization_id !== undefined || data.organizationId !== undefined) {
        updatePayload.organization_id = data.organization_id || data.organizationId;
      }
      if (data.status !== undefined) updatePayload.status = data.status;
      if (data.password_hash !== undefined || data.passwordHash !== undefined) {
        updatePayload.password_hash = data.password_hash || data.passwordHash;
      }
      if (data.validity_start !== undefined || data.validityStart !== undefined) {
        updatePayload.validity_start = data.validity_start !== undefined ? data.validity_start : data.validityStart;
      }
      if (data.validity_end !== undefined || data.validityEnd !== undefined) {
        updatePayload.validity_end = data.validity_end !== undefined ? data.validity_end : data.validityEnd;
      }
      if (data.is_lifetime !== undefined || data.isLifetime !== undefined) {
        updatePayload.is_lifetime = Boolean(data.is_lifetime !== undefined ? data.is_lifetime : data.isLifetime);
      }
      if (data.voice_kyc_status !== undefined || data.voiceKycStatus !== undefined) {
        updatePayload.voice_kyc_status = data.voice_kyc_status || data.voiceKycStatus;
      }
      if (data.user_code !== undefined || data.userCode !== undefined) {
        updatePayload.user_code = data.user_code || data.userCode;
      }
      if (data.language !== undefined) {
        updatePayload.language = data.language;
      }
      if (data.last_login_at !== undefined) updatePayload.last_login_at = data.last_login_at;

      // Strip any extra fields
      Object.keys(updatePayload).forEach((k) => {
        if (!allowedCols.includes(k)) delete updatePayload[k];
      });

      const [updatedUser] = await db('users')
        .where('id', id)
        .whereNull('deleted_at')
        .update(updatePayload)
        .returning('*');

      return updatedUser;
    },
    () => mockStore.update('users', id, data)
  );
};

/**
 * Finds all project assignments for a given user.
 *
 * @param {string|number} userId - User primary ID
 * @returns {Promise<Array<object>>} Assignments list
 */
const findAssignments = async (userId) => {
  return withDbFallback(
    async () => {
      return db('user_project_assignments')
        .leftJoin('projects', 'user_project_assignments.project_id', 'projects.id')
        .select(
          'user_project_assignments.*',
          'projects.name as project_name',
          'projects.code as project_code',
          'projects.status as project_status',
          'projects.client_id as client_id'
        )
        .where('user_project_assignments.user_id', userId)
        .orderBy('user_project_assignments.created_at', 'desc');
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
          client_id: proj.client_id,
        };
      });
    }
  );
};

/**
 * Creates a project assignment for a user.
 *
 * @param {object} data - Assignment record data
 * @returns {Promise<object>} Created assignment record
 */
const createAssignment = async (data) => {
  return withDbFallback(
    async () => {
      const payload = {
        user_id: data.userId || data.user_id,
        project_id: data.projectId || data.project_id,
        assigned_modules: JSON.stringify(data.assignedModules || data.assigned_modules || []),
        assigned_states: JSON.stringify(data.assignedStates || data.assigned_states || []),
        created_at: new Date(),
        updated_at: new Date(),
      };

      const [assignment] = await db('user_project_assignments')
        .insert(payload)
        .onConflict(['user_id', 'project_id'])
        .merge(['assigned_modules', 'assigned_states', 'updated_at'])
        .returning('*');
      return assignment;
    },
    () =>
      mockStore.insert('user_project_assignments', {
        user_id: data.userId || data.user_id,
        project_id: data.projectId || data.project_id,
        assigned_modules: JSON.stringify(data.assignedModules || data.assigned_modules || []),
        assigned_states: JSON.stringify(data.assignedStates || data.assigned_states || []),
      })
  );
};

/**
 * Finds a specific user assignment by ID.
 *
 * @param {string|number} assignmentId - Assignment primary ID
 * @returns {Promise<object|null>}
 */
const findAssignmentById = async (assignmentId) => {
  return withDbFallback(
    async () => {
      const assignment = await db('user_project_assignments')
        .where('id', assignmentId)
        .first();

      return assignment || null;
    },
    () => mockStore.findById('user_project_assignments', assignmentId)
  );
};

/**
 * Deletes a project assignment by assignment ID.
 *
 * @param {string|number} id - Assignment primary ID
 * @returns {Promise<number>} Number of deleted rows
 */
const deleteAssignment = async (id) => {
  return withDbFallback(
    async () => {
      return db('user_project_assignments')
        .where('id', id)
        .del();
    },
    () => mockStore.delete('user_project_assignments', id)
  );
};

module.exports = {
  findAll,
  count,
  findById,
  findByEmail,
  create,
  update,
  findAssignments,
  createAssignment,
  findAssignmentById,
  deleteAssignment,
};
