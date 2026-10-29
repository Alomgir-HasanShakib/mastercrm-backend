/**
 * @file users.routes.js
 * @description Express routing definitions for user management, role scoping, and project assignments.
 */

const express = require('express');
const { authenticate } = require('../../middleware/auth');
const { setTenantContext } = require('../../middleware/tenancy');
const { checkPermission } = require('../../middleware/rbac');
const { validate } = require('../../middleware/validator');
const usersController = require('./users.controller');
const {
  listUsersSchema,
  createUserSchema,
  updateUserSchema,
  statusSchema,
  assignmentSchema,
  idParamSchema,
  assignmentParamSchema,
} = require('./users.validation');

const router = express.Router();

// Apply authentication and tenant context resolution to all user routes
router.use(authenticate, setTenantContext);

/**
 * @route GET /api/v1/users
 * @desc List users with filters and pagination
 * @access Private (authenticated)
 */
router.get(
  '/',
  checkPermission('users', 'read'),
  validate(listUsersSchema, 'query'),
  usersController.list
);

/**
 * @route GET /api/v1/users/:id
 * @desc Get user by ID
 * @access Private (users:read)
 */
router.get(
  '/:id',
  checkPermission('users', 'read'),
  validate(idParamSchema, 'params'),
  usersController.getById
);

/**
 * @route POST /api/v1/users
 * @desc Create a new user
 * @access Private (users:manage)
 */
router.post(
  '/',
  checkPermission('users', 'manage'),
  validate(createUserSchema, 'body'),
  usersController.create
);

/**
 * @route PUT /api/v1/users/:id
 * @desc Update user details
 * @access Private (users:manage)
 */
router.put(
  '/:id',
  checkPermission('users', 'manage'),
  validate(idParamSchema, 'params'),
  validate(updateUserSchema, 'body'),
  usersController.update
);

/**
 * @route PATCH /api/v1/users/:id/status
 * @desc Activate or deactivate user account
 * @access Private (users:manage)
 */
router.patch(
  '/:id/status',
  checkPermission('users', 'manage'),
  validate(idParamSchema, 'params'),
  validate(statusSchema, 'body'),
  usersController.updateStatus
);

/**
 * @route DELETE /api/v1/users/:id
 * @desc Soft delete user account
 * @access Private (users:manage)
 */
router.delete(
  '/:id',
  checkPermission('users', 'manage'),
  validate(idParamSchema, 'params'),
  usersController.remove
);

/**
 * @route GET /api/v1/users/stats/quota
 * @desc Get organization user quota and concurrent seat lease statistics
 * @access Private
 */
router.get(
  '/stats/quota',
  usersController.getQuotaStats
);

/**
 * @route POST /api/v1/users/bulk-import
 * @desc Bulk import user accounts from parsed CSV data
 * @access Private (users:manage)
 */
router.post(
  '/bulk-import',
  checkPermission('users', 'manage'),
  usersController.bulkImport
);

/**
 * @route GET /api/v1/users/:id/assignments
 * @desc Get project assignments for a user
 * @access Private
 */
router.get(
  '/:id/assignments',
  validate(idParamSchema, 'params'),
  usersController.getAssignments
);

/**
 * @route POST /api/v1/users/:id/assignments
 * @desc Assign user to a project
 * @access Private (users:manage)
 */
router.post(
  '/:id/assignments',
  checkPermission('users', 'manage'),
  validate(idParamSchema, 'params'),
  validate(assignmentSchema, 'body'),
  usersController.createAssignment
);

/**
 * @route DELETE /api/v1/users/:id/assignments/:assignmentId
 * @desc Remove a user's project assignment
 * @access Private (users:manage)
 */
router.delete(
  '/:id/assignments/:assignmentId',
  checkPermission('users', 'manage'),
  validate(assignmentParamSchema, 'params'),
  usersController.removeAssignment
);

/**
 * @route GET /api/v1/users/:id/campaign-assignments
 * @desc Get multi-campaign reusable identity assignments for a user
 * @access Private
 */
router.get(
  '/:id/campaign-assignments',
  validate(idParamSchema, 'params'),
  usersController.getCampaignAssignments
);

/**
 * @route POST /api/v1/users/:id/campaign-assignments
 * @desc Assign user to a campaign with scoped role and module configuration
 * @access Private (users:manage)
 */
router.post(
  '/:id/campaign-assignments',
  checkPermission('users', 'manage'),
  validate(idParamSchema, 'params'),
  usersController.createCampaignAssignment
);

/**
 * @route DELETE /api/v1/users/:id/campaign-assignments/:assignmentId
 * @desc Remove a user's campaign assignment
 * @access Private (users:manage)
 */
router.delete(
  '/:id/campaign-assignments/:assignmentId',
  checkPermission('users', 'manage'),
  usersController.removeCampaignAssignment
);

/**
 * @route GET /api/v1/users/:id/documents
 * @desc Get user verification documents
 * @access Private
 */
router.get(
  '/:id/documents',
  validate(idParamSchema, 'params'),
  usersController.getDocuments
);

/**
 * @route POST /api/v1/users/:id/documents
 * @desc Add user verification document
 * @access Private (users:manage)
 */
router.post(
  '/:id/documents',
  checkPermission('users', 'manage'),
  validate(idParamSchema, 'params'),
  usersController.createDocument
);

/**
 * @route PATCH /api/v1/users/:id/documents/:docId/verify
 * @desc Verify or reject a user verification document
 * @access Private (users:manage)
 */
router.patch(
  '/:id/documents/:docId/verify',
  checkPermission('users', 'manage'),
  usersController.verifyDocument
);

module.exports = router;
