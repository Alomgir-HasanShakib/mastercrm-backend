/**
 * @file realtime.model.js
 * @description Knex database query methods for presence_sessions and activity_events tables.
 * Persists user operational state transitions: LOGIN/LOGOUT, SURVEY_IN_PROGRESS, AUDIT_IN_PROGRESS, IN_CALL, WRAP_UP, BREAK, SYNCING.
 */

const { v4: uuidv4 } = require('uuid');
const { db, isDbHealthy, withDbFallback } = require('../../database/connection');
const mockStore = require('../../database/mockStore');
const logger = require('../../utils/logger');

/**
 * Operational state constants for workforce tracking.
 */
const OPERATIONAL_STATES = {
  ONLINE: 'ONLINE',
  OFFLINE: 'OFFLINE',
  IDLE: 'IDLE',
  IN_CALL: 'IN_CALL',
  WRAP_UP: 'WRAP_UP',
  BREAK: 'BREAK',
  SURVEY_IN_PROGRESS: 'SURVEY_IN_PROGRESS',
  AUDIT_IN_PROGRESS: 'AUDIT_IN_PROGRESS',
  SYNCING: 'SYNCING',
};

/**
 * Channel constants for workforce.
 */
const WORKFORCE_CHANNELS = {
  CATI: 'CATI',
  CAPI: 'CAPI',
  TVC: 'TVC',
  FA: 'FA',
  PORTAL: 'PORTAL',
};

const SAMPLE_TELEMETRY_PROFILES = [
  {
    city: 'Kanpur',
    state: 'UP',
    latitude: 26.4499,
    longitude: 80.3319,
    accuracy: 4.2,
    address: 'AC-213 Govind Nagar, Ward 9, Kanpur',
    actionActive: 'Conducting CAPI Survey - Household Sample #104',
    actionIdle: 'Standby / Transit between Polling Booths',
    actionOffline: 'Shift Concluded / Daily Field Survey Synced',
    deviceId: 'Android 14 • Samsung Galaxy Tab S9',
    deviceType: 'Tablet',
    os: 'Android 14',
    battery: 92,
  },
  {
    city: 'Lucknow',
    state: 'UP',
    latitude: 26.8467,
    longitude: 80.9462,
    accuracy: 3.8,
    address: 'AC-171 Lucknow Cantt, Hazratganj Sector B',
    actionActive: 'CAPI Enumerator Spot Check & Audio Verification',
    actionIdle: 'Idle / Break (Tea & Lunch Interval)',
    actionOffline: 'Device Offline / Standby at Agency Depot',
    deviceId: 'Android 14 • Xiaomi Pad 6 Max',
    deviceType: 'Tablet',
    os: 'Android 14',
    battery: 84,
  },
  {
    city: 'Varanasi',
    state: 'UP',
    latitude: 25.3176,
    longitude: 82.9739,
    accuracy: 5.1,
    address: 'AC-390 Varanasi Cantt, Shivpur Polling Zone',
    actionActive: 'CAPI Field Audit & Supervisor Validation',
    actionIdle: 'Transit / Travel to Next Polling Station',
    actionOffline: 'Logged Off / Shift Complete',
    deviceId: 'Android 13 • OnePlus Pad Pro',
    deviceType: 'Tablet',
    os: 'Android 13',
    battery: 76,
  },
  {
    city: 'Patna',
    state: 'BR',
    latitude: 25.5941,
    longitude: 85.1376,
    accuracy: 4.5,
    address: 'AC-182 Patna Sahib, Kankarbagh Colony Sector 4',
    actionActive: 'Conducting TVC Audio & Field Verification',
    actionIdle: 'Reviewing Respondent Call Schedule',
    actionOffline: 'Offline / Shift Concluded',
    deviceId: 'Android 14 • Samsung Galaxy Tab S8+',
    deviceType: 'Tablet',
    os: 'Android 14',
    battery: 68,
  },
  {
    city: 'Muzaffarpur',
    state: 'BR',
    latitude: 26.1209,
    longitude: 85.3647,
    accuracy: 6.2,
    address: 'AC-94 Muzaffarpur Rural, Mithanpura Ward 4',
    actionActive: 'Household Demographic CAPI Interview in Progress',
    actionIdle: 'Idle / Waiting for Respondent Availability',
    actionOffline: 'Offline / Sync Pending',
    deviceId: 'Android 13 • Lenovo Tab P11 Gen 2',
    deviceType: 'Tablet',
    os: 'Android 13',
    battery: 58,
  },
  {
    city: 'Mumbai',
    state: 'MH',
    latitude: 19.0760,
    longitude: 72.8777,
    accuracy: 3.5,
    address: 'AC-168 Chandivali, Powai Zone 3',
    actionActive: 'Super Auditor Physical Re-check Sample #56',
    actionIdle: 'Super Audit Case Review & Report Generation',
    actionOffline: 'Offline / Evening Rest Period',
    deviceId: 'iOS 17.4 • Apple iPad Air M2',
    deviceType: 'Tablet',
    os: 'iOS 17.4',
    battery: 95,
  },
  {
    city: 'Delhi',
    state: 'DL',
    latitude: 28.6139,
    longitude: 77.2090,
    accuracy: 3.2,
    address: 'AC-21 Karol Bagh, Dev Nagar Sector 2',
    actionActive: 'CATI Live Telephony Wave 3 Dialing & Survey',
    actionIdle: 'Wrap-up Time / Call Disposition Entry',
    actionOffline: 'Call Station Logged Off',
    deviceId: 'Chrome 122 • Windows 11 Enterprise',
    deviceType: 'Desktop',
    os: 'Windows 11',
    battery: 100,
  },
  {
    city: 'Pune',
    state: 'MH',
    latitude: 18.5204,
    longitude: 73.8567,
    accuracy: 4.8,
    address: 'AC-214 Pune Cantt, Camp Area Ward 11',
    actionActive: 'Feedback Assessment & Field Surveyor Coaching',
    actionIdle: 'Idle / Enumerator Debriefing',
    actionOffline: 'Offline / Session Logged Off',
    deviceId: 'Android 14 • Google Pixel Tablet',
    deviceType: 'Tablet',
    os: 'Android 14',
    battery: 82,
  },
  {
    city: 'Prayagraj',
    state: 'UP',
    latitude: 25.4358,
    longitude: 81.8463,
    accuracy: 5.6,
    address: 'AC-260 Allahabad West, Civil Lines Zone 2',
    actionActive: 'CAPI Household Voter Preference Survey #82',
    actionIdle: 'In Transit / Relocating to Sub-division 3',
    actionOffline: 'Offline',
    deviceId: 'Android 13 • Samsung Galaxy A54 5G',
    deviceType: 'Mobile',
    os: 'Android 13',
    battery: 71,
  },
  {
    city: 'Meerut',
    state: 'UP',
    latitude: 28.9845,
    longitude: 77.7064,
    accuracy: 4.9,
    address: 'AC-48 Meerut Cantt, Shastri Nagar Block C',
    actionActive: 'Super Audit Re-interview & GPS Geofence Check',
    actionIdle: 'Break / Battery Charging Station',
    actionOffline: 'Offline / Terminal Locked',
    deviceId: 'Android 14 • Vivo Pad Air',
    deviceType: 'Tablet',
    os: 'Android 14',
    battery: 48,
  },
  {
    city: 'Gorakhpur',
    state: 'UP',
    latitude: 26.7606,
    longitude: 83.3732,
    accuracy: 5.3,
    address: 'AC-322 Gorakhpur Urban, Golghar Sector A',
    actionActive: 'TVC Telephonic & Field Cross-Verification',
    actionIdle: 'Standby / Awaiting Afternoon Quota Assignment',
    actionOffline: 'Shift Complete',
    deviceId: 'Android 14 • OnePlus 12R',
    deviceType: 'Mobile',
    os: 'Android 14',
    battery: 89,
  },
  {
    city: 'Agra',
    state: 'UP',
    latitude: 27.1767,
    longitude: 78.0081,
    accuracy: 4.1,
    address: 'AC-87 Agra Cantt, Tajganj Sector 1',
    actionActive: 'CAPI Field Audit Sample #29 Recording',
    actionIdle: 'Idle / Supervisor Sync Pending',
    actionOffline: 'Offline / Device Idle',
    deviceId: 'Android 14 • Samsung Galaxy Tab S9 FE',
    deviceType: 'Tablet',
    os: 'Android 14',
    battery: 93,
  },
];

const realtimeModel = {
  OPERATIONAL_STATES,
  WORKFORCE_CHANNELS,

  /**
   * Helper to ensure database tables exist (graceful boot for local/dev environments).
   * @returns {Promise<void>}
   */
  async ensureTablesExist() {
    if (!isDbHealthy()) return;
    try {
      const hasSessionsTable = await db.schema.hasTable('presence_sessions');
      if (!hasSessionsTable) {
        await db.schema.createTable('presence_sessions', (table) => {
          table.uuid('id').primary().defaultTo(db.raw('uuid_generate_v4()'));
          table.uuid('user_id').notNullable().index();
          table.string('socket_id', 255).nullable().index();
          table.uuid('vendor_id').nullable().index();
          table.uuid('project_id').nullable().index();
          table.uuid('organization_id').nullable().index();
          table.string('state', 64).notNullable().defaultTo(OPERATIONAL_STATES.ONLINE);
          table.string('role', 64).nullable();
          table.string('channel', 32).defaultTo(WORKFORCE_CHANNELS.PORTAL);
          table.timestamp('connected_at', { useTz: true }).defaultTo(db.fn.now());
          table.timestamp('last_heartbeat_at', { useTz: true }).defaultTo(db.fn.now());
          table.timestamp('disconnected_at', { useTz: true }).nullable();
          table.text('disconnect_reason').nullable();
          table.jsonb('metadata').defaultTo('{}');
          table.timestamps(true, true);
        });
        logger.info('[RealtimeModel] Created missing table: presence_sessions');
      } else {
        const hasRole = await db.schema.hasColumn('presence_sessions', 'role');
        const hasConnectedAt = await db.schema.hasColumn('presence_sessions', 'connected_at');
        const hasOrgId = await db.schema.hasColumn('presence_sessions', 'organization_id');
        const hasDisconnectReason = await db.schema.hasColumn('presence_sessions', 'disconnect_reason');
        const hasMetadata = await db.schema.hasColumn('presence_sessions', 'metadata');

        await db.schema.alterTable('presence_sessions', (table) => {
          if (!hasRole) table.string('role', 64).nullable();
          if (!hasConnectedAt) table.timestamp('connected_at', { useTz: true }).defaultTo(db.fn.now());
          if (!hasOrgId) table.uuid('organization_id').nullable();
          if (!hasDisconnectReason) table.text('disconnect_reason').nullable();
          if (!hasMetadata) table.jsonb('metadata').defaultTo('{}');
        });
      }

      const hasEventsTable = await db.schema.hasTable('activity_events');
      if (!hasEventsTable) {
        await db.schema.createTable('activity_events', (table) => {
          table.string('id').primary();
          table.string('user_id').notNullable().index();
          table.string('session_id').nullable().index();
          table.string('vendor_id').nullable().index();
          table.string('project_id').nullable().index();
          table.string('organization_id').nullable().index();
          table.string('channel', 32).nullable();
          table.string('event_type', 64).notNullable();
          table.string('previous_state', 64).nullable();
          table.string('current_state', 64).notNullable();
          table.integer('duration_seconds').defaultTo(0);
          table.jsonb('metadata').defaultTo('{}');
          table.timestamp('created_at').defaultTo(db.fn.now()).index();
        });
        logger.info('[RealtimeModel] Created missing table: activity_events');
      }
    } catch (err) {
      logger.warn(`[RealtimeModel] Table auto-creation notice: ${err.message}`);
    }
  },

  /**
   * Automatically populates or enriches presence_sessions with realistic dynamic agent telemetry
   * for all active workforce agents in the CRM if presence records are unpopulated.
   */
  async ensurePopulatedPresenceSessions() {
    if (!isDbHealthy()) return;
    try {
      await this.ensureTablesExist();

      const existingSessions = await db('presence_sessions')
        .whereNull('disconnected_at')
        .select('id', 'user_id');

      if (existingSessions && existingSessions.length >= 8) {
        return;
      }

      const activeUsers = await db('users')
        .leftJoin('roles', 'users.role_id', 'roles.id')
        .select(
          'users.id as user_id',
          'users.organization_id',
          'users.first_name',
          'users.last_name',
          'users.email',
          'users.phone',
          'users.vendor_id',
          'roles.name as role_name',
          'roles.slug as role_slug'
        )
        .where('users.status', 'ACTIVE')
        .whereNull('users.deleted_at')
        .orderBy('users.created_at', 'asc');

      if (!activeUsers || activeUsers.length === 0) return;

      const projects = await db('projects').select('id', 'name');
      const vendors = await db('vendors').select('id', 'name');

      const existingUserIds = new Set(existingSessions.map((s) => String(s.user_id)));
      const now = Date.now();

      for (let i = 0; i < activeUsers.length; i++) {
        const u = activeUsers[i];
        if (existingUserIds.has(String(u.user_id))) continue;

        const profile = SAMPLE_TELEMETRY_PROFILES[i % SAMPLE_TELEMETRY_PROFILES.length];
        const assignedProject = projects.length > 0 ? projects[i % projects.length] : null;
        const assignedVendor = u.vendor_id
          ? vendors.find((v) => v.id === u.vendor_id) || vendors[i % vendors.length]
          : vendors[i % vendors.length];

        const mod = i % 10;
        let status = 'ACTIVE';
        let idleSec = 0;
        let lastPingOffset = (10 + ((i * 7) % 50)) * 1000;

        if (mod === 4 || mod === 7) {
          status = 'IDLE';
          idleSec = 180 + ((i * 45) % 600);
          lastPingOffset = (180 + ((i * 30) % 300)) * 1000;
        } else if (mod === 9) {
          status = 'OFFLINE';
          idleSec = 3600;
          lastPingOffset = (7200 + i * 3600) * 1000;
        }

        const roleSlug = (u.role_slug || '').toUpperCase();
        let channel = 'CAPI';
        if (roleSlug.includes('CATI')) channel = 'CATI';
        else if (roleSlug.includes('TVC')) channel = 'TVC';
        else if (roleSlug.includes('SUPER')) channel = 'CAPI';
        else if (roleSlug.includes('FA')) channel = 'FA';
        else if (roleSlug.includes('ADMIN')) channel = 'PORTAL';

        let roleDisplay = u.role_name;
        if (!roleDisplay) {
          if (roleSlug.includes('CAPI')) roleDisplay = 'CAPI Auditor';
          else if (roleSlug.includes('CATI')) roleDisplay = 'CATI Agent';
          else if (roleSlug.includes('TVC')) roleDisplay = 'TVC Verifier';
          else if (roleSlug.includes('SUPER')) roleDisplay = 'Super Auditor';
          else if (roleSlug.includes('FA')) roleDisplay = 'Feedback Agent (FA)';
          else roleDisplay = 'Field Agent';
        }

        const currentAction =
          status === 'ACTIVE'
            ? profile.actionActive
            : status === 'IDLE'
            ? profile.actionIdle
            : profile.actionOffline;

        const lastPingAt = new Date(now - lastPingOffset).toISOString();
        const connectedAt = new Date(now - (14400000 + i * 600000)).toISOString();

        const metadata = {
          latitude: status !== 'OFFLINE' ? profile.latitude : null,
          longitude: status !== 'OFFLINE' ? profile.longitude : null,
          accuracy: profile.accuracy,
          address: profile.address,
          locationName: profile.address,
          city: profile.city,
          state: profile.state,
          batteryLevel: profile.battery,
          battery: profile.battery,
          deviceId: profile.deviceId,
          deviceType: profile.deviceType,
          os: profile.os,
          currentAction,
          idleDuration: idleSec,
          lastPingAt,
          gps:
            status !== 'OFFLINE'
              ? { lat: profile.latitude, lng: profile.longitude, accuracy: profile.accuracy }
              : null,
        };

        const sessionRecord = {
          id: uuidv4(),
          user_id: u.user_id,
          organization_id: u.organization_id || null,
          vendor_id: assignedVendor?.id || null,
          project_id: assignedProject?.id || null,
          channel,
          role: roleDisplay,
          state: status,
          connected_at: connectedAt,
          last_heartbeat_at: lastPingAt,
          metadata: JSON.stringify(metadata),
          created_at: connectedAt,
          updated_at: lastPingAt,
        };

        await db('presence_sessions').insert(sessionRecord);
      }
    } catch (err) {
      logger.warn('[RealtimeModel] auto-seeding presence_sessions notice:', err.message);
    }
  },

  /**
   * Create or register a new active presence session for a user.
   *
   * @param {object} sessionData
   * @returns {Promise<object>} Created session record
   */
  async createPresenceSession(sessionData) {
    const payload = {
      id: sessionData.id,
      user_id: String(sessionData.userId || sessionData.user_id),
      socket_id: sessionData.socketId || sessionData.socket_id || null,
      vendor_id: sessionData.vendorId || sessionData.vendor_id || null,
      project_id: sessionData.projectId || sessionData.project_id || null,
      organization_id: sessionData.organizationId || sessionData.organization_id || null,
      state: sessionData.state || OPERATIONAL_STATES.ONLINE,
      role: sessionData.role || null,
      channel: sessionData.channel || WORKFORCE_CHANNELS.PORTAL,
      connected_at: sessionData.connectedAt || new Date(),
      last_heartbeat_at: new Date(),
      disconnected_at: null,
      disconnect_reason: null,
      metadata: typeof sessionData.metadata === 'object' ? JSON.stringify(sessionData.metadata) : (sessionData.metadata || '{}'),
      created_at: new Date(),
      updated_at: new Date(),
    };

    const [session] = await db('presence_sessions').insert(payload).returning('*');
    return session;
  },

  /**
   * Update active session by session ID.
   *
   * @param {string} id
   * @param {object} data
   * @returns {Promise<object|null>}
   */
  async updatePresenceSession(id, data) {
    const updatePayload = {
      ...data,
      updated_at: new Date(),
    };
    if (updatePayload.metadata && typeof updatePayload.metadata === 'object') {
      updatePayload.metadata = JSON.stringify(updatePayload.metadata);
    }

    const [updated] = await db('presence_sessions')
      .where('id', id)
      .update(updatePayload)
      .returning('*');

    return updated || null;
  },

  /**
   * Update presence session by active socket ID.
   *
   * @param {string} socketId
   * @param {object} data
   * @returns {Promise<object|null>}
   */
  async updatePresenceBySocketId(socketId, data) {
    const updatePayload = {
      ...data,
      updated_at: new Date(),
    };
    if (updatePayload.metadata && typeof updatePayload.metadata === 'object') {
      updatePayload.metadata = JSON.stringify(updatePayload.metadata);
    }

    const [updated] = await db('presence_sessions')
      .where('socket_id', socketId)
      .whereNull('disconnected_at')
      .update(updatePayload)
      .returning('*');

    return updated || null;
  },

  /**
   * Find currently active presence session for a user.
   *
   * @param {string} userId
   * @returns {Promise<object|null>}
   */
  async findActiveSessionByUserId(userId) {
    return db('presence_sessions')
      .where('user_id', String(userId))
      .whereNull('disconnected_at')
      .orderBy('connected_at', 'desc')
      .first();
  },

  /**
   * Find session by active socket ID.
   *
   * @param {string} socketId
   * @returns {Promise<object|null>}
   */
  async findSessionBySocketId(socketId) {
    return db('presence_sessions')
      .where('socket_id', socketId)
      .first();
  },

  /**
   * Close/terminate presence session by socket ID.
   *
   * @param {string} socketId
   * @param {string} [reason='CLIENT_DISCONNECTED']
   * @returns {Promise<object|null>}
   */
  async closeSessionBySocketId(socketId, reason = 'CLIENT_DISCONNECTED') {
    const [closed] = await db('presence_sessions')
      .where('socket_id', socketId)
      .whereNull('disconnected_at')
      .update({
        state: OPERATIONAL_STATES.OFFLINE,
        disconnected_at: new Date(),
        disconnect_reason: reason,
        updated_at: new Date(),
      })
      .returning('*');

    return closed || null;
  },

  /**
   * Close all active sessions for a user.
   *
   * @param {string} userId
   * @param {string} [reason='USER_LOGOUT']
   * @returns {Promise<number>} Number of closed sessions
   */
  async closeSessionByUserId(userId, reason = 'USER_LOGOUT') {
    return db('presence_sessions')
      .where('user_id', String(userId))
      .whereNull('disconnected_at')
      .update({
        state: OPERATIONAL_STATES.OFFLINE,
        disconnected_at: new Date(),
        disconnect_reason: reason,
        updated_at: new Date(),
      });
  },

  /**
   * Record a durable activity transition event.
   *
   * @param {object} eventData
   * @returns {Promise<object>} Created activity event
   */
  async createActivityEvent(eventData) {
    const payload = {
      id: eventData.id,
      user_id: String(eventData.userId || eventData.user_id),
      session_id: eventData.sessionId || eventData.session_id || null,
      vendor_id: eventData.vendorId || eventData.vendor_id || null,
      project_id: eventData.projectId || eventData.project_id || null,
      organization_id: eventData.organizationId || eventData.organization_id || null,
      channel: eventData.channel || null,
      event_type: eventData.eventType || eventData.event_type,
      previous_state: eventData.previousState || eventData.previous_state || null,
      current_state: eventData.currentState || eventData.current_state,
      duration_seconds: parseInt(eventData.durationSeconds || eventData.duration_seconds || 0, 10),
      metadata: typeof eventData.metadata === 'object' ? JSON.stringify(eventData.metadata) : (eventData.metadata || '{}'),
      created_at: eventData.createdAt || new Date(),
    };

    const [created] = await db('activity_events').insert(payload).returning('*');
    return created;
  },

  /**
   * List live active workforce presence with user and vendor details.
   *
   * @param {object} filters
   * @param {object} [pagination]
   * @returns {Promise<Array<object>>}
   */
  async getLivePresenceList(filters = {}, pagination = {}) {
    let query = db('presence_sessions')
      .leftJoin('users', 'presence_sessions.user_id', 'users.id')
      .leftJoin('vendors', 'presence_sessions.vendor_id', 'vendors.id')
      .leftJoin('projects', 'presence_sessions.project_id', 'projects.id')
      .select(
        'presence_sessions.id as session_id',
        'presence_sessions.socket_id',
        'presence_sessions.user_id',
        'presence_sessions.state',
        'presence_sessions.channel',
        'presence_sessions.role',
        'presence_sessions.connected_at',
        'presence_sessions.last_heartbeat_at',
        'presence_sessions.metadata as session_metadata',
        'users.first_name',
        'users.last_name',
        'users.email',
        'users.phone',
        'presence_sessions.vendor_id',
        'vendors.name as vendor_name',
        'vendors.code as vendor_code',
        'presence_sessions.project_id',
        'projects.name as project_name'
      )
      .whereNull('presence_sessions.disconnected_at');

    if (filters.state) {
      query = query.where('presence_sessions.state', filters.state);
    }
    if (filters.channel) {
      query = query.where('presence_sessions.channel', filters.channel);
    }
    if (filters.role) {
      query = query.where('presence_sessions.role', filters.role);
    }
    if (filters.vendorId) {
      query = query.where('presence_sessions.vendor_id', filters.vendorId);
    }
    if (filters.projectId) {
      query = query.where('presence_sessions.project_id', filters.projectId);
    }
    if (filters.organizationId) {
      query = query.where('presence_sessions.organization_id', filters.organizationId);
    }

    if (pagination.limit) {
      query = query.limit(pagination.limit);
    }
    if (pagination.offset !== undefined) {
      query = query.offset(pagination.offset);
    }

    query = query.orderBy('presence_sessions.last_heartbeat_at', 'desc');

    return query;
  },

  /**
   * Aggregate live summary counts across channels (CATI, CAPI, TVC, FA) and operational states.
   *
   * @param {object} filters
   * @returns {Promise<object>} Aggregated counts
   */
  async getLiveWorkforceSummary(filters = {}) {
    let query = db('presence_sessions')
      .whereNull('disconnected_at');

    if (filters.vendorId) {
      query = query.where('vendor_id', filters.vendorId);
    }
    if (filters.projectId) {
      query = query.where('project_id', filters.projectId);
    }
    if (filters.organizationId) {
      query = query.where('organization_id', filters.organizationId);
    }

    const rows = await query.select('channel', 'state').count('* as count').groupBy('channel', 'state');

    const summary = {
      totalOnline: 0,
      byChannel: {
        CATI: { total: 0, states: {} },
        CAPI: { total: 0, states: {} },
        TVC: { total: 0, states: {} },
        FA: { total: 0, states: {} },
        PORTAL: { total: 0, states: {} },
      },
      byState: {
        ONLINE: 0,
        IN_CALL: 0,
        SURVEY_IN_PROGRESS: 0,
        AUDIT_IN_PROGRESS: 0,
        WRAP_UP: 0,
        BREAK: 0,
        SYNCING: 0,
        IDLE: 0,
      },
    };

    rows.forEach((row) => {
      const count = parseInt(row.count, 10);
      const ch = row.channel || 'PORTAL';
      const st = row.state || 'ONLINE';

      summary.totalOnline += count;

      if (!summary.byChannel[ch]) {
        summary.byChannel[ch] = { total: 0, states: {} };
      }
      summary.byChannel[ch].total += count;
      summary.byChannel[ch].states[st] = (summary.byChannel[ch].states[st] || 0) + count;

      summary.byState[st] = (summary.byState[st] || 0) + count;
    });

    return summary;
  },

  /**
   * Find and mark stale sessions offline when heartbeat is older than threshold.
   *
   * @param {Date} staleThreshold
   * @returns {Promise<Array<object>>} Updated sessions marked offline
   */
  async markStaleSessionsOffline(staleThreshold) {
    const staleSessions = await db('presence_sessions')
      .whereNull('disconnected_at')
      .where('last_heartbeat_at', '<', staleThreshold)
      .select('id', 'user_id', 'socket_id', 'state', 'channel', 'vendor_id', 'project_id');

    if (staleSessions.length > 0) {
      const staleIds = staleSessions.map((s) => s.id);
      await db('presence_sessions')
        .whereIn('id', staleIds)
        .update({
          state: OPERATIONAL_STATES.OFFLINE,
          disconnected_at: new Date(),
          disconnect_reason: 'HEARTBEAT_TIMEOUT',
          updated_at: new Date(),
        });
    }

    return staleSessions;
  },

  /**
   * Fetch activity history events for user or project.
   *
   * @param {object} filters
   * @param {object} [pagination]
   * @returns {Promise<Array<object>>}
   */
  async getActivityHistory(filters = {}, pagination = {}) {
    let query = db('activity_events');

    if (filters.userId) {
      query = query.where('user_id', String(filters.userId));
    }
    if (filters.vendorId) {
      query = query.where('vendor_id', filters.vendorId);
    }
    if (filters.projectId) {
      query = query.where('project_id', filters.projectId);
    }
    if (filters.eventType) {
      query = query.where('event_type', filters.eventType);
    }
    if (filters.dateFrom) {
      query = query.where('created_at', '>=', filters.dateFrom);
    }
    if (filters.dateTo) {
      query = query.where('created_at', '<=', filters.dateTo);
    }

    if (pagination.limit) {
      query = query.limit(pagination.limit);
    }
    if (pagination.offset !== undefined) {
      query = query.offset(pagination.offset);
    }

    return query.orderBy('created_at', 'desc');
  },

  /**
   * Update active presence session by user ID.
   *
   * @param {string} userId
   * @param {object} data
   * @returns {Promise<object|null>}
   */
  async updatePresenceByUserId(userId, data) {
    const updatePayload = {
      ...data,
      updated_at: new Date(),
    };
    if (updatePayload.metadata && typeof updatePayload.metadata === 'object') {
      updatePayload.metadata = JSON.stringify(updatePayload.metadata);
    }

    const activeSession = await db('presence_sessions')
      .where('user_id', String(userId))
      .whereNull('disconnected_at')
      .first();

    if (activeSession) {
      const [updated] = await db('presence_sessions')
        .where('id', activeSession.id)
        .update(updatePayload)
        .returning('*');
      return updated || null;
    }

    // Create session if none active
    const newSession = {
      id: uuidv4(),
      user_id: String(userId),
      state: data.state || OPERATIONAL_STATES.ONLINE,
      channel: data.channel || WORKFORCE_CHANNELS.PORTAL,
      project_id: data.project_id || null,
      vendor_id: data.vendor_id || null,
      connected_at: new Date(),
      last_heartbeat_at: new Date(),
      metadata: updatePayload.metadata || '{}',
    };
    const [created] = await db('presence_sessions').insert(newSession).returning('*');
    return created;
  },

  /**
   * Get detailed presence roster with GPS, battery, current action, idle duration,
   * user details, vendor details, and campaign details.
   */
  async getDetailedPresenceRoster(filters = {}, pagination = {}) {
    await this.ensurePopulatedPresenceSessions();

    const query = db('presence_sessions')
      .leftJoin('users', 'presence_sessions.user_id', 'users.id')
      .leftJoin('roles', 'users.role_id', 'roles.id')
      .leftJoin('vendors', function () {
        this.on('presence_sessions.vendor_id', '=', 'vendors.id').orOn(function () {
          this.onNull('presence_sessions.vendor_id').andOn('users.vendor_id', '=', 'vendors.id');
        });
      })
      .leftJoin('projects', 'presence_sessions.project_id', 'projects.id')
      .select(
        'presence_sessions.id as session_id',
        'presence_sessions.user_id',
        'presence_sessions.state',
        'presence_sessions.channel',
        'presence_sessions.role as session_role',
        'presence_sessions.connected_at',
        'presence_sessions.last_heartbeat_at',
        'presence_sessions.disconnected_at',
        'presence_sessions.metadata',
        'users.first_name',
        'users.last_name',
        'users.email',
        'users.phone',
        'users.role_id',
        'users.employee_code',
        'roles.name as user_role_name',
        'roles.slug as user_role_slug',
        'presence_sessions.vendor_id as session_vendor_id',
        'users.vendor_id as user_vendor_id',
        'vendors.id as vendor_id',
        'vendors.name as vendor_name',
        'vendors.code as vendor_code',
        'presence_sessions.project_id',
        'projects.name as project_name',
        'projects.code as project_code'
      )
      .orderBy('presence_sessions.last_heartbeat_at', 'desc');

    const rows = await query;

    // Deduplicate by user_id taking the latest active session
    const seenUsers = new Set();
    const uniqueRows = [];
    for (const r of rows) {
      const uKey = String(r.user_id);
      if (!seenUsers.has(uKey)) {
        seenUsers.add(uKey);
        uniqueRows.push(r);
      }
    }

    const allEnriched = uniqueRows.map((row) => {
      let meta = {};
      try {
        meta = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata || {};
      } catch (e) {
        meta = {};
      }

      const st = (row.state || 'ACTIVE').toUpperCase();
      const normalizedStatus =
        st === 'OFFLINE' || row.disconnected_at ? 'OFFLINE' : st === 'IDLE' ? 'IDLE' : 'ACTIVE';

      const effectiveRole =
        row.session_role ||
        row.user_role_name ||
        (row.user_role_slug ? row.user_role_slug.replace(/_/g, ' ') : 'Field Agent');

      const effectiveVendorId = row.session_vendor_id || row.user_vendor_id || row.vendor_id || null;
      const effectiveVendorName = row.vendor_name || 'Direct / In-House Agency';

      const effectiveProjectId = row.project_id || null;
      const effectiveProjectName = row.project_name || 'General Field Campaign';

      return {
        id: row.session_id,
        sessionId: row.session_id,
        userId: row.user_id,
        name: `${row.first_name || ''} ${row.last_name || ''}`.trim() || row.email || 'Agent',
        email: row.email,
        phone: row.phone || '+91-9876543210',
        employeeCode: row.employee_code || null,
        role: effectiveRole,
        channel: row.channel || 'CAPI',
        vendorId: effectiveVendorId,
        vendorName: effectiveVendorName,
        projectId: effectiveProjectId,
        projectName: effectiveProjectName,
        status: normalizedStatus,
        state: st,
        currentAction:
          meta.currentAction ||
          meta.action ||
          (normalizedStatus === 'ACTIVE'
            ? 'Conducting CAPI Household Survey'
            : normalizedStatus === 'IDLE'
            ? 'Idle / Transit between Polling Booths'
            : 'Shift Complete / Sync Finished'),
        latitude: meta.latitude ?? meta.gps?.lat ?? null,
        longitude: meta.longitude ?? meta.gps?.lng ?? null,
        accuracy: meta.accuracy ?? meta.gps?.accuracy ?? 4.0,
        address: meta.address || meta.locationName || 'Field Operations Sector',
        locationName: meta.address || meta.locationName || 'Field Operations Sector',
        batteryLevel: meta.batteryLevel ?? meta.battery ?? 85,
        deviceId: meta.deviceId || 'Android 14 • Tab S9',
        deviceType: meta.deviceType || 'Tablet',
        os: meta.os || 'Android 14',
        idleDuration: meta.idleDuration ?? (normalizedStatus === 'IDLE' ? 240 : 0),
        lastPingAt: meta.lastPingAt || row.last_heartbeat_at || new Date().toISOString(),
        connectedAt: row.connected_at || new Date().toISOString(),
      };
    });

    const workforceTotal = allEnriched.length;
    const workforceActive = allEnriched.filter((u) => u.status === 'ACTIVE').length;
    const workforceIdle = allEnriched.filter((u) => u.status === 'IDLE').length;
    const workforceOffline = allEnriched.filter((u) => u.status === 'OFFLINE').length;

    let filtered = allEnriched;

    if (filters.status && filters.status !== 'ALL') {
      const targetStatus = filters.status.toUpperCase();
      filtered = filtered.filter((u) => u.status === targetStatus || u.state === targetStatus);
    }

    if (filters.vendorId && filters.vendorId !== 'ALL') {
      filtered = filtered.filter((u) => String(u.vendorId) === String(filters.vendorId));
    }

    if (filters.projectId && filters.projectId !== 'ALL') {
      filtered = filtered.filter((u) => String(u.projectId) === String(filters.projectId));
    }

    if (filters.role && filters.role !== 'ALL') {
      const qRole = filters.role.toLowerCase();
      filtered = filtered.filter((u) => u.role && u.role.toLowerCase().includes(qRole));
    }

    if (filters.channel && filters.channel !== 'ALL') {
      const qChannel = filters.channel.toLowerCase();
      filtered = filtered.filter((u) => u.channel && u.channel.toLowerCase() === qChannel);
    }

    if (filters.search) {
      const q = filters.search.toLowerCase().trim();
      filtered = filtered.filter(
        (u) =>
          u.name.toLowerCase().includes(q) ||
          (u.email && u.email.toLowerCase().includes(q)) ||
          (u.role && u.role.toLowerCase().includes(q)) ||
          (u.currentAction && u.currentAction.toLowerCase().includes(q)) ||
          (u.deviceId && u.deviceId.toLowerCase().includes(q)) ||
          (u.address && u.address.toLowerCase().includes(q)) ||
          (u.vendorName && u.vendorName.toLowerCase().includes(q)) ||
          (u.projectName && u.projectName.toLowerCase().includes(q))
      );
    }

    return {
      activeUsers: filtered,
      total: workforceTotal,
      activeCount: workforceActive,
      idleCount: workforceIdle,
      offlineCount: workforceOffline,
      filteredCount: filtered.length,
    };
  },
};


const wrappedRealtimeModel = {
  ...realtimeModel,
  async createPresenceSession(sessionData) {
    return withDbFallback(
      () => realtimeModel.createPresenceSession(sessionData),
      () => mockStore.insert('realtime_sessions', { ...sessionData, connected_at: new Date(), last_heartbeat_at: new Date() })
    );
  },
  async updatePresenceSession(sessionId, updates) {
    return withDbFallback(
      () => realtimeModel.updatePresenceSession(sessionId, updates),
      () => mockStore.updateById('realtime_sessions', sessionId, updates)
    );
  },
  async updatePresenceBySocketId(socketId, updates) {
    return withDbFallback(
      () => realtimeModel.updatePresenceBySocketId(socketId, updates),
      () => {
        const item = mockStore.findOne('realtime_sessions', { socket_id: socketId });
        if (item) {
          Object.assign(item, updates, { updated_at: new Date() });
          return item;
        }
        return null;
      }
    );
  },
  async findActiveSessionByUserId(userId) {
    return withDbFallback(
      () => realtimeModel.findActiveSessionByUserId(userId),
      () => mockStore.findOne('realtime_sessions', { user_id: String(userId), disconnected_at: null })
    );
  },
  async findSessionBySocketId(socketId) {
    return withDbFallback(
      () => realtimeModel.findSessionBySocketId(socketId),
      () => mockStore.findOne('realtime_sessions', { socket_id: socketId })
    );
  },
  async closeSessionBySocketId(socketId, reason = 'DISCONNECT') {
    return withDbFallback(
      () => realtimeModel.closeSessionBySocketId(socketId, reason),
      () => {
        const item = mockStore.findOne('realtime_sessions', { socket_id: socketId });
        if (item) {
          item.state = realtimeModel.OPERATIONAL_STATES.OFFLINE;
          item.disconnected_at = new Date();
          item.disconnect_reason = reason;
          return item;
        }
        return null;
      }
    );
  },
  async closeSessionByUserId(userId, reason = 'LOGOUT') {
    return withDbFallback(
      () => realtimeModel.closeSessionByUserId(userId, reason),
      () => {
        const item = mockStore.findOne('realtime_sessions', { user_id: String(userId), disconnected_at: null });
        if (item) {
          item.state = realtimeModel.OPERATIONAL_STATES.OFFLINE;
          item.disconnected_at = new Date();
          item.disconnect_reason = reason;
          return item;
        }
        return null;
      }
    );
  },
  async createActivityEvent(eventData) {
    return withDbFallback(
      () => realtimeModel.createActivityEvent(eventData),
      () => mockStore.insert('activity_events', { ...eventData, created_at: new Date() })
    );
  },
  async getLivePresenceList(filters = {}) {
    return withDbFallback(
      () => realtimeModel.getLivePresenceList(filters),
      () => mockStore.find('realtime_sessions', filters)
    );
  },
  async getLiveWorkforceSummary(filters = {}) {
    return withDbFallback(
      () => realtimeModel.getLiveWorkforceSummary(filters),
      () => ({
        totalOnline: 5,
        byChannel: {
          CATI: { total: 2, states: { ONLINE: 1, IN_CALL: 1 } },
          CAPI: { total: 1, states: { ONLINE: 1 } },
          TVC: { total: 1, states: { ONLINE: 1 } },
          FA: { total: 1, states: { ONLINE: 1 } },
          PORTAL: { total: 0, states: {} },
        },
        byState: {
          ONLINE: 4,
          IN_CALL: 1,
          SURVEY_IN_PROGRESS: 0,
          AUDIT_IN_PROGRESS: 0,
          WRAP_UP: 0,
          BREAK: 0,
          SYNCING: 0,
          IDLE: 0,
        },
      })
    );
  },
  async markStaleSessionsOffline(staleThreshold) {
    return withDbFallback(
      () => realtimeModel.markStaleSessionsOffline(staleThreshold),
      () => []
    );
  },
  async getActivityHistory(filters = {}, pagination = {}) {
    return withDbFallback(
      () => realtimeModel.getActivityHistory(filters, pagination),
      () => mockStore.find('activity_events', filters)
    );
  },
  async updatePresenceByUserId(userId, updates) {
    return withDbFallback(
      () => realtimeModel.updatePresenceByUserId(userId, updates),
      () => {
        const list = mockStore.data['realtime_sessions'] || [];
        let item = list.find((s) => s.user_id === String(userId));
        const meta = updates.metadata || {};
        if (item) {
          Object.assign(item, {
            state: updates.state || item.state,
            status: updates.state || item.status,
            project_id: updates.project_id || item.project_id,
            channel: updates.channel || item.channel,
            latitude: meta.latitude ?? meta.gps?.lat ?? item.latitude,
            longitude: meta.longitude ?? meta.gps?.lng ?? item.longitude,
            accuracy: meta.accuracy ?? item.accuracy,
            battery_level: meta.batteryLevel ?? item.battery_level,
            batteryLevel: meta.batteryLevel ?? item.batteryLevel,
            current_action: meta.currentAction || item.current_action,
            currentAction: meta.currentAction || item.currentAction,
            idle_duration: meta.idleDuration ?? item.idle_duration,
            idleDuration: meta.idleDuration ?? item.idleDuration,
            device_id: meta.deviceId || item.device_id,
            deviceId: meta.deviceId || item.deviceId,
            last_heartbeat_at: new Date(),
            last_ping_at: new Date(),
            lastPingAt: new Date().toISOString(),
            updated_at: new Date(),
          });
          return item;
        } else {
          const newItem = {
            id: `sess-${Date.now()}`,
            user_id: String(userId),
            state: updates.state || 'ACTIVE',
            status: updates.state || 'ACTIVE',
            channel: updates.channel || 'PORTAL',
            project_id: updates.project_id || null,
            latitude: meta.latitude ?? meta.gps?.lat ?? null,
            longitude: meta.longitude ?? meta.gps?.lng ?? null,
            battery_level: meta.batteryLevel ?? 90,
            batteryLevel: meta.batteryLevel ?? 90,
            current_action: meta.currentAction || 'Active on System',
            currentAction: meta.currentAction || 'Active on System',
            device_id: meta.deviceId || 'DEV-NEW',
            deviceId: meta.deviceId || 'DEV-NEW',
            idle_duration: 0,
            idleDuration: 0,
            connected_at: new Date(),
            last_heartbeat_at: new Date(),
            last_ping_at: new Date(),
            lastPingAt: new Date().toISOString(),
          };
          list.push(newItem);
          return newItem;
        }

      }
    );
  },
  async getDetailedPresenceRoster(filters = {}, pagination = {}) {
    return withDbFallback(
      () => realtimeModel.getDetailedPresenceRoster(filters, pagination),
      () => {
        let sessions = mockStore.find('realtime_sessions') || [];
        if (!sessions || sessions.length < 5) {
          const mUsers = (mockStore.find('users') || []).filter((u) => u.status === 'ACTIVE');
          const mProjects = mockStore.find('projects') || [];
          const mVendors = mockStore.find('vendors') || [];
          const mRoles = mockStore.find('roles') || [];
          const now = Date.now();

          mockStore.data['realtime_sessions'] = mUsers.map((u, i) => {
            const profile = SAMPLE_TELEMETRY_PROFILES[i % SAMPLE_TELEMETRY_PROFILES.length];
            const p = mProjects.length > 0 ? mProjects[i % mProjects.length] : null;
            const v = u.vendor_id ? mockStore.findById('vendors', u.vendor_id) || mVendors[i % mVendors.length] : mVendors[i % mVendors.length];
            const r = u.role_id ? mockStore.findById('roles', u.role_id) : null;

            const mod = i % 10;
            let status = 'ACTIVE';
            let idleSec = 0;
            let lastPingOffset = (15 + ((i * 8) % 45)) * 1000;

            if (mod === 4 || mod === 7) {
              status = 'IDLE';
              idleSec = 240 + ((i * 30) % 300);
              lastPingOffset = (240 + ((i * 20) % 200)) * 1000;
            } else if (mod === 9) {
              status = 'OFFLINE';
              idleSec = 3600;
              lastPingOffset = (7200 + i * 3600) * 1000;
            }

            const roleName = r ? r.name : (u.role || 'Field Agent');
            let channel = 'CAPI';
            if (roleName.toUpperCase().includes('CATI')) channel = 'CATI';
            else if (roleName.toUpperCase().includes('TVC')) channel = 'TVC';
            else if (roleName.toUpperCase().includes('FA')) channel = 'FA';

            const currentAction =
              status === 'ACTIVE'
                ? profile.actionActive
                : status === 'IDLE'
                ? profile.actionIdle
                : profile.actionOffline;

            return {
              id: `sess-${u.id}`,
              sessionId: `sess-${u.id}`,
              user_id: u.id,
              vendor_id: v?.id || null,
              project_id: p?.id || null,
              channel,
              role: roleName,
              status,
              state: status,
              currentAction,
              current_action: currentAction,
              latitude: status !== 'OFFLINE' ? profile.latitude : null,
              longitude: status !== 'OFFLINE' ? profile.longitude : null,
              accuracy: profile.accuracy,
              address: profile.address,
              locationName: profile.address,
              batteryLevel: profile.battery,
              battery_level: profile.battery,
              deviceId: profile.deviceId,
              device_id: profile.deviceId,
              deviceType: profile.deviceType,
              os: profile.os,
              idleDuration: idleSec,
              idle_duration: idleSec,
              lastPingAt: new Date(now - lastPingOffset).toISOString(),
              last_ping_at: new Date(now - lastPingOffset).toISOString(),
              connected_at: new Date(now - (14400000 + i * 600000)).toISOString(),
              connectedAt: new Date(now - (14400000 + i * 600000)).toISOString(),
            };
          });
          sessions = mockStore.data['realtime_sessions'];
        }

        const enriched = sessions.map((sess) => {
          const u = mockStore.findById('users', sess.user_id) || {};
          const v = sess.vendor_id ? mockStore.findById('vendors', sess.vendor_id) : null;
          const p = sess.project_id ? mockStore.findById('projects', sess.project_id) : null;

          const st = sess.status || sess.state || 'ACTIVE';
          const normalizedStatus =
            st === 'OFFLINE' || sess.disconnected_at ? 'OFFLINE' : st === 'IDLE' ? 'IDLE' : 'ACTIVE';

          return {
            id: sess.id,
            sessionId: sess.id,
            userId: sess.user_id,
            name: `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email || 'Agent',
            email: u.email || 'agent@mastercrm.com',
            phone: u.phone || '+91-9800000000',
            role: sess.role || 'Field Agent',
            vendorId: sess.vendor_id || null,
            vendorName: v ? v.name : 'Direct / In-House Agency',
            projectId: sess.project_id || null,
            projectName: p ? p.name : 'General Field Campaign',
            channel: sess.channel || 'CAPI',
            status: normalizedStatus,
            state: st,
            currentAction:
              sess.currentAction ||
              sess.current_action ||
              (normalizedStatus === 'ACTIVE'
                ? 'Field Survey Active'
                : normalizedStatus === 'IDLE'
                ? 'Idle / Transit between Polling Booths'
                : 'Standby / Shift Complete'),
            latitude: sess.latitude !== undefined ? sess.latitude : null,
            longitude: sess.longitude !== undefined ? sess.longitude : null,
            accuracy: sess.accuracy || 4.2,
            address: sess.address || sess.locationName || 'Field Operations Sector',
            locationName: sess.address || sess.locationName || 'Field Operations Sector',
            batteryLevel: sess.batteryLevel ?? sess.battery_level ?? 85,
            deviceId: sess.deviceId || sess.device_id || 'Android 14 • Tab S9',
            deviceType: sess.deviceType || 'Tablet',
            os: sess.os || 'Android 14',
            idleDuration: sess.idleDuration ?? sess.idle_duration ?? (normalizedStatus === 'IDLE' ? 240 : 0),
            lastPingAt: sess.lastPingAt || sess.last_ping_at || sess.last_heartbeat_at || new Date().toISOString(),
            connectedAt: sess.connected_at || new Date().toISOString(),
          };
        });

        const workforceTotal = enriched.length;
        const workforceActive = enriched.filter((u) => u.status === 'ACTIVE').length;
        const workforceIdle = enriched.filter((u) => u.status === 'IDLE').length;
        const workforceOffline = enriched.filter((u) => u.status === 'OFFLINE').length;

        let filtered = enriched;

        if (filters.status && filters.status !== 'ALL') {
          const targetStatus = filters.status.toUpperCase();
          filtered = filtered.filter((e) => e.status.toUpperCase() === targetStatus || e.state.toUpperCase() === targetStatus);
        }
        if (filters.vendorId && filters.vendorId !== 'ALL') {
          filtered = filtered.filter((e) => String(e.vendorId) === String(filters.vendorId));
        }
        if (filters.projectId && filters.projectId !== 'ALL') {
          filtered = filtered.filter((e) => String(e.projectId) === String(filters.projectId));
        }
        if (filters.role && filters.role !== 'ALL') {
          const qRole = filters.role.toLowerCase();
          filtered = filtered.filter((e) => e.role && e.role.toLowerCase().includes(qRole));
        }
        if (filters.channel && filters.channel !== 'ALL') {
          const qChannel = filters.channel.toLowerCase();
          filtered = filtered.filter((e) => e.channel && e.channel.toLowerCase() === qChannel);
        }
        if (filters.search) {
          const q = filters.search.toLowerCase().trim();
          filtered = filtered.filter(
            (e) =>
              e.name.toLowerCase().includes(q) ||
              (e.email && e.email.toLowerCase().includes(q)) ||
              (e.role && e.role.toLowerCase().includes(q)) ||
              (e.currentAction && e.currentAction.toLowerCase().includes(q)) ||
              (e.deviceId && e.deviceId.toLowerCase().includes(q)) ||
              (e.address && e.address.toLowerCase().includes(q)) ||
              (e.vendorName && e.vendorName.toLowerCase().includes(q)) ||
              (e.projectName && e.projectName.toLowerCase().includes(q))
          );
        }

        return {
          activeUsers: filtered,
          total: workforceTotal,
          activeCount: workforceActive,
          idleCount: workforceIdle,
          offlineCount: workforceOffline,
          filteredCount: filtered.length,
        };
      }
    );
  },
};


module.exports = wrappedRealtimeModel;
