/**
 * @file realtime.service.js
 * @description Realtime Presence, Activity & WebSocket gateway manager.
 * Handles client JWT authentication, connection lifecycle, room subscriptions,
 * heartbeat monitoring, operational state transitions, and durable activity event persistence.
 */

const { v4: uuidv4 } = require('uuid');
const { verifyToken } = require('../../utils/crypto');
const config = require('../../config');
const logger = require('../../utils/logger');
const { ValidationError } = require('../../utils/errors');
const realtimeModel = require('./realtime.model');

class RealtimeService {
  constructor() {
    /** @type {import('socket.io').Server|null} */
    this.io = null;

    /**
     * In-memory fast cache for active socket connections.
     * socketId -> { socketId, userId, user, state, channel, role, vendorId, projectId, organizationId, lastHeartbeat, connectedAt }
     * @type {Map<string, object>}
     */
    this.activeSockets = new Map();

    /**
     * Map of userId -> Set of socketIds
     * @type {Map<string, Set<string>>}
     */
    this.userSockets = new Map();

    /**
     * Stale heartbeat check interval timer reference.
     * @type {NodeJS.Timeout|null}
     */
    this.heartbeatTimer = null;

    /**
     * Heartbeat grace period in milliseconds (default 60 seconds).
     */
    this.heartbeatGracePeriodMs = 60 * 1000;
  }

  /**
   * Binds Socket.IO server instance and starts background heartbeat monitoring.
   *
   * @param {import('socket.io').Server} io - Initialized Socket.IO server
   */
  setIo(io) {
    this.io = io;
    this.startHeartbeatMonitor();
    logger.info('[RealtimeService] Socket.IO instance bound and heartbeat monitor started.');
  }

  /**
   * Starts periodic heartbeat check to sweep stale connections.
   */
  startHeartbeatMonitor() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    // Sweep every 30 seconds
    this.heartbeatTimer = setInterval(async () => {
      try {
        await this.sweepStaleHeartbeats();
      } catch (err) {
        logger.error('[RealtimeService] Error during stale heartbeat sweep:', { error: err.message });
      }
    }, 30 * 1000);
  }

  /**
   * Stops background heartbeat monitor on server shutdown.
   */
  stopHeartbeatMonitor() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Authenticates incoming Socket.IO handshake via JWT bearer token.
   *
   * @param {import('socket.io').Socket} socket
   * @param {Function} next
   */
  async authenticateSocket(socket, next) {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, '') ||
        socket.handshake.query?.token;

      if (!token) {
        logger.warn(`[RealtimeService] Socket connection rejected: No auth token provided (${socket.id})`);
        return next(new Error('AUTHENTICATION_ERROR: Token is required for WebSocket connection'));
      }

      const secret = config.jwt.secret || config.jwt.accessSecret;
      const decoded = verifyToken(token, secret);

      if (!decoded || !decoded.userId) {
        logger.warn(`[RealtimeService] Socket connection rejected: Invalid token payload (${socket.id})`);
        return next(new Error('AUTHENTICATION_ERROR: Invalid or expired token'));
      }

      // Attach authenticated user context to socket
      socket.user = {
        id: String(decoded.userId || decoded.id),
        email: decoded.email,
        firstName: decoded.firstName || decoded.first_name,
        lastName: decoded.lastName || decoded.last_name,
        role: (decoded.role || decoded.roleName || 'AGENT').toUpperCase(),
        vendorId: decoded.vendorId || decoded.vendor_id || null,
        projectId: decoded.projectId || decoded.project_id || socket.handshake.query?.projectId || null,
        organizationId: decoded.organizationId || decoded.organization_id || null,
        channel: socket.handshake.query?.channel || realtimeModel.WORKFORCE_CHANNELS.PORTAL,
      };

      return next();
    } catch (err) {
      logger.warn(`[RealtimeService] Handshake authentication failed (${socket.id}): ${err.message}`);
      return next(new Error(`AUTHENTICATION_ERROR: ${err.message}`));
    }
  }

  /**
   * Handles newly established WebSocket connection.
   *
   * @param {import('socket.io').Socket} socket
   */
  async handleConnection(socket) {
    const user = socket.user;
    const socketId = socket.id;
    const sessionId = `SES-${Date.now()}-${uuidv4().slice(0, 8)}`;
    const now = new Date();

    const socketData = {
      sessionId,
      socketId,
      userId: user.id,
      user,
      state: realtimeModel.OPERATIONAL_STATES.ONLINE,
      channel: user.channel || realtimeModel.WORKFORCE_CHANNELS.PORTAL,
      role: user.role,
      vendorId: user.vendorId,
      projectId: user.projectId,
      organizationId: user.organizationId,
      connectedAt: now,
      lastHeartbeat: now,
      stateStartedAt: now,
    };

    // Store in active fast cache
    this.activeSockets.set(socketId, socketData);

    if (!this.userSockets.has(user.id)) {
      this.userSockets.set(user.id, new Set());
    }
    this.userSockets.get(user.id).add(socketId);

    // Join contextual subscription rooms
    socket.join(`user:${user.id}`);
    socket.join('workforce:all');

    const roleName = String(user.role || '').toUpperCase().replace(/\s+/g, '_');
    const isMasterAdmin = roleName === 'MASTER_ADMIN' || roleName === 'SUPER_ADMIN';
    const isOrgAdmin = roleName === 'ORGANIZATION_ADMIN' || roleName === 'ORG_ADMIN' || roleName === 'CLIENT_ADMIN';
    const isVendorAdmin = roleName === 'VENDOR_ADMIN' || roleName.includes('VENDOR');

    if (user.vendorId) {
      socket.join(`vendor:${user.vendorId}`);
      socket.join(`radar:vendor:${user.vendorId}`);
    }
    if (user.organizationId) {
      socket.join(`org:${user.organizationId}`);
      socket.join(`radar:org:${user.organizationId}`);
    }
    if (user.projectId) {
      socket.join(`project:${user.projectId}`);
    }
    if (user.role) {
      socket.join(`role:${user.role}`);
    }

    // Role-based Radar Rooms
    if (isMasterAdmin) {
      socket.join('role:MASTER_ADMIN');
      socket.join('role:SUPER_ADMIN');
      socket.join('radar:live');
    }
    if (isOrgAdmin) {
      socket.join('role:ORGANIZATION_ADMIN');
      socket.join('role:ORG_ADMIN');
      if (user.organizationId) {
        socket.join(`radar:org:${user.organizationId}`);
      }
    }
    if (isVendorAdmin) {
      socket.join('role:VENDOR_ADMIN');
      if (user.vendorId) {
        socket.join(`radar:vendor:${user.vendorId}`);
      }
    }
    if (socketData.channel) {
      socket.join(`channel:${socketData.channel}`);
    }

    logger.info(`[RealtimeService] Client connected: user=${user.email} (${user.id}) [socket=${socketId}] role=${user.role} channel=${socketData.channel}`);

    // Persist session into database
    try {
      await realtimeModel.createPresenceSession({
        id: sessionId,
        userId: user.id,
        socketId,
        vendorId: user.vendorId,
        projectId: user.projectId,
        organizationId: user.organizationId,
        state: realtimeModel.OPERATIONAL_STATES.ONLINE,
        role: user.role,
        channel: socketData.channel,
        connectedAt: now,
        metadata: {
          userAgent: socket.handshake.headers['user-agent'] || null,
          ip: socket.handshake.address || null,
        },
      });

      // Persist durable LOGIN activity event
      await realtimeModel.createActivityEvent({
        id: `ACT-${Date.now()}-${uuidv4().slice(0, 8)}`,
        userId: user.id,
        sessionId,
        vendorId: user.vendorId,
        projectId: user.projectId,
        organizationId: user.organizationId,
        channel: socketData.channel,
        eventType: 'LOGIN',
        previousState: realtimeModel.OPERATIONAL_STATES.OFFLINE,
        currentState: realtimeModel.OPERATIONAL_STATES.ONLINE,
        durationSeconds: 0,
        metadata: { socketId },
      });
    } catch (dbErr) {
      logger.error('[RealtimeService] Database error persisting session:', { error: dbErr.message });
    }

    // Broadcast presence state change across workforce rooms
    this.broadcastPresenceStateChange({
      userId: user.id,
      state: realtimeModel.OPERATIONAL_STATES.ONLINE,
      channel: socketData.channel,
      role: user.role,
      vendorId: user.vendorId,
      projectId: user.projectId,
      timestamp: now.toISOString(),
    });

    // Send connection acknowledgement to connecting client
    socket.emit('presence:connected', {
      sessionId,
      userId: user.id,
      state: realtimeModel.OPERATIONAL_STATES.ONLINE,
      channel: socketData.channel,
      serverTime: now.toISOString(),
    });
  }

  /**
   * Handles client disconnect event.
   *
   * @param {import('socket.io').Socket} socket
   * @param {string} reason
   */
  async handleDisconnect(socket, reason = 'transport close') {
    const socketId = socket.id;
    const socketData = this.activeSockets.get(socketId);

    if (!socketData) {
      return;
    }

    const { userId, sessionId, vendorId, projectId, organizationId, channel, role, stateStartedAt, state } = socketData;
    const now = new Date();
    const durationSeconds = Math.max(0, Math.floor((now.getTime() - new Date(stateStartedAt).getTime()) / 1000));

    // Remove from in-memory cache
    this.activeSockets.delete(socketId);

    const userSocketSet = this.userSockets.get(userId);
    if (userSocketSet) {
      userSocketSet.delete(socketId);
      if (userSocketSet.size === 0) {
        this.userSockets.delete(userId);
      }
    }

    logger.info(`[RealtimeService] Client disconnected: user=${userId} [socket=${socketId}] reason=${reason}`);

    // Update database session
    try {
      await realtimeModel.closeSessionBySocketId(socketId, reason);

      // Check if user has other active sockets. If not, record durable LOGOUT event
      const remainingSockets = this.userSockets.get(userId);
      if (!remainingSockets || remainingSockets.size === 0) {
        await realtimeModel.createActivityEvent({
          id: `ACT-${Date.now()}-${uuidv4().slice(0, 8)}`,
          userId,
          sessionId,
          vendorId,
          projectId,
          organizationId,
          channel,
          eventType: 'LOGOUT',
          previousState: state,
          currentState: realtimeModel.OPERATIONAL_STATES.OFFLINE,
          durationSeconds,
          metadata: { reason, socketId },
        });

        // Broadcast offline state change
        this.broadcastPresenceStateChange({
          userId,
          state: realtimeModel.OPERATIONAL_STATES.OFFLINE,
          channel,
          role,
          vendorId,
          projectId,
          timestamp: now.toISOString(),
          reason,
        });
      }
    } catch (err) {
      logger.error('[RealtimeService] Error persisting session disconnect:', { error: err.message });
    }
  }

  /**
   * Handles incoming heartbeat ping from client.
   *
   * @param {import('socket.io').Socket} socket
   * @param {object} [payload]
   */
  async handleHeartbeat(socket, payload = {}) {
    const socketId = socket.id;
    const socketData = this.activeSockets.get(socketId);

    if (!socketData) {
      return;
    }

    const now = new Date();
    socketData.lastHeartbeat = now;

    // Acknowledge heartbeat back to client
    socket.emit('presence:heartbeat_ack', {
      timestamp: now.toISOString(),
      state: socketData.state,
    });

    // Update database presence session timestamp
    try {
      await realtimeModel.updatePresenceBySocketId(socketId, {
        last_heartbeat_at: now,
      });
    } catch (err) {
      logger.debug(`[RealtimeService] Heartbeat DB touch failed: ${err.message}`);
    }
  }

  /**
   * Updates user operational presence state (e.g. IN_CALL, WRAP_UP, BREAK, SURVEY_IN_PROGRESS).
   * Persists durable event to activity_events table for accurate APR reporting.
   *
   * @param {string} userId - User ID
   * @param {string} newState - Operational state
   * @param {object} [options] - Additional parameters (channel, projectId, reason, metadata, socketId)
   * @returns {Promise<object>} Transition result
   */
  async updateUserState(userId, newState, options = {}) {
    if (!realtimeModel.OPERATIONAL_STATES[newState]) {
      throw new ValidationError(`Invalid operational state: ${newState}`);
    }

    const now = new Date();
    const userSockets = this.userSockets.get(String(userId));
    let previousState = realtimeModel.OPERATIONAL_STATES.ONLINE;
    let sessionId = null;
    let vendorId = options.vendorId || null;
    let projectId = options.projectId || null;
    let organizationId = options.organizationId || null;
    let channel = options.channel || realtimeModel.WORKFORCE_CHANNELS.PORTAL;
    let durationSeconds = 0;

    // Update in-memory sockets for this user
    if (userSockets && userSockets.size > 0) {
      userSockets.forEach((sId) => {
        const sockData = this.activeSockets.get(sId);
        if (sockData) {
          previousState = sockData.state;
          sessionId = sockData.sessionId;
          vendorId = vendorId || sockData.vendorId;
          projectId = projectId || sockData.projectId;
          organizationId = organizationId || sockData.organizationId;
          channel = channel || sockData.channel;

          const elapsed = Math.floor((now.getTime() - new Date(sockData.stateStartedAt).getTime()) / 1000);
          durationSeconds = Math.max(0, elapsed);

          sockData.state = newState;
          sockData.stateStartedAt = now;
          if (options.projectId) sockData.projectId = options.projectId;
          if (options.channel) sockData.channel = options.channel;
        }
      });
    } else {
      // Fetch active session from DB if not in memory
      const dbSession = await realtimeModel.findActiveSessionByUserId(userId);
      if (dbSession) {
        previousState = dbSession.state;
        sessionId = dbSession.id;
        vendorId = vendorId || dbSession.vendor_id;
        projectId = projectId || dbSession.project_id;
        organizationId = organizationId || dbSession.organization_id;
        channel = channel || dbSession.channel;
        const elapsed = Math.floor((now.getTime() - new Date(dbSession.updated_at || dbSession.connected_at).getTime()) / 1000);
        durationSeconds = Math.max(0, elapsed);
      }
    }

    // Persist into presence_sessions table
    try {
      if (sessionId) {
        await realtimeModel.updatePresenceSession(sessionId, {
          state: newState,
          project_id: projectId,
          channel,
        });
      } else {
        await realtimeModel.updatePresenceByUserId(userId, {
          state: newState,
          project_id: projectId,
          channel,
        });
      }

      // Persist durable operational transition event into activity_events table
      const activityEvent = await realtimeModel.createActivityEvent({
        id: `ACT-${Date.now()}-${uuidv4().slice(0, 8)}`,
        userId,
        sessionId,
        vendorId,
        projectId,
        organizationId,
        channel,
        eventType: newState,
        previousState,
        currentState: newState,
        durationSeconds,
        metadata: {
          reason: options.reason || null,
          metadata: options.metadata || {},
        },
      });

      logger.info(`[RealtimeService] Operational transition: user=${userId} [${previousState} -> ${newState}] duration=${durationSeconds}s`);

      // Broadcast state transition across Socket.IO
      this.broadcastPresenceStateChange({
        userId,
        previousState,
        state: newState,
        channel,
        vendorId,
        projectId,
        durationSeconds,
        timestamp: now.toISOString(),
      });

      return {
        userId,
        previousState,
        currentState: newState,
        durationSeconds,
        sessionId,
        activityEvent,
      };
    } catch (err) {
      logger.error('[RealtimeService] Failed to record state transition:', { error: err.message });
      throw err;
    }
  }

  /**
   * Broadcasts presence state change event `presence.state_changed`
   *
   * @param {object} payload
   */
  broadcastPresenceStateChange(payload) {
    if (!this.io) return;

    // Emit to workforce rooms
    this.io.to('workforce:all').emit('presence.state_changed', payload);
    this.io.to(`user:${payload.userId}`).emit('presence.state_changed', payload);

    if (payload.vendorId) {
      this.io.to(`vendor:${payload.vendorId}`).emit('presence.state_changed', payload);
    }
    if (payload.projectId) {
      this.io.to(`project:${payload.projectId}`).emit('presence.state_changed', payload);
    }
    if (payload.channel) {
      this.io.to(`channel:${payload.channel}`).emit('presence.state_changed', payload);
    }
  }

  /**
   * Broadcasts survey progress update `survey.progress`
   *
   * @param {object} payload - Survey progress metadata
   * @returns {Promise<void>}
   */
  async broadcastSurveyProgress(payload) {
    if (!this.io) return;

    const data = {
      ...payload,
      timestamp: new Date().toISOString(),
    };

    if (payload.projectId) {
      this.io.to(`project:${payload.projectId}`).emit('survey.progress', data);
    }
    if (payload.vendorId) {
      this.io.to(`vendor:${payload.vendorId}`).emit('survey.progress', data);
    }
    this.io.to('workforce:all').emit('survey.progress', data);

    // If survey is starting or completing, update presence state
    if (payload.userId && payload.status === 'IN_PROGRESS') {
      try {
        await this.updateUserState(payload.userId, realtimeModel.OPERATIONAL_STATES.SURVEY_IN_PROGRESS, {
          projectId: payload.projectId,
          channel: payload.channel || realtimeModel.WORKFORCE_CHANNELS.CAPI,
          metadata: { submissionId: payload.submissionId },
        });
      } catch (e) {
        logger.debug(`Could not update state for survey progress: ${e.message}`);
      }
    }
  }

  /**
   * Broadcasts dialer telephony call state `call.state_changed`
   *
   * @param {object} payload - Call state details
   * @returns {Promise<void>}
   */
  async broadcastCallStateChanged(payload) {
    if (!this.io) return;

    const data = {
      ...payload,
      timestamp: new Date().toISOString(),
    };

    if (payload.userId) {
      this.io.to(`user:${payload.userId}`).emit('call.state_changed', data);
    }
    if (payload.vendorId) {
      this.io.to(`vendor:${payload.vendorId}`).emit('call.state_changed', data);
    }
    if (payload.projectId) {
      this.io.to(`project:${payload.projectId}`).emit('call.state_changed', data);
    }
    this.io.to('workforce:all').emit('call.state_changed', data);

    // Sync operational state when call connects or finishes
    if (payload.userId) {
      try {
        if (payload.callStatus === 'CONNECTED' || payload.callStatus === 'IN_CALL') {
          await this.updateUserState(payload.userId, realtimeModel.OPERATIONAL_STATES.IN_CALL, {
            projectId: payload.projectId,
            channel: payload.channel || realtimeModel.WORKFORCE_CHANNELS.CATI,
            metadata: { callId: payload.callId },
          });
        } else if (payload.callStatus === 'ENDED' || payload.callStatus === 'DISCONNECTED') {
          await this.updateUserState(payload.userId, realtimeModel.OPERATIONAL_STATES.WRAP_UP, {
            projectId: payload.projectId,
            channel: payload.channel || realtimeModel.WORKFORCE_CHANNELS.CATI,
            metadata: { callId: payload.callId },
          });
        }
      } catch (e) {
        logger.debug(`Could not sync call state to presence: ${e.message}`);
      }
    }
  }

  /**
   * Broadcasts surveyor location GPS updates `location.updated` and `location:updated`
   *
   * @param {object} payload
   */
  broadcastLocationUpdated(payload) {
    if (!this.io) return;

    const data = {
      ...payload,
      lat: payload.lat ?? payload.latitude,
      lng: payload.lng ?? payload.longitude,
      latitude: payload.lat ?? payload.latitude,
      longitude: payload.lng ?? payload.longitude,
      timestamp: payload.timestamp || new Date().toISOString(),
    };

    // Broadcast to global radar room (Super/Master Admin)
    this.io.to('radar:live').emit('location.updated', data);
    this.io.to('radar:live').emit('location:updated', data);
    this.io.to('role:MASTER_ADMIN').emit('location.updated', data);
    this.io.to('role:SUPER_ADMIN').emit('location.updated', data);
    this.io.to('role:SUPERVISOR').emit('location.updated', data);

    // Broadcast to Organization Admin rooms
    if (payload.organizationId) {
      this.io.to(`org:${payload.organizationId}`).emit('location.updated', data);
      this.io.to(`org:${payload.organizationId}`).emit('location:updated', data);
      this.io.to(`radar:org:${payload.organizationId}`).emit('location.updated', data);
      this.io.to(`radar:org:${payload.organizationId}`).emit('location:updated', data);
    }

    // Broadcast to Vendor Admin rooms
    if (payload.vendorId) {
      this.io.to(`vendor:${payload.vendorId}`).emit('location.updated', data);
      this.io.to(`vendor:${payload.vendorId}`).emit('location:updated', data);
      this.io.to(`radar:vendor:${payload.vendorId}`).emit('location.updated', data);
      this.io.to(`radar:vendor:${payload.vendorId}`).emit('location:updated', data);
    }

    // Broadcast to Project specific rooms
    if (payload.projectId) {
      this.io.to(`project:${payload.projectId}`).emit('location.updated', data);
      this.io.to(`project:${payload.projectId}`).emit('location:updated', data);
    }
  }

  /**
   * Broadcasts administrative announcement or alert.
   *
   * @param {object} messagePayload
   * @returns {object} Broadcast dispatch report
   */
  broadcastAdminMessage(messagePayload) {
    if (!this.io) {
      throw new Error('Realtime WebSocket server is not running');
    }

    const payload = {
      id: `BC-${Date.now()}-${uuidv4().slice(0, 6)}`,
      title: messagePayload.title || 'Workforce Announcement',
      message: messagePayload.message,
      type: messagePayload.type || 'INFO',
      sentAt: new Date().toISOString(),
      sender: messagePayload.sender || 'System Administrator',
    };

    let targetRoom = 'workforce:all';
    if (messagePayload.targetRoom) {
      targetRoom = messagePayload.targetRoom;
    } else if (messagePayload.targetUserId) {
      targetRoom = `user:${messagePayload.targetUserId}`;
    } else if (messagePayload.targetProjectId) {
      targetRoom = `project:${messagePayload.targetProjectId}`;
    } else if (messagePayload.targetVendorId) {
      targetRoom = `vendor:${messagePayload.targetVendorId}`;
    } else if (messagePayload.targetRole) {
      targetRoom = `role:${messagePayload.targetRole}`;
    } else if (messagePayload.targetChannel && messagePayload.targetChannel !== 'ALL') {
      targetRoom = `channel:${messagePayload.targetChannel}`;
    }

    this.io.to(targetRoom).emit('system.broadcast', payload);
    logger.info(`[RealtimeService] Admin message broadcasted to room '${targetRoom}': ${payload.title}`);

    return {
      broadcastId: payload.id,
      targetRoom,
      sentAt: payload.sentAt,
      message: payload.message,
    };
  }

  /**
   * Sweeps stale connections that missed heartbeats beyond grace period.
   * Marks them OFFLINE and notifies rooms.
   */
  async sweepStaleHeartbeats() {
    const thresholdDate = new Date(Date.now() - this.heartbeatGracePeriodMs);

    // 1. Check in-memory sockets
    for (const [socketId, data] of this.activeSockets.entries()) {
      if (new Date(data.lastHeartbeat) < thresholdDate) {
        logger.warn(`[RealtimeService] Socket ${socketId} for user ${data.userId} missed heartbeat. Marking OFFLINE.`);

        // Force socket disconnection if still open
        if (this.io && this.io.sockets?.sockets?.get(socketId)) {
          this.io.sockets.sockets.get(socketId).disconnect(true);
        } else {
          // Manually clean up
          this.activeSockets.delete(socketId);
          const userSet = this.userSockets.get(data.userId);
          if (userSet) {
            userSet.delete(socketId);
            if (userSet.size === 0) {
              this.userSockets.delete(data.userId);
            }
          }
        }
      }
    }

    // 2. Mark stale sessions in database
    try {
      const staleSessions = await realtimeModel.markStaleSessionsOffline(thresholdDate);
      for (const session of staleSessions) {
        await realtimeModel.createActivityEvent({
          id: `ACT-${Date.now()}-${uuidv4().slice(0, 8)}`,
          userId: session.user_id,
          sessionId: session.id,
          vendorId: session.vendor_id,
          projectId: session.project_id,
          channel: session.channel,
          eventType: 'OFFLINE',
          previousState: session.state,
          currentState: realtimeModel.OPERATIONAL_STATES.OFFLINE,
          durationSeconds: 0,
          metadata: { reason: 'HEARTBEAT_TIMEOUT' },
        });

        this.broadcastPresenceStateChange({
          userId: session.user_id,
          state: realtimeModel.OPERATIONAL_STATES.OFFLINE,
          channel: session.channel,
          vendorId: session.vendor_id,
          projectId: session.project_id,
          timestamp: new Date().toISOString(),
          reason: 'HEARTBEAT_TIMEOUT',
        });
      }
    } catch (err) {
      logger.error('[RealtimeService] Error sweeping stale sessions from DB:', { error: err.message });
    }
  }

  /**
   * Retrieves live workforce presence summary and active roster.
   *
   * @param {object} filters
   * @param {object} [pagination]
   * @returns {Promise<{ summary: object, liveAgents: Array<object>, total: number }>}
   */
  async getLiveWorkforcePresence(filters = {}, pagination = {}) {
    const [summary, liveAgents] = await Promise.all([
      realtimeModel.getLiveWorkforceSummary(filters),
      realtimeModel.getLivePresenceList(filters, pagination),
    ]);

    return {
      summary,
      liveAgents,
      total: liveAgents.length,
    };
  }

  /**
   * Get single user current presence details.
   *
   * @param {string} userId
   * @returns {Promise<object>}
   */
  async getUserPresence(userId) {
    const userSockets = this.userSockets.get(String(userId));
    const isOnlineInMemory = userSockets && userSockets.size > 0;

    let activeSocketData = null;
    if (isOnlineInMemory) {
      const firstSocketId = Array.from(userSockets)[0];
      activeSocketData = this.activeSockets.get(firstSocketId);
    }

    const session = await realtimeModel.findActiveSessionByUserId(userId);

    return {
      userId: String(userId),
      isOnline: isOnlineInMemory || Boolean(session && !session.disconnected_at),
      state: activeSocketData?.state || session?.state || realtimeModel.OPERATIONAL_STATES.OFFLINE,
      channel: activeSocketData?.channel || session?.channel || null,
      activeSocketsCount: userSockets ? userSockets.size : 0,
      connectedAt: activeSocketData?.connectedAt || session?.connected_at || null,
      lastHeartbeat: activeSocketData?.lastHeartbeat || session?.last_heartbeat_at || null,
      projectId: activeSocketData?.projectId || session?.project_id || null,
      vendorId: activeSocketData?.vendorId || session?.vendor_id || null,
    };
  }

  /**
   * Retrieves comprehensive live presence roster with GPS, battery, current tasks, and idle monitoring.
   *
   * @param {object} filters
   * @param {object} [pagination]
   * @returns {Promise<{ activeUsers: Array<object>, total: number, activeCount: number, idleCount: number, offlineCount: number }>}
   */
  async getPresenceRoster(filters = {}, pagination = {}) {
    return realtimeModel.getDetailedPresenceRoster(filters, pagination);
  }

  /**
   * Records heartbeat ping containing live GPS lat/lng, battery %, status, currentAction, deviceId.
   *
   * @param {string} userId - User ID
   * @param {object} pingData - Ping payload
   * @returns {Promise<object>} Status report
   */
  async recordPing(userId, pingData = {}) {
    const now = new Date();
    const lat = pingData.lat !== undefined ? Number(pingData.lat) : (pingData.latitude !== undefined ? Number(pingData.latitude) : null);
    const lng = pingData.lng !== undefined ? Number(pingData.lng) : (pingData.longitude !== undefined ? Number(pingData.longitude) : null);
    const accuracy = pingData.accuracy ? Number(pingData.accuracy) : (lat !== null ? 4.5 : null);
    const batteryLevel = pingData.batteryLevel !== undefined ? Number(pingData.batteryLevel) : (pingData.battery !== undefined ? Number(pingData.battery) : 85);
    const status = (pingData.status || 'ACTIVE').toUpperCase();
    const currentAction = pingData.currentAction || (status === 'IDLE' ? 'Idle / Standby' : 'Active on Field System');
    const idleDuration = pingData.idleDuration !== undefined ? Number(pingData.idleDuration) : (status === 'IDLE' ? 60 : 0);
    const deviceId = pingData.deviceId || 'DEV-MOBILE-01';
    const projectId = pingData.projectId || pingData.campaignId || null;
    const channel = pingData.channel || 'CAPI';

    // Update in-memory socket cache if present
    const userSockets = this.userSockets.get(String(userId));
    if (userSockets && userSockets.size > 0) {
      userSockets.forEach((sId) => {
        const sockData = this.activeSockets.get(sId);
        if (sockData) {
          sockData.lastHeartbeat = now;
          sockData.state = status;
          sockData.currentAction = currentAction;
          sockData.batteryLevel = batteryLevel;
          sockData.idleDuration = idleDuration;
          if (lat !== null && lng !== null) {
            sockData.gps = { lat, lng, accuracy };
          }
        }
      });
    }

    // Persist or update session in model
    const sessionUpdate = {
      state: status,
      last_heartbeat_at: now,
      metadata: {
        gps: (lat !== null && lng !== null) ? { lat, lng, accuracy } : undefined,
        latitude: lat,
        longitude: lng,
        accuracy,
        batteryLevel,
        currentAction,
        idleDuration,
        deviceId,
        lastPingAt: now.toISOString(),
      },
    };
    if (projectId) sessionUpdate.project_id = projectId;
    if (channel) sessionUpdate.channel = channel;

    await realtimeModel.updatePresenceByUserId(userId, sessionUpdate);

    // Broadcast live telemetry
    if (lat !== null && lng !== null) {
      this.broadcastLocationUpdated({
        userId,
        userName: pingData.userName || `${pingData.user?.first_name || pingData.user?.firstName || ''} ${pingData.user?.last_name || pingData.user?.lastName || ''}`.trim() || pingData.user?.email || 'Field Agent',
        latitude: lat,
        longitude: lng,
        lat,
        lng,
        accuracy,
        speed: pingData.speed || 0,
        heading: pingData.heading || 0,
        batteryLevel,
        status,
        currentAction,
        deviceId,
        projectId,
        vendorId: pingData.vendorId || pingData.user?.vendor_id || pingData.user?.vendorId,
        organizationId: pingData.organizationId || pingData.user?.organization_id || pingData.user?.organizationId,
        timestamp: now.toISOString(),
      });
    }

    this.broadcastPresenceStateChange({
      userId,
      state: status,
      status,
      currentAction,
      batteryLevel,
      deviceId,
      lat,
      lng,
      idleDuration,
      timestamp: now.toISOString(),
    });

    return {
      success: true,
      userId,
      status,
      currentAction,
      batteryLevel,
      latitude: lat,
      longitude: lng,
      deviceId,
      lastPingAt: now.toISOString(),
    };
  }
}


module.exports = new RealtimeService();
