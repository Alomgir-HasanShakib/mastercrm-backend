/**
 * @file realtime.socket.js
 * @description Socket.IO server initialization, WebSocket middleware, and real-time event wiring.
 */

const { Server } = require('socket.io');
const config = require('../../config');
const logger = require('../../utils/logger');
const realtimeService = require('./realtime.service');
const realtimeModel = require('./realtime.model');

let ioInstance = null;

/**
 * Initializes Socket.IO server mounted on the provided HTTP server.
 *
 * @param {import('http').Server} httpServer - Node.js HTTP server
 * @returns {import('socket.io').Server} Initialized Socket.IO instance
 */
function initSocketServer(httpServer) {
  if (ioInstance) {
    logger.warn('[SocketServer] Socket.IO server already initialized. Returning existing instance.');
    return ioInstance;
  }

  // Gracefully ensure database tables exist in background
  realtimeModel.ensureTablesExist().catch((err) => {
    logger.warn(`[SocketServer] Table verification error: ${err.message}`);
  });

  const corsOrigins = config.cors?.origin || ['http://localhost:3000', 'http://127.0.0.1:3000'];

  const io = new Server(httpServer, {
    path: '/socket.io',
    cors: {
      origin: corsOrigins,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingInterval: 25000,
    pingTimeout: 20000,
    transports: ['websocket', 'polling'],
  });

  // 1. Handshake authentication middleware
  io.use(async (socket, next) => {
    await realtimeService.authenticateSocket(socket, next);
  });

  // 2. Wire connection lifecycle and event listeners
  io.on('connection', async (socket) => {
    try {
      await realtimeService.handleConnection(socket);
    } catch (err) {
      logger.error(`[SocketServer] Error in handleConnection (${socket.id}): ${err.message}`);
    }

    // Client heartbeat ping
    socket.on('presence:heartbeat', async (payload) => {
      try {
        await realtimeService.handleHeartbeat(socket, payload);
      } catch (err) {
        logger.error(`[SocketServer] Error handling heartbeat from ${socket.id}: ${err.message}`);
      }
    });

    // Client state change request (e.g. agent toggling BREAK, IDLE, READY)
    socket.on('presence:state_change', async (data, ackCallback) => {
      try {
        const { state, channel, projectId, reason, metadata } = data || {};
        const result = await realtimeService.updateUserState(socket.user.id, state, {
          channel: channel || socket.user.channel,
          projectId: projectId || socket.user.projectId,
          vendorId: socket.user.vendorId,
          organizationId: socket.user.organizationId,
          reason,
          metadata,
          socketId: socket.id,
        });

        if (typeof ackCallback === 'function') {
          ackCallback({ success: true, data: result });
        }
      } catch (err) {
        logger.error(`[SocketServer] Error in state_change from ${socket.id}: ${err.message}`);
        if (typeof ackCallback === 'function') {
          ackCallback({ success: false, error: err.message });
        }
      }
    });

    // Survey progress streaming
    socket.on('survey:progress', async (data) => {
      try {
        await realtimeService.broadcastSurveyProgress({
          ...data,
          userId: socket.user.id,
          vendorId: socket.user.vendorId,
        });
      } catch (err) {
        logger.error(`[SocketServer] Error in survey:progress: ${err.message}`);
      }
    });

    // Call state streaming from CATI dialer client
    socket.on('call:state_changed', async (data) => {
      try {
        await realtimeService.broadcastCallStateChanged({
          ...data,
          userId: socket.user.id,
          vendorId: socket.user.vendorId,
        });
      } catch (err) {
        logger.error(`[SocketServer] Error in call:state_changed: ${err.message}`);
      }
    });

    // Field surveyor GPS location updates via WebSocket
    const handleLocationUpdate = async (data = {}) => {
      try {
        const lat = data.lat ?? data.latitude;
        const lng = data.lng ?? data.longitude;
        if (lat === undefined || lng === undefined || lat === null || lng === null) return;

        const updatePayload = {
          ...data,
          lat: Number(lat),
          lng: Number(lng),
          latitude: Number(lat),
          longitude: Number(lng),
          accuracy: data.accuracy || 15,
          speed: data.speed || 0,
          heading: data.heading || 0,
          batteryLevel: data.batteryLevel ?? data.battery ?? 100,
          status: data.status || 'ACTIVE',
          currentAction: data.currentAction || 'Active Telemetry',
          userId: socket.user.id,
          userName: `${socket.user.first_name || socket.user.firstName || ''} ${socket.user.last_name || socket.user.lastName || ''}`.trim() || socket.user.email,
          role: socket.user.role,
          vendorId: data.vendorId || socket.user.vendor_id || socket.user.vendorId,
          organizationId: data.organizationId || socket.user.organization_id || socket.user.organizationId,
          projectId: data.projectId || socket.user.project_id || socket.user.projectId,
          timestamp: new Date().toISOString(),
        };

        // Broadcast to authorized radar watchers in real-time
        realtimeService.broadcastLocationUpdated(updatePayload);

        // Also persist location update asynchronously in DB/model
        realtimeModel.updatePresenceByUserId(socket.user.id, {
          state: updatePayload.status,
          last_heartbeat_at: new Date(),
          metadata: {
            gps: { lat: updatePayload.lat, lng: updatePayload.lng, accuracy: updatePayload.accuracy },
            latitude: updatePayload.lat,
            longitude: updatePayload.lng,
            accuracy: updatePayload.accuracy,
            speed: updatePayload.speed,
            heading: updatePayload.heading,
            batteryLevel: updatePayload.batteryLevel,
            currentAction: updatePayload.currentAction,
            lastPingAt: updatePayload.timestamp,
          },
        }).catch((e) => logger.debug(`[SocketServer] Location persistence notice: ${e.message}`));
      } catch (err) {
        logger.error(`[SocketServer] Error in location update handler: ${err.message}`);
      }
    };

    socket.on('location:updated', handleLocationUpdate);
    socket.on('location.updated', handleLocationUpdate);
    socket.on('agent:location', handleLocationUpdate);

    // Dedicated Radar Live Subscription
    socket.on('radar:subscribe', (options = {}) => {
      const roleName = String(socket.user?.role || '').toUpperCase().replace(/\s+/g, '_');
      const isMasterAdmin = roleName === 'MASTER_ADMIN' || roleName === 'SUPER_ADMIN';
      const isOrgAdmin = roleName === 'ORGANIZATION_ADMIN' || roleName === 'ORG_ADMIN' || roleName === 'CLIENT_ADMIN';
      const isVendorAdmin = roleName === 'VENDOR_ADMIN' || roleName.includes('VENDOR');

      if (isMasterAdmin) {
        socket.join('radar:live');
        socket.join('workforce:all');
      } else if (isOrgAdmin && (socket.user.organizationId || socket.user.organization_id)) {
        const orgId = socket.user.organizationId || socket.user.organization_id;
        socket.join(`radar:org:${orgId}`);
        socket.join(`org:${orgId}`);
      } else if (isVendorAdmin && (socket.user.vendorId || socket.user.vendor_id)) {
        const vId = socket.user.vendorId || socket.user.vendor_id;
        socket.join(`radar:vendor:${vId}`);
        socket.join(`vendor:${vId}`);
      }
      logger.debug(`[SocketServer] User ${socket.user?.id} (${roleName}) subscribed to radar channels.`);
    });

    // Custom room subscription
    socket.on('room:join', (roomName) => {
      if (typeof roomName === 'string' && roomName.trim()) {
        socket.join(roomName.trim());
        logger.debug(`[SocketServer] Socket ${socket.id} joined custom room: ${roomName}`);
      }
    });

    socket.on('room:leave', (roomName) => {
      if (typeof roomName === 'string' && roomName.trim()) {
        socket.leave(roomName.trim());
        logger.debug(`[SocketServer] Socket ${socket.id} left room: ${roomName}`);
      }
    });

    // Disconnect event
    socket.on('disconnect', async (reason) => {
      try {
        await realtimeService.handleDisconnect(socket, reason);
      } catch (err) {
        logger.error(`[SocketServer] Error in handleDisconnect (${socket.id}): ${err.message}`);
      }
    });

    // Socket error handler
    socket.on('error', (err) => {
      logger.error(`[SocketServer] Socket error on ${socket.id}: ${err.message}`);
    });
  });

  // Bind io instance to service
  realtimeService.setIo(io);
  ioInstance = io;

  logger.info('⚡ Socket.IO real-time WebSocket server initialized successfully.');
  return io;
}

/**
 * Returns active Socket.IO server instance.
 *
 * @returns {import('socket.io').Server|null}
 */
function getIo() {
  return ioInstance;
}

/**
 * Gracefully shuts down Socket.IO server.
 *
 * @returns {Promise<void>}
 */
async function closeSocketServer() {
  realtimeService.stopHeartbeatMonitor();
  if (ioInstance) {
    return new Promise((resolve) => {
      ioInstance.close(() => {
        logger.info('[SocketServer] Socket.IO server terminated.');
        ioInstance = null;
        resolve();
      });
    });
  }
}

module.exports = {
  initSocketServer,
  getIo,
  closeSocketServer,
};
