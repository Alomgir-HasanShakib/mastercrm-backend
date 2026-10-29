/**
 * @file realtime.controller.js
 * @description Request handlers for Realtime workforce presence, live monitoring, and admin broadcasts.
 */

const { success } = require('../../utils/response');
const realtimeService = require('./realtime.service');

const realtimeController = {
  /**
   * GET /api/v1/realtime/workforce/live
   * Live agents presence summary across CATI, CAPI, TVC, FA and detailed roster.
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async getLiveWorkforce(req, res, next) {
    try {
      const filters = {
        channel: req.query.channel,
        state: req.query.state,
        role: req.query.role,
        vendorId: req.query.vendorId,
        projectId: req.query.projectId,
      };

      // Multi-tenancy enforcement: non-master-admin is scoped to their tenant
      if (req.tenantContext && !req.tenantContext.isMasterAdmin) {
        if (req.tenantContext.vendorId) {
          filters.vendorId = req.tenantContext.vendorId;
        }
        if (req.tenantContext.organizationId) {
          filters.organizationId = req.tenantContext.organizationId;
        }
      }

      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 50;
      const offset = (page - 1) * limit;

      const result = await realtimeService.getLiveWorkforcePresence(filters, { limit, offset });

      return success(
        res,
        result,
        'Live workforce presence retrieved successfully',
        200,
        { page, limit, total: result.total }
      );
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/v1/realtime/broadcast
   * Broadcasts an administrative message or alert across real-time rooms.
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async broadcastMessage(req, res, next) {
    try {
      const payload = {
        ...req.body,
        sender: req.user ? `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || req.user.email : 'System Admin',
      };

      // Restrict vendor scoping if caller is not Master Admin
      if (req.tenantContext && !req.tenantContext.isMasterAdmin && req.tenantContext.vendorId) {
        payload.targetVendorId = req.tenantContext.vendorId;
      }

      const broadcastResult = realtimeService.broadcastAdminMessage(payload);

      return success(
        res,
        broadcastResult,
        'Broadcast message transmitted successfully',
        200
      );
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/v1/realtime/users/:userId/presence
   * Retrieve current live presence status for a specific user.
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async getUserPresence(req, res, next) {
    try {
      const { userId } = req.params;
      const presence = await realtimeService.getUserPresence(userId);

      return success(
        res,
        presence,
        'User presence status retrieved successfully'
      );
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/v1/realtime/workforce/state
   * Update or force a user's operational state (e.g. IN_CALL, WRAP_UP, BREAK, SYNCING).
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async setWorkforceState(req, res, next) {
    try {
      const targetUserId = req.body.userId || req.user.id;
      const { state, channel, projectId, reason, metadata } = req.body;

      const transition = await realtimeService.updateUserState(targetUserId, state, {
        channel,
        projectId,
        reason,
        metadata,
        vendorId: req.user?.vendorId,
        organizationId: req.user?.organizationId,
      });

      return success(
        res,
        transition,
        `Workforce state successfully transitioned to ${state}`,
        200
      );
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/v1/realtime/presence
   * Live active users, live GPS coordinates, battery level, status: ACTIVE/IDLE/OFFLINE,
   * currentAction, idleDuration, lastPingAt with filtering by campaign, vendor, role.
   */
  async getPresence(req, res, next) {
    try {
      const filters = {
        status: req.query.status,
        channel: req.query.channel,
        role: req.query.role,
        vendorId: req.query.vendorId,
        projectId: req.query.projectId || req.query.campaignId,
        search: req.query.search,
      };

      if (req.tenantContext && !req.tenantContext.isMasterAdmin) {
        if (req.tenantContext.vendorId) {
          filters.vendorId = req.tenantContext.vendorId;
        }
        if (req.tenantContext.organizationId) {
          filters.organizationId = req.tenantContext.organizationId;
        }
      }

      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 100;

      const data = await realtimeService.getPresenceRoster(filters, { page, limit });

      return success(
        res,
        data,
        'Live agent presence and GPS coordinates retrieved successfully',
        200,
        {
          page,
          limit,
          total: data.total,
          activeCount: data.activeCount,
          idleCount: data.idleCount,
          offlineCount: data.offlineCount,
        }
      );
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/v1/realtime/ping
   * Heartbeat ping with GPS lat/lng, battery level, status, currentAction, deviceId.
   */
  async pingHeartbeat(req, res, next) {
    try {
      const userId = req.user.id;
      const pingPayload = {
        ...req.body,
        lat: req.body.lat ?? req.body.latitude,
        lng: req.body.lng ?? req.body.longitude,
        batteryLevel: req.body.batteryLevel ?? req.body.battery,
        user: req.user,
        ip: req.ip || req.connection?.remoteAddress,
        userAgent: req.headers['user-agent'],
      };

      const result = await realtimeService.recordPing(userId, pingPayload);

      return success(res, result, 'Heartbeat ping recorded successfully', 200);
    } catch (err) {
      next(err);
    }
  },
};

module.exports = realtimeController;

