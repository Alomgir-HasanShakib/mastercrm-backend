/**
 * @file users.service.js
 * @description Business logic layer for managing users, tenant isolation, and project assignments.
 */

const { ConflictError, NotFoundError, AuthorizationError, ValidationError } = require('../../utils/errors');
const { hashPassword } = require('../../utils/crypto');
const usersModel = require('./users.model');
const { db } = require('../../database/connection');
const mockStore = require('../../database/mockStore');


/**
 * Strips sensitive authentication fields from user objects.
 *
 * @param {object} user - Raw database user object
 * @returns {object} Sanitized user object
 */
const sanitizeUser = (user) => {
  if (!user) return null;
  const { password_hash, password, ...safeUser } = user;
  return safeUser;
};

/**
 * Retrieves a list of users with tenant scoping, pagination, and filters.
 *
 * @param {object} filters - User filter options
 * @param {object} pagination - Pagination parameters
 * @param {object} tenantContext - Authenticated request tenant context
 * @returns {Promise<{ users: Array<object>, total: number }>}
 */
const listUsers = async (filters = {}, pagination = {}, tenantContext = {}) => {
  const scopedFilters = { ...filters };

  // Enforce tenant isolation for non-master admins
  if (!tenantContext.isMasterAdmin && tenantContext.organizationId) {
    scopedFilters.organizationId = tenantContext.organizationId;
  }

  // Enforce vendor scoping for vendor administrators or vendor staff
  if (tenantContext.vendorId) {
    scopedFilters.vendorId = tenantContext.vendorId;
  }

  const [rawUsers, total] = await Promise.all([
    usersModel.findAll(scopedFilters, pagination),
    usersModel.count(scopedFilters),
  ]);

  const users = rawUsers.map(sanitizeUser);

  return { users, total };
};

/**
 * Retrieves a single user by ID respecting tenant boundaries.
 *
 * @param {string|number} id - User primary ID
 * @param {object} tenantContext - Authenticated request tenant context
 * @returns {Promise<object>} Scoped user object
 */
const getUserById = async (id, tenantContext = {}) => {
  const orgFilter = !tenantContext.isMasterAdmin ? tenantContext.organizationId : null;
  const user = await usersModel.findById(id, orgFilter);

  if (!user) {
    throw new NotFoundError(`User with ID '${id}' was not found.`);
  }

  // Check vendor isolation if scoped to vendor
  if (tenantContext.vendorId && String(user.vendor_id) !== String(tenantContext.vendorId)) {
    throw new AuthorizationError('Forbidden: Access denied to user belonging to another vendor.');
  }

  return sanitizeUser(user);
};

/**
 * Creates a new user record within the active tenant.
 *
 * @param {object} userData - New user attributes
 * @param {object} tenantContext - Authenticated request tenant context
 * @returns {Promise<object>} Created sanitized user record
 */
const createUser = async (userData, tenantContext = {}) => {
  const existingUser = await usersModel.findByEmail(userData.email);
  if (existingUser) {
    throw new ConflictError(`User with email '${userData.email}' already exists.`);
  }

  // Determine organization ID: prioritize input for master admin, otherwise use tenant context
  let organizationId = userData.organizationId;
  if (!tenantContext.isMasterAdmin || !organizationId) {
    organizationId = tenantContext.organizationId;
  }

  // Determine vendor ID & enforce vendor creator boundaries
  let vendorId = userData.vendorId || null;
  const creatorRole = (tenantContext.role || tenantContext.roleName || tenantContext.role_name || '').toUpperCase().replace(/\s+/g, '_');
  const isCreatorVendor = creatorRole === 'VENDOR_ADMIN' || creatorRole.includes('VENDOR') || Boolean(tenantContext.vendorId);

  if (isCreatorVendor) {
    throw new AuthorizationError('Vendors are not permitted to create users. Only Organization Administrators or Master Admins can create and assign users to vendors.');
  }

  // Automatic parent organization resolution for vendor creators or assignments
  if (!organizationId && vendorId) {
    try {
      const vRec = await db('vendors').where('id', vendorId).first();
      if (vRec && vRec.organization_id) {
        organizationId = vRec.organization_id;
      }
    } catch {
      // fallback
    }
  }

  // Enforce Subscription User Capacity Limit per Organization
  if (organizationId) {
    try {
      const org = await db('organizations').where('id', organizationId).first();
      const maxUsers = org?.max_created_users || org?.max_users || 50;
      const countRes = await db('users').where('organization_id', organizationId).whereNull('deleted_at').count('* as cnt').first();
      const currentUsers = parseInt(countRes?.cnt || 0, 10);
      if (currentUsers >= maxUsers) {
        throw new ValidationError(
          `User capacity limit reached for this organization (Max capacity: ${maxUsers} users, Currently created: ${currentUsers}). Please upgrade your organization subscription capacity to create more users.`
        );
      }
    } catch (e) {
      if (e.name === 'ValidationError') throw e;
      const allUsers = mockStore.data?.users || [];
      const currentUsers = allUsers.filter((u) => u.organization_id === organizationId && !u.deleted_at).length;
      const maxUsers = 50;
      if (currentUsers >= maxUsers) {
        throw new ValidationError(
          `User capacity limit reached for this organization (Max capacity: ${maxUsers} users, Currently created: ${currentUsers}). Please upgrade your organization subscription capacity to create more users.`
        );
      }
    }

    // Enforce AI Audit entitlement check: if creating a user with role SUPER_AUDITOR or AI permissions
    try {
      const org = await db('organizations').where('id', organizationId).first();
      let roleRecord = null;
      if (userData.roleId) {
        roleRecord = await db('roles')
          .where('id', userData.roleId)
          .orWhere('slug', userData.roleId)
          .first();
      }
      const roleSlug = (roleRecord?.slug || userData.role || '').toUpperCase();
      const hasAiPermission =
        roleSlug === 'SUPER_AUDITOR' ||
        roleSlug === 'AI_AUDITOR' ||
        (Array.isArray(roleRecord?.permissions) &&
          roleRecord.permissions.some((p) => p.startsWith('super_audit:') || p.startsWith('ai:')));

      if (hasAiPermission && org && org.enable_ai_audit !== true && org.audit_ai_licenses < 1) {
        throw new ValidationError(
          `AI Voice & Speech Audit is not enabled for this organization. Cannot create user with role '${roleSlug}'. Please enable the AI Audit Add-On first.`
        );
      }
    } catch (e) {
      if (e.name === 'ValidationError') throw e;
    }
  }

  // Resolve Role ID from DB first
  let roleId = userData.roleId;
  const slug = (userData.role || userData.roleSlug || userData.primaryRole || '').toUpperCase();
  if (!roleId && slug) {
    try {
      const dbRole = await db('roles')
        .whereRaw('UPPER(slug) = ?', [slug])
        .orWhereRaw('UPPER(name) = ?', [slug])
        .first();
      if (dbRole) {
        roleId = dbRole.id;
      }
    } catch (_) {}
  }

  if (!roleId && slug) {
    const rolesList = mockStore.data?.roles || [];
    const roleMatch = rolesList.find((r) => r.slug === slug || r.name.toLowerCase() === slug.toLowerCase());
    if (roleMatch) roleId = roleMatch.id;
  }

  if (!roleId && Array.isArray(userData.campaignAssignments) && userData.campaignAssignments[0]?.roleSlug) {
    const cSlug = String(userData.campaignAssignments[0].roleSlug).toUpperCase();
    try {
      const dbRole = await db('roles').whereRaw('UPPER(slug) = ?', [cSlug]).first();
      if (dbRole) roleId = dbRole.id;
    } catch (_) {}
  }

  if (!roleId) {
    try {
      const defaultRole = await db('roles').where('slug', 'CATI_AGENT').first();
      roleId = defaultRole ? defaultRole.id : '55555555-5555-5555-5555-555555555505';
    } catch (_) {
      roleId = '55555555-5555-5555-5555-555555555505';
    }
  }

  const passwordHash = await hashPassword(userData.password || 'Password123!');

  const newRecordData = {
    email: userData.email.toLowerCase().trim(),
    password_hash: passwordHash,
    first_name: userData.firstName.trim(),
    last_name: userData.lastName.trim(),
    phone: userData.phone || null,
    role_id: roleId,
    vendor_id: vendorId,
    organization_id: organizationId,
    status: userData.status || 'ACTIVE',
    user_code: userData.userCode || userData.user_code || `STX-U${1000 + Math.floor(Math.random() * 9000)}`,
    language: userData.language || 'Hindi, English',
    validity_start: userData.validityStart || userData.validity_start || new Date().toISOString().split('T')[0],
    validity_end: userData.isLifetime || userData.is_lifetime ? null : (userData.validityEnd || userData.validity_end || null),
    is_lifetime: Boolean(userData.isLifetime || userData.is_lifetime),
    voice_kyc_status: userData.voiceKycStatus || userData.voice_kyc_status || 'PENDING',
  };

  const created = await usersModel.create(newRecordData);

  // Multi-campaign initial assignments if provided
  if (Array.isArray(userData.campaignAssignments) && userData.campaignAssignments.length > 0) {
    for (const asg of userData.campaignAssignments) {
      const projId = asg.campaignId || asg.projectId;
      if (projId) {
        try {
          await usersModel.createAssignment({
            userId: created.id,
            projectId: projId,
            assignedModules: asg.moduleSetup ? Object.keys(asg.moduleSetup).filter((k) => asg.moduleSetup[k]) : (asg.assignedModules || []),
            assignedStates: asg.assignedStates || [],
          });
        } catch (_) {}
      }

      mockStore.createUserCampaignAssignment({
        userId: created.id,
        organizationId,
        vendorId: asg.vendorId || vendorId,
        campaignId: asg.campaignId,
        roleId: asg.roleId || userData.roleId,
        roleSlug: asg.roleSlug || userData.role || 'CATI_AGENT',
        teamId: asg.teamId || null,
        startDate: asg.startDate,
        endDate: asg.endDate,
        status: asg.status || 'ACTIVE',
        assignedBy: tenantContext.userId,
        moduleSetup: asg.moduleSetup || {},
      });
    }
  }

  // Verification documents checklist if provided
  if (Array.isArray(userData.documents) && userData.documents.length > 0) {
    for (const doc of userData.documents) {
      mockStore.addUserDocument({
        userId: created.id,
        documentType: doc.documentType,
        documentName: doc.documentName || `${doc.documentType}.pdf`,
        status: doc.status || 'VERIFIED',
        verifiedBy: tenantContext.userId,
      });
    }
  }

  return sanitizeUser(created);
};

/**
 * Updates user attributes with tenant isolation safeguards.
 *
 * @param {string|number} id - User primary ID
 * @param {object} userData - Attributes to update
 * @param {object} tenantContext - Authenticated request tenant context
 * @returns {Promise<object>} Updated sanitized user record
 */
const updateUser = async (id, userData, tenantContext = {}) => {
  // Ensure target user exists and caller has authority
  await getUserById(id, tenantContext);

  const updatePayload = {};

  if (userData.firstName !== undefined) updatePayload.first_name = userData.firstName.trim();
  if (userData.lastName !== undefined) updatePayload.last_name = userData.lastName.trim();
  if (userData.phone !== undefined) updatePayload.phone = userData.phone;
  if (userData.roleId !== undefined) updatePayload.role_id = userData.roleId;
  if (userData.status !== undefined) updatePayload.status = userData.status;
  if (userData.language !== undefined) updatePayload.language = userData.language;
  if (userData.validityStart !== undefined) updatePayload.validity_start = userData.validityStart;
  if (userData.validityEnd !== undefined) updatePayload.validity_end = userData.validityEnd;
  if (userData.isLifetime !== undefined) updatePayload.is_lifetime = userData.isLifetime;
  if (userData.voiceKycStatus !== undefined) updatePayload.voice_kyc_status = userData.voiceKycStatus;
  if (userData.voice_kyc_status !== undefined) updatePayload.voice_kyc_status = userData.voice_kyc_status;

  if (userData.vendorId !== undefined) {
    if (!tenantContext.vendorId) {
      updatePayload.vendor_id = userData.vendorId;
    }
  }

  if (userData.organizationId !== undefined && tenantContext.isMasterAdmin) {
    updatePayload.organization_id = userData.organizationId;
  }

  const updated = await usersModel.update(id, updatePayload);
  return sanitizeUser(updated);
};

/**
 * Changes active status of a user (ACTIVE, INACTIVE, SUSPENDED).
 *
 * @param {string|number} id - User primary ID
 * @param {string} status - New status string
 * @param {object} tenantContext - Authenticated request tenant context
 * @returns {Promise<object>} Updated user
 */
const updateUserStatus = async (id, status, tenantContext = {}) => {
  await getUserById(id, tenantContext);

  const upperStatus = status.toUpperCase();
  const updated = await usersModel.update(id, {
    status: upperStatus,
  });

  // If user is suspended or deactivated, immediately revoke all active refresh tokens for security
  if (upperStatus === 'SUSPENDED' || upperStatus === 'INACTIVE') {
    try {
      const authModel = require('../auth/auth.model');
      await authModel.deleteAllUserRefreshTokens(id);
    } catch (_) {}
  }

  return sanitizeUser(updated);
};

/**
 * Soft deletes a user by setting deleted_at timestamp.
 *
 * @param {string|number} id - User primary ID
 * @param {object} tenantContext - Authenticated request tenant context
 * @returns {Promise<object>} Deactivated user
 */
const deleteUser = async (id, tenantContext = {}) => {
  await getUserById(id, tenantContext);

  const updated = await usersModel.update(id, {
    status: 'INACTIVE',
    deleted_at: new Date(),
  });

  // Invalidate tokens immediately
  try {
    const authModel = require('../auth/auth.model');
    await authModel.deleteAllUserRefreshTokens(id);
  } catch (_) {}

  return sanitizeUser(updated);
};

/**
 * Retrieves all project assignments for a user.
 *
 * @param {string|number} userId - User primary ID
 * @returns {Promise<Array<object>>} Assignments list
 */
const getUserAssignments = async (userId) => {
  const assignments = await usersModel.findAssignments(userId);

  return assignments.map((assignment) => ({
    ...assignment,
    assigned_modules:
      typeof assignment.assigned_modules === 'string'
        ? JSON.parse(assignment.assigned_modules || '[]')
        : assignment.assigned_modules || [],
    assigned_states:
      typeof assignment.assigned_states === 'string'
        ? JSON.parse(assignment.assigned_states || '[]')
        : assignment.assigned_states || [],
  }));
};

/**
 * Assigns a user to a project with specified modules and states.
 *
 * @param {string|number} userId - User primary ID
 * @param {object} assignmentData - Assignment details
 * @returns {Promise<object>} Created assignment
 */
const assignUserToProject = async (userId, assignmentData) => {
  const created = await usersModel.createAssignment({
    userId,
    projectId: assignmentData.projectId,
    assignedModules: assignmentData.assignedModules || [],
    assignedStates: assignmentData.assignedStates || [],
  });

  return created;
};

/**
 * Removes a user's project assignment by ID.
 *
 * @param {string|number} assignmentId - Assignment primary ID
 * @returns {Promise<boolean>}
 */
const removeUserAssignment = async (assignmentId) => {
  const assignment = await usersModel.findAssignmentById(assignmentId);
  if (!assignment) {
    throw new NotFoundError(`Assignment with ID '${assignmentId}' was not found.`);
  }

  await usersModel.deleteAssignment(assignmentId);
  return true;
};

/**
 * Retrieves multi-campaign reusable identity assignments for a specific user.
 */
const getUserCampaignAssignments = async (userId) => {
  return mockStore.getUserCampaignAssignments(userId);
};

/**
 * Adds a new campaign assignment with scoped role and module configuration to a user.
 */
const createUserCampaignAssignment = async (userId, data, tenantContext = {}) => {
  const user = await getUserById(userId, tenantContext);
  const projId = data.campaignId || data.projectId;

  if (projId) {
    try {
      await usersModel.createAssignment({
        userId,
        projectId: projId,
        assignedModules: data.moduleSetup ? Object.keys(data.moduleSetup).filter((k) => data.moduleSetup[k]) : (data.assignedModules || []),
        assignedStates: data.assignedStates || [],
      });
    } catch (_) {}
  }

  return mockStore.createUserCampaignAssignment({
    userId,
    organizationId: user.organization_id,
    vendorId: data.vendorId || user.vendor_id,
    campaignId: data.campaignId,
    roleId: data.roleId || user.role_id,
    roleSlug: data.roleSlug || user.role || 'CATI_AGENT',
    teamId: data.teamId,
    startDate: data.startDate,
    endDate: data.endDate,
    status: data.status || 'ACTIVE',
    assignedBy: tenantContext.userId,
    moduleSetup: data.moduleSetup || {},
  });
};

/**
 * Deletes a multi-campaign assignment.
 */
const deleteUserCampaignAssignment = async (assignmentId) => {
  return mockStore.deleteUserCampaignAssignment(assignmentId);
};

/**
 * Retrieves verification documents uploaded for a user.
 */
const getUserDocuments = async (userId) => {
  return mockStore.getUserDocuments(userId);
};

/**
 * Adds a new verification document for a user.
 */
const addUserDocument = async (userId, data, tenantContext = {}) => {
  return mockStore.addUserDocument({
    userId,
    documentType: data.documentType,
    documentName: data.documentName,
    status: data.status || 'VERIFIED',
    verifiedBy: tenantContext.userId,
  });
};

/**
 * Verifies or rejects a user's verification document.
 */
const verifyUserDocument = async (docId, status, verifiedBy) => {
  return mockStore.verifyUserDocument(docId, status, verifiedBy);
};

/**
 * Returns quota statistics (created users vs capacity, concurrent seats vs lease).
 */
const getOrganizationQuotaStats = async (organizationId) => {
  return mockStore.getOrganizationQuotaStats(organizationId);
};

/**
 * Bulk imports users from CSV data with campaign assignments.
 */
const bulkImportUsers = async (usersList = [], tenantContext = {}) => {
  const createdUsers = [];
  const errors = [];
  const vendorsList = mockStore.data?.vendors || [];

  for (const item of usersList) {
    try {
      let vendorId = item.vendorId || item.vendor_id;
      if (!vendorId && item.vendor_code) {
        const v = vendorsList.find((vend) => vend.code === item.vendor_code || vend.name === item.vendor_code);
        if (v) vendorId = v.id;
      }

      const campaignId = item.campaignId || item.campaign_id || 'PRJ-101';
      const roleSlug = item.roleSlug || item.role_slug || 'CATI_AGENT';

      const payload = {
        firstName: item.firstName || item.first_name || 'Agent',
        lastName: item.lastName || item.last_name || 'User',
        email: item.email,
        phone: item.phone || '+91-9870000000',
        password: item.password || 'Password123!',
        vendorId,
        roleSlug,
        status: item.status || 'ACTIVE',
        isLifetime: item.isLifetime !== undefined ? item.isLifetime : true,
        campaignAssignments: item.campaignAssignments || [
          {
            campaignId,
            roleSlug,
            startDate: new Date().toISOString().split('T')[0],
            endDate: '2026-12-31',
          },
        ],
      };

      const created = await createUser(payload, tenantContext);
      createdUsers.push(created);
    } catch (err) {
      errors.push({ email: item.email, error: err.message });
    }
  }

  return {
    totalAttempted: usersList.length,
    createdCount: createdUsers.length,
    failedCount: errors.length,
    createdUsers,
    errors,
  };
};

module.exports = {
  listUsers,
  getUserById,
  createUser,
  updateUser,
  updateUserStatus,
  deleteUser,
  getUserAssignments,
  assignUserToProject,
  removeUserAssignment,
  getUserCampaignAssignments,
  createUserCampaignAssignment,
  deleteUserCampaignAssignment,
  getUserDocuments,
  addUserDocument,
  verifyUserDocument,
  getOrganizationQuotaStats,
  bulkImportUsers,
  sanitizeUser,
};
