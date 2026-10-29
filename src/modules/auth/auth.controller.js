/**
 * @file auth.controller.js
 * @description Controller handling incoming authentication HTTP requests.
 */

const { success } = require('../../utils/response');
const { auditLog } = require('../../services/auditLog');
const authService = require('./auth.service');

/**
 * Handle user login with email and password.
 *
 * @param {import('express').Request} req - Express request
 * @param {import('express').Response} res - Express response
 * @param {import('express').NextFunction} next - Express next function
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await authService.authenticateUser(email, password);

    // Atomic concurrent human seat lease check
    let seatLease = null;
    try {
      seatLease = authService.reserveUserSeat(user, {
        ip: req.ip || req.connection?.remoteAddress,
        userAgent: req.headers['user-agent'],
      });
    } catch (leaseErr) {
      return res.status(leaseErr.statusCode || 403).json({
        success: false,
        error: {
          code: leaseErr.code || 'LICENSE_LIMIT_EXCEEDED',
          message: leaseErr.message,
        },
      });
    }

    const tokenData = await authService.generateTokenPair(user);

    // Retrieve multi-campaign assignments from real database
    const assignedCampaigns = await authService.getUserCampaignAssignments(user.id, user);
    const leaseStats = null;

    // Audit log successful authentication
    try {
      await auditLog({
        userId: user.id,
        organizationId: user.organization_id,
        action: 'LOGIN',
        module: 'AUTH',
        resource: 'auth',
        resourceId: user.id,
        details: { email: user.email, role: user.role_id || user.role },
        ipAddress: req.ip || req.connection?.remoteAddress,
        userAgent: req.headers['user-agent'],
      });
    } catch (auditErr) {
      // Non-blocking
    }

    return success(
      res,
      {
        user,
        token: tokenData.accessToken,
        accessToken: tokenData.accessToken,
        refreshToken: tokenData.refreshToken,
        tokens: {
          accessToken: tokenData.accessToken,
          refreshToken: tokenData.refreshToken,
          expiresIn: tokenData.expiresIn,
        },
        seatLease,
        leaseStats,
        assignedCampaigns,
        activeCampaign: assignedCampaigns.length === 1 ? assignedCampaigns[0] : null,
      },
      'User authenticated successfully',
      200
    );
  } catch (err) {
    try {
      await auditLog({
        action: 'FAILED_LOGIN',
        module: 'AUTH',
        resource: 'auth',
        resourceId: req.body?.email || 'anonymous',
        details: { email: req.body?.email, reason: err.message },
        ipAddress: req.ip || req.connection?.remoteAddress,
        userAgent: req.headers['user-agent'],
      });
    } catch {
      // Non-blocking
    }
    return next(err);
  }
};

/**
 * Handle refresh token rotation and issue new tokens.
 *
 * @param {import('express').Request} req - Express request
 * @param {import('express').Response} res - Express response
 * @param {import('express').NextFunction} next - Express next function
 */
const refresh = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    const refreshed = await authService.refreshTokens(refreshToken);

    return success(
      res,
      {
        user: refreshed.user,
        token: refreshed.accessToken,
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken,
        tokens: {
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken,
          expiresIn: refreshed.expiresIn,
        },
      },
      'Token refreshed successfully',
      200
    );
  } catch (err) {
    return next(err);
  }
};

/**
 * Invalidate refresh token upon logout.
 *
 * @param {import('express').Request} req - Express request
 * @param {import('express').Response} res - Express response
 * @param {import('express').NextFunction} next - Express next function
 */
const logout = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      await authService.invalidateRefreshToken(refreshToken);
    }

    const userId = req.user?.userId || req.user?.id;
    if (userId) {
      // Release concurrent seat lease
      authService.releaseUserSeat(userId);

      await auditLog({
        userId,
        organizationId: req.user.organizationId,
        action: 'LOGOUT',
        resource: 'auth',
        resourceId: userId,
        ipAddress: req.ip || req.connection?.remoteAddress,
        userAgent: req.headers['user-agent'],
      });
    }

    return success(res, null, 'Logged out successfully', 200);
  } catch (err) {
    return next(err);
  }
};

/**
 * Switches user active campaign and resolves campaign-scoped role and permissions.
 * Does not consume an extra concurrent seat lease.
 */
const switchCampaign = async (req, res, next) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { campaignId } = req.body;

    const result = await authService.switchCampaign(userId, campaignId);

    await auditLog({
      userId,
      organizationId: req.user.organizationId,
      action: 'SWITCH_CAMPAIGN',
      resource: 'campaign',
      resourceId: campaignId,
      details: { newRole: result.role },
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'],
    });

    return success(res, result, `Switched to campaign ${result.activeCampaign?.name || campaignId}`, 200);
  } catch (err) {
    return next(err);
  }
};

/**
 * Update authenticated user's own password.
 *
 * @param {import('express').Request} req - Express request
 * @param {import('express').Response} res - Express response
 * @param {import('express').NextFunction} next - Express next function
 */
const changePassword = async (req, res, next) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { currentPassword, newPassword } = req.body;

    await authService.changePassword(userId, currentPassword, newPassword);

    await auditLog({
      userId,
      organizationId: req.user.organizationId,
      action: 'CHANGE_PASSWORD',
      resource: 'auth',
      resourceId: userId,
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'],
    });

    return success(res, null, 'Password changed successfully. Please log in with your new password.', 200);
  } catch (err) {
    return next(err);
  }
};

/**
 * Retrieve authenticated user profile with role, permissions, and project assignments.
 *
 * @param {import('express').Request} req - Express request
 * @param {import('express').Response} res - Express response
 * @param {import('express').NextFunction} next - Express next function
 */
const getMe = async (req, res, next) => {
  try {
    const userId = req.user.userId || req.user.id;
    const profile = await authService.getUserProfile(userId);

    return success(res, profile, 'User profile retrieved successfully', 200);
  } catch (err) {
    return next(err);
  }
};

module.exports = {
  login,
  refresh,
  logout,
  changePassword,
  switchCampaign,
  getMe,
};
