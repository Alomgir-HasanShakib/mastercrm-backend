/**
 * @file users.controller.js
 * @description Controller handling user CRUD operations, project assignments, and pagination.
 */

const { success, paginated } = require('../../utils/response');
const { parsePagination, buildPaginationMeta } = require('../../utils/pagination');
const { auditLog } = require('../../services/auditLog');
const usersService = require('./users.service');

/**
 * Lists users with filtering, sorting, and pagination.
 *
 * @param {import('express').Request} req - Express request
 * @param {import('express').Response} res - Express response
 * @param {import('express').NextFunction} next - Express next function
 */
const list = async (req, res, next) => {
  try {
    const pagination = parsePagination(req.query, {
      defaultPage: 1,
      defaultLimit: 20,
      defaultSortBy: 'created_at',
      defaultSortOrder: 'desc',
    });

    const filters = {
      search: req.query.search,
      roleId: req.query.roleId,
      vendorId: req.query.vendorId,
      status: req.query.status,
      projectId: req.query.projectId,
      organizationId: req.query.organizationId,
    };

    const { users, total } = await usersService.listUsers(filters, pagination, req.tenantContext);
    const meta = buildPaginationMeta(total, pagination.page, pagination.limit);

    return paginated(res, users, meta, 'Users retrieved successfully', 200);
  } catch (err) {
    return next(err);
  }
};

/**
 * Retrieves a single user by primary ID.
 *
 * @param {import('express').Request} req - Express request
 * @param {import('express').Response} res - Express response
 * @param {import('express').NextFunction} next - Express next function
 */
const getById = async (req, res, next) => {
  try {
    const user = await usersService.getUserById(req.params.id, req.tenantContext);
    return success(res, user, 'User retrieved successfully', 200);
  } catch (err) {
    return next(err);
  }
};

/**
 * Creates a new user record and logs an audit trail event.
 *
 * @param {import('express').Request} req - Express request
 * @param {import('express').Response} res - Express response
 * @param {import('express').NextFunction} next - Express next function
 */
const create = async (req, res, next) => {
  try {
    const createdUser = await usersService.createUser(req.body, req.tenantContext);

    await auditLog({
      userId: req.user?.userId || req.user?.id,
      organizationId: createdUser.organization_id || req.tenantContext?.organizationId,
      action: 'CREATE_USER',
      resource: 'users',
      resourceId: createdUser.id,
      details: { email: createdUser.email, roleId: createdUser.role_id },
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'],
    });

    return success(res, createdUser, 'User created successfully', 201);
  } catch (err) {
    return next(err);
  }
};

/**
 * Updates an existing user record.
 *
 * @param {import('express').Request} req - Express request
 * @param {import('express').Response} res - Express response
 * @param {import('express').NextFunction} next - Express next function
 */
const update = async (req, res, next) => {
  try {
    const updatedUser = await usersService.updateUser(req.params.id, req.body, req.tenantContext);

    await auditLog({
      userId: req.user?.userId || req.user?.id,
      organizationId: updatedUser.organization_id || req.tenantContext?.organizationId,
      action: req.body.role_id || req.body.role ? 'USER_ROLE_CHANGE' : req.body.vendor_id ? 'USER_VENDOR_ASSIGNMENT' : 'UPDATE_USER',
      module: 'USERS',
      resource: 'users',
      resourceId: updatedUser.id,
      details: { updatedFields: Object.keys(req.body), roleId: req.body.role_id, role: req.body.role, vendorId: req.body.vendor_id },
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'],
    });

    return success(res, updatedUser, 'User updated successfully', 200);
  } catch (err) {
    return next(err);
  }
};

/**
 * Changes user active status.
 *
 * @param {import('express').Request} req - Express request
 * @param {import('express').Response} res - Express response
 * @param {import('express').NextFunction} next - Express next function
 */
const updateStatus = async (req, res, next) => {
  try {
    const updatedUser = await usersService.updateUserStatus(req.params.id, req.body.status, req.tenantContext);

    await auditLog({
      userId: req.user?.userId || req.user?.id,
      organizationId: updatedUser.organization_id || req.tenantContext?.organizationId,
      action: 'UPDATE_USER_STATUS',
      resource: 'users',
      resourceId: updatedUser.id,
      details: { status: req.body.status },
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'],
    });

    return success(res, updatedUser, `User status updated to ${req.body.status}`, 200);
  } catch (err) {
    return next(err);
  }
};

/**
 * Soft deletes a user record.
 *
 * @param {import('express').Request} req - Express request
 * @param {import('express').Response} res - Express response
 * @param {import('express').NextFunction} next - Express next function
 */
const remove = async (req, res, next) => {
  try {
    const deletedUser = await usersService.deleteUser(req.params.id, req.tenantContext);

    await auditLog({
      userId: req.user?.userId || req.user?.id,
      organizationId: deletedUser.organization_id || req.tenantContext?.organizationId,
      action: 'DELETE_USER',
      resource: 'users',
      resourceId: req.params.id,
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'],
    });

    return success(res, null, 'User deleted successfully', 200);
  } catch (err) {
    return next(err);
  }
};

/**
 * Retrieves all project assignments for a user.
 *
 * @param {import('express').Request} req - Express request
 * @param {import('express').Response} res - Express response
 * @param {import('express').NextFunction} next - Express next function
 */
const getAssignments = async (req, res, next) => {
  try {
    // Verify user access first
    await usersService.getUserById(req.params.id, req.tenantContext);
    const assignments = await usersService.getUserAssignments(req.params.id);

    return success(res, assignments, 'User project assignments retrieved successfully', 200);
  } catch (err) {
    return next(err);
  }
};

/**
 * Assigns a user to a project.
 *
 * @param {import('express').Request} req - Express request
 * @param {import('express').Response} res - Express response
 * @param {import('express').NextFunction} next - Express next function
 */
const createAssignment = async (req, res, next) => {
  try {
    await usersService.getUserById(req.params.id, req.tenantContext);
    const assignment = await usersService.assignUserToProject(req.params.id, req.body);

    await auditLog({
      userId: req.user?.userId || req.user?.id,
      organizationId: req.tenantContext?.organizationId,
      action: 'ASSIGN_USER_PROJECT',
      resource: 'user_project_assignments',
      resourceId: assignment.id,
      details: { targetUserId: req.params.id, projectId: req.body.projectId },
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'],
    });

    return success(res, assignment, 'User successfully assigned to project', 201);
  } catch (err) {
    return next(err);
  }
};

/**
 * Removes a user's project assignment.
 *
 * @param {import('express').Request} req - Express request
 * @param {import('express').Response} res - Express response
 * @param {import('express').NextFunction} next - Express next function
 */
const removeAssignment = async (req, res, next) => {
  try {
    await usersService.removeUserAssignment(req.params.assignmentId);

    await auditLog({
      userId: req.user?.userId || req.user?.id,
      organizationId: req.tenantContext?.organizationId,
      action: 'REMOVE_USER_PROJECT_ASSIGNMENT',
      resource: 'user_project_assignments',
      resourceId: req.params.assignmentId,
      details: { targetUserId: req.params.id },
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'],
    });

    return success(res, null, 'Project assignment removed successfully', 200);
  } catch (err) {
    return next(err);
  }
};

/**
 * Returns organization user quota and concurrent seat lease statistics.
 */
const getQuotaStats = async (req, res, next) => {
  try {
    const orgId = req.tenantContext?.organizationId || req.query.organizationId || '11111111-1111-1111-1111-111111111111';
    const stats = await usersService.getOrganizationQuotaStats(orgId);
    return success(res, stats, 'Organization quota and licensing stats retrieved successfully', 200);
  } catch (err) {
    return next(err);
  }
};

/**
 * Retrieves campaign assignments for a user.
 */
const getCampaignAssignments = async (req, res, next) => {
  try {
    const assignments = await usersService.getUserCampaignAssignments(req.params.id);
    return success(res, assignments, 'User campaign assignments retrieved successfully', 200);
  } catch (err) {
    return next(err);
  }
};

/**
 * Creates a campaign assignment for a user.
 */
const createCampaignAssignment = async (req, res, next) => {
  try {
    const assignment = await usersService.createUserCampaignAssignment(req.params.id, req.body, req.tenantContext);

    await auditLog({
      userId: req.user?.userId || req.user?.id,
      organizationId: req.tenantContext?.organizationId,
      action: 'ASSIGN_USER_CAMPAIGN',
      module: 'USERS',
      resource: 'user_campaign_assignments',
      resourceId: assignment?.id || req.params.id,
      details: { targetUserId: req.params.id, campaignId: req.body.projectId || req.body.campaignId },
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'],
    });

    return success(res, assignment, 'User assigned to campaign successfully', 201);
  } catch (err) {
    return next(err);
  }
};

/**
 * Removes a campaign assignment.
 */
const removeCampaignAssignment = async (req, res, next) => {
  try {
    await usersService.deleteUserCampaignAssignment(req.params.assignmentId);

    await auditLog({
      userId: req.user?.userId || req.user?.id,
      organizationId: req.tenantContext?.organizationId,
      action: 'REMOVE_USER_CAMPAIGN_ASSIGNMENT',
      module: 'USERS',
      resource: 'user_campaign_assignments',
      resourceId: req.params.assignmentId,
      details: { assignmentId: req.params.assignmentId },
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'],
    });

    return success(res, null, 'Campaign assignment removed successfully', 200);
  } catch (err) {
    return next(err);
  }
};

/**
 * Retrieves documents for a user.
 */
const getDocuments = async (req, res, next) => {
  try {
    const documents = await usersService.getUserDocuments(req.params.id);
    return success(res, documents, 'User verification documents retrieved successfully', 200);
  } catch (err) {
    return next(err);
  }
};

/**
 * Adds a document for a user.
 */
const createDocument = async (req, res, next) => {
  try {
    const document = await usersService.addUserDocument(req.params.id, req.body, req.tenantContext);
    return success(res, document, 'Verification document added successfully', 201);
  } catch (err) {
    return next(err);
  }
};

/**
 * Verifies or rejects a document.
 */
const verifyDocument = async (req, res, next) => {
  try {
    const { status } = req.body;
    const document = await usersService.verifyUserDocument(req.params.docId, status, req.user?.userId || req.user?.id);
    return success(res, document, `Document marked as ${status}`, 200);
  } catch (err) {
    return next(err);
  }
};

/**
 * Bulk import user accounts from parsed CSV.
 */
const bulkImport = async (req, res, next) => {
  try {
    const { users } = req.body;
    const result = await usersService.bulkImportUsers(users, req.tenantContext);
    return success(res, result, `Bulk import completed: ${result.createdCount} created, ${result.failedCount} failed`, 200);
  } catch (err) {
    return next(err);
  }
};

module.exports = {
  list,
  getById,
  create,
  update,
  updateStatus,
  remove,
  getAssignments,
  createAssignment,
  removeAssignment,
  getQuotaStats,
  getCampaignAssignments,
  createCampaignAssignment,
  removeCampaignAssignment,
  getDocuments,
  createDocument,
  verifyDocument,
  bulkImport,
};
