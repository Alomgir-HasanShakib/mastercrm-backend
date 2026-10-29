/**
 * @file auth.routes.js
 * @description Express routing definition for authentication endpoints.
 */

const express = require('express');
const { validate } = require('../../middleware/validator');
const { authenticate } = require('../../middleware/auth');
const { authLimiter } = require('../../middleware/rateLimiter');
const authController = require('./auth.controller');
const { loginSchema, refreshSchema, changePasswordSchema } = require('./auth.validation');

const router = express.Router();

/**
 * @route POST /api/v1/auth/login
 * @desc Authenticate user credentials and return JWT tokens
 * @access Public (rate limited)
 */
router.post(
  '/login',
  authLimiter,
  validate(loginSchema, 'body'),
  authController.login
);

/**
 * @route GET /api/v1/auth/login
 * @desc API helper returning login endpoint documentation
 * @access Public
 */
router.get('/login', (req, res) => {
  return res.status(200).json({
    success: true,
    message: 'Authentication login endpoint accepts POST requests with valid credentials.',
    method: 'POST',
    endpoint: '/api/v1/auth/login',
  });
});

/**
 * @route POST /api/v1/auth/refresh
 * @desc Rotate refresh token and issue new token pair
 * @access Public (rate limited)
 */
router.post(
  '/refresh',
  authLimiter,
  validate(refreshSchema, 'body'),
  authController.refresh
);

/**
 * @route POST /api/v1/auth/logout
 * @desc Invalidate refresh token and end session
 * @access Public / Authenticated
 */
router.post(
  '/logout',
  authController.logout
);

/**
 * @route POST /api/v1/auth/change-password
 * @desc Change password for currently authenticated user
 * @access Private
 */
router.post(
  '/change-password',
  authenticate,
  validate(changePasswordSchema, 'body'),
  authController.changePassword
);

/**
 * @route POST /api/v1/auth/switch-campaign
 * @desc Switch active campaign session without consuming an extra concurrent seat lease
 * @access Private
 */
router.post(
  '/switch-campaign',
  authenticate,
  authController.switchCampaign
);

/**
 * @route GET /api/v1/auth/me
 * @desc Get authenticated user profile, permissions, and project assignments
 * @access Private
 */
router.get(
  '/me',
  authenticate,
  authController.getMe
);

module.exports = router;
