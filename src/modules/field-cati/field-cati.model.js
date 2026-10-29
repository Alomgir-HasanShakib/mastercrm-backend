/**
 * @file field-cati.model.js
 * @description Knex database query methods for Field CATI, offline sync logs, agent location GPS trails, audio chunk manifests, and device registrations.
 */

const { db, isDbHealthy, withDbFallback } = require('../../database/connection');
const mockStore = require('../../database/mockStore');
const logger = require('../../utils/logger');

/**
 * Ensures table existence dynamically so field operations run seamlessly
 * across all database environments.
 */
let tablesInitialized = false;

const ensureTablesExist = async () => {
  if (tablesInitialized || !isDbHealthy()) return;

  try {
    // 1. device_registrations
    const hasDeviceTable = await db.schema.hasTable('device_registrations');
    if (!hasDeviceTable) {
      await db.schema.createTable('device_registrations', (table) => {
        table.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
        table.string('device_id', 128).unique().notNullable();
        table.string('hardware_uuid', 128).nullable();
        table.uuid('user_id').nullable();
        table.uuid('vendor_id').nullable();
        table.string('device_model', 100).nullable();
        table.string('os_version', 50).nullable();
        table.string('app_version', 50).nullable();
        table.string('fcm_token', 512).nullable();
        table.string('status', 30).defaultTo('ACTIVE');
        table.timestamp('last_sync_at').nullable();
        table.jsonb('metadata').defaultTo('{}');
        table.timestamps(true, true);
        table.index(['device_id', 'user_id', 'status']);
      });
    }

    // 2. field_assignments
    const hasFieldAssignmentsTable = await db.schema.hasTable('field_assignments');
    if (!hasFieldAssignmentsTable) {
      await db.schema.createTable('field_assignments', (table) => {
        table.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
        table.string('assignment_code', 64).unique().notNullable();
        table.uuid('project_id').notNullable();
        table.uuid('vendor_id').nullable();
        table.uuid('surveyor_id').notNullable();
        table.uuid('state_id').nullable();
        table.string('ac_id', 64).nullable(); // Assembly Constituency
        table.string('pc_id', 64).nullable(); // Parliamentary Constituency
        table.string('sep_id', 64).nullable(); // Socio-Economic Pocket
        table.integer('target_quota').defaultTo(100);
        table.integer('completed_count').defaultTo(0);
        table.jsonb('boundary_geojson').nullable();
        table.string('status', 30).defaultTo('ASSIGNED');
        table.timestamp('start_date').nullable();
        table.timestamp('end_date').nullable();
        table.jsonb('metadata').defaultTo('{}');
        table.timestamps(true, true);
        table.index(['surveyor_id', 'project_id', 'status']);
      });
    }

    // 3. agent_gps_events
    const hasGpsTable = await db.schema.hasTable('agent_gps_events');
    if (!hasGpsTable) {
      await db.schema.createTable('agent_gps_events', (table) => {
        table.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
        table.string('event_id', 128).nullable();
        table.uuid('surveyor_id').notNullable();
        table.uuid('project_id').nullable();
        table.string('device_id', 128).nullable();
        table.string('submission_id', 128).nullable();
        table.decimal('latitude', 10, 7).notNullable();
        table.decimal('longitude', 10, 7).notNullable();
        table.decimal('altitude', 8, 2).nullable();
        table.decimal('accuracy', 8, 2).nullable();
        table.decimal('speed', 8, 2).nullable();
        table.decimal('heading', 8, 2).nullable();
        table.integer('battery_level').nullable();
        table.string('network_type', 30).nullable();
        table.boolean('is_mock_location').defaultTo(false);
        table.timestamp('recorded_at').notNullable().defaultTo(db.fn.now());
        table.timestamps(true, true);
        table.index(['surveyor_id', 'recorded_at']);
        table.index(['project_id', 'recorded_at']);
      });
    }

    // 4. audio_chunk_manifests
    const hasAudioManifestTable = await db.schema.hasTable('audio_chunk_manifests');
    if (!hasAudioManifestTable) {
      await db.schema.createTable('audio_chunk_manifests', (table) => {
        table.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
        table.string('recording_id', 128).notNullable();
        table.string('submission_id', 128).nullable();
        table.string('client_submission_id', 128).nullable();
        table.uuid('project_id').nullable();
        table.uuid('surveyor_id').nullable();
        table.integer('chunk_index').notNullable();
        table.integer('total_chunks').notNullable();
        table.integer('chunk_size_bytes').notNullable();
        table.string('sha256_hash', 64).notNullable();
        table.string('storage_path', 512).nullable();
        table.string('storage_url', 512).nullable();
        table.string('status', 30).defaultTo('RECEIVED'); // RECEIVED, VERIFIED, ASSEMBLED, FAILED
        table.timestamps(true, true);
        table.unique(['recording_id', 'chunk_index']);
        table.index(['recording_id', 'status']);
      });
    }

    // 5. offline_sync_logs
    const hasSyncLogsTable = await db.schema.hasTable('offline_sync_logs');
    if (!hasSyncLogsTable) {
      await db.schema.createTable('offline_sync_logs', (table) => {
        table.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
        table.string('batch_id', 128).unique().notNullable();
        table.uuid('vendor_id').nullable();
        table.uuid('project_id').nullable();
        table.uuid('surveyor_id').nullable();
        table.string('device_id', 128).nullable();
        table.integer('total_records').defaultTo(0);
        table.integer('successful_records').defaultTo(0);
        table.integer('failed_records').defaultTo(0);
        table.integer('conflicts_count').defaultTo(0);
        table.string('sync_status', 30).defaultTo('SUCCESS'); // SUCCESS, PARTIAL, FAILED
        table.jsonb('sync_details').defaultTo('{}');
        table.timestamp('client_timestamp').nullable();
        table.timestamp('server_timestamp').defaultTo(db.fn.now());
        table.timestamps(true, true);
        table.index(['surveyor_id', 'created_at']);
        table.index(['project_id', 'sync_status']);
      });
    }

    // 6. submission_values
    const hasSubmissionValues = await db.schema.hasTable('submission_values');
    if (!hasSubmissionValues) {
      await db.schema.createTable('submission_values', (table) => {
        table.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
        table.string('submission_id', 128).notNullable().index();
        table.string('question_tag', 100).notNullable().index();
        table.text('response_value').nullable();
        table.jsonb('response_metadata').nullable().defaultTo('{}');
        table.timestamp('answered_at').nullable();
        table.timestamps(true, true);
      });
    }

    // 7. audio_sessions
    const hasAudioSessions = await db.schema.hasTable('audio_sessions');
    if (!hasAudioSessions) {
      await db.schema.createTable('audio_sessions', (table) => {
        table.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
        table.string('submission_id', 128).notNullable().index();
        table.uuid('project_id').nullable().index();
        table.uuid('surveyor_id').nullable().index();
        table.text('storage_path').nullable();
        table.text('storage_url').nullable();
        table.integer('duration_seconds').notNullable().defaultTo(0);
        table.bigInteger('file_size_bytes').notNullable().defaultTo(0);
        table.string('mime_type', 64).defaultTo('audio/webm');
        table.string('status', 32).notNullable().defaultTo('COMPLETED');
        table.jsonb('metadata').nullable().defaultTo('{}');
        table.timestamps(true, true);
      });
    }

    // 8. audio_chunks
    const hasAudioChunks = await db.schema.hasTable('audio_chunks');
    if (!hasAudioChunks) {
      await db.schema.createTable('audio_chunks', (table) => {
        table.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
        table.string('audio_session_id', 128).notNullable().index();
        table.string('submission_id', 128).nullable().index();
        table.integer('chunk_index').notNullable();
        table.integer('total_chunks').notNullable().defaultTo(1);
        table.integer('chunk_size_bytes').notNullable().defaultTo(0);
        table.string('sha256_hash', 64).nullable();
        table.text('storage_url').nullable();
        table.timestamps(true, true);
      });
    }

    // 9. question_audio_segments
    const hasQuestionAudioSegments = await db.schema.hasTable('question_audio_segments');
    if (!hasQuestionAudioSegments) {
      await db.schema.createTable('question_audio_segments', (table) => {
        table.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
        table.string('submission_id', 128).notNullable().index();
        table.string('question_tag', 100).notNullable().index();
        table.decimal('start_time_seconds', 8, 2).notNullable().defaultTo(0);
        table.decimal('end_time_seconds', 8, 2).notNullable().defaultTo(0);
        table.text('audio_url').nullable();
        table.timestamps(true, true);
      });
    }

    // 10. agent_location_events
    const hasAgentLocationEvents = await db.schema.hasTable('agent_location_events');
    if (!hasAgentLocationEvents) {
      await db.schema.createTable('agent_location_events', (table) => {
        table.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
        table.uuid('surveyor_id').nullable().index();
        table.string('submission_id', 128).nullable().index();
        table.uuid('project_id').nullable().index();
        table.decimal('latitude', 10, 7).notNullable();
        table.decimal('longitude', 10, 7).notNullable();
        table.decimal('altitude', 8, 2).nullable();
        table.decimal('accuracy', 8, 2).nullable();
        table.decimal('speed', 8, 2).nullable();
        table.decimal('heading', 8, 2).nullable();
        table.integer('battery_level').nullable();
        table.string('network_type', 32).nullable();
        table.boolean('is_mock_location').defaultTo(false);
        table.timestamp('recorded_at').notNullable().defaultTo(db.fn.now());
        table.timestamps(true, true);
      });
    }

    tablesInitialized = true;
  } catch (err) {
    logger.warn('Dynamic table check or creation handled:', { error: err.message });
    tablesInitialized = true;
  }
};

const fieldCatiModel = {
  /**
   * Initializes prerequisite schemas on-demand
   */
  async init() {
    await ensureTablesExist();
  },

  // ==========================================
  // 1. FIELD ASSIGNMENTS
  // ==========================================

  /**
   * Finds field assignments matching filter criteria
   * @param {object} filters
   * @returns {Promise<Array<object>>}
   */
  async findAssignments(filters = {}) {
    await ensureTablesExist();

    let query = db('field_assignments')
      .leftJoin('projects', 'field_assignments.project_id', 'projects.id')
      .leftJoin('users as surveyors', 'field_assignments.surveyor_id', 'surveyors.id')
      .leftJoin('vendors', 'field_assignments.vendor_id', 'vendors.id')
      .select(
        'field_assignments.*',
        'projects.name as project_name',
        'projects.project_code as project_code',
        'projects.status as project_status',
        'surveyors.first_name as surveyor_first_name',
        'surveyors.last_name as surveyor_last_name',
        'surveyors.phone as surveyor_phone',
        'vendors.name as vendor_name'
      )
      .orderBy('field_assignments.created_at', 'desc');

    if (filters.surveyorId) {
      query = query.where('field_assignments.surveyor_id', filters.surveyorId);
    }
    if (filters.projectId) {
      query = query.where('field_assignments.project_id', filters.projectId);
    }
    if (filters.vendorId) {
      query = query.where('field_assignments.vendor_id', filters.vendorId);
    }
    if (filters.status && filters.status !== 'ALL') {
      query = query.where('field_assignments.status', filters.status);
    }
    if (filters.stateId) {
      query = query.where('field_assignments.state_id', filters.stateId);
    }

    const assignments = await query;

    // Fallback: if field_assignments has no records for this user, also check user_project_assignments
    if ((!assignments || assignments.length === 0) && filters.surveyorId) {
      const userProjectAssignments = await db('user_project_assignments')
        .leftJoin('projects', 'user_project_assignments.project_id', 'projects.id')
        .select(
          'user_project_assignments.id as id',
          'user_project_assignments.project_id',
          'projects.name as project_name',
          'projects.project_code as project_code',
          'projects.status as project_status',
          'user_project_assignments.assigned_modules',
          'user_project_assignments.assigned_states',
          'user_project_assignments.created_at'
        )
        .where('user_project_assignments.user_id', filters.surveyorId);

      return userProjectAssignments.map((upa) => ({
        id: upa.id,
        assignment_code: `ASN-${upa.project_code || 'PRJ'}-${upa.id.substring(0, 8)}`,
        project_id: upa.project_id,
        project_name: upa.project_name,
        project_code: upa.project_code,
        surveyor_id: filters.surveyorId,
        target_quota: 100,
        completed_count: 0,
        status: 'ASSIGNED',
        assigned_modules: upa.assigned_modules,
        assigned_states: upa.assigned_states,
        created_at: upa.created_at,
      }));
    }

    return assignments;
  },

  /**
   * Find field assignment by ID
   * @param {string} id
   * @returns {Promise<object|null>}
   */
  async findAssignmentById(id) {
    await ensureTablesExist();

    return db('field_assignments')
      .leftJoin('projects', 'field_assignments.project_id', 'projects.id')
      .select('field_assignments.*', 'projects.name as project_name', 'projects.project_code as project_code')
      .where('field_assignments.id', id)
      .first();
  },

  /**
   * Create new field assignment
   * @param {object} data
   * @param {import('knex').Knex.Transaction} [trx]
   * @returns {Promise<object>}
   */
  async createAssignment(data, trx = null) {
    await ensureTablesExist();

    const query = db('field_assignments').insert(data).returning('*');
    if (trx) query.transacting(trx);
    const [created] = await query;
    return created;
  },

  /**
   * Update field assignment
   * @param {string} id
   * @param {object} data
   * @param {import('knex').Knex.Transaction} [trx]
   * @returns {Promise<object>}
   */
  async updateAssignment(id, data, trx = null) {
    await ensureTablesExist();

    const query = db('field_assignments')
      .where('id', id)
      .update({
        ...data,
        updated_at: db.fn.now(),
      })
      .returning('*');
    if (trx) query.transacting(trx);
    const [updated] = await query;
    return updated;
  },

  /**
   * Atomically increment completed target count for an assignment
   * @param {string} id
   * @param {number} [count=1]
   * @param {import('knex').Knex.Transaction} [trx]
   * @returns {Promise<object>}
   */
  async incrementCompletedCount(id, count = 1, trx = null) {
    await ensureTablesExist();

    const runner = trx || db;
    await runner('field_assignments')
      .where('id', id)
      .increment('completed_count', count)
      .update({ updated_at: db.fn.now() });

    return runner('field_assignments').where('id', id).first();
  },

  // ==========================================
  // 2. AGENT LOCATION TRAIL (GPS EVENTS)
  // ==========================================

  /**
   * Batch insert GPS fixes
   * @param {Array<object>} events
   * @param {import('knex').Knex.Transaction} [trx]
   * @returns {Promise<number>}
   */
  async batchInsertGpsEvents(events, trx = null) {
    await ensureTablesExist();
    if (!events || events.length === 0) return 0;

    const runner = trx || db;
    const batchSize = 100;
    let insertedCount = 0;

    for (let i = 0; i < events.length; i += batchSize) {
      const slice = events.slice(i, i + batchSize);
      await runner('agent_gps_events').insert(slice);
      insertedCount += slice.length;
    }

    return insertedCount;
  },

  /**
   * Retrieve GPS trail sequence for a surveyor and project
   * @param {object} params
   * @returns {Promise<Array<object>>}
   */
  async findGpsTrail({ surveyorId, projectId, dateFrom, dateTo, limit = 500 }) {
    await ensureTablesExist();

    let query = db('agent_gps_events')
      .where('surveyor_id', surveyorId)
      .orderBy('recorded_at', 'asc')
      .limit(limit);

    if (projectId) {
      query = query.where('project_id', projectId);
    }
    if (dateFrom) {
      query = query.where('recorded_at', '>=', dateFrom);
    }
    if (dateTo) {
      query = query.where('recorded_at', '<=', dateTo);
    }

    return query;
  },

  /**
   * Retrieve the most recent location fix for a surveyor
   * @param {string} surveyorId
   * @returns {Promise<object|null>}
   */
  async getRecentLocation(surveyorId) {
    await ensureTablesExist();

    return db('agent_gps_events')
      .where('surveyor_id', surveyorId)
      .orderBy('recorded_at', 'desc')
      .first();
  },

  // ==========================================
  // 3. AUDIO CHUNK MANIFESTS
  // ==========================================

  /**
   * Insert or update audio chunk upload record
   * @param {object} data
   * @param {import('knex').Knex.Transaction} [trx]
   * @returns {Promise<object>}
   */
  async upsertChunkManifest(data, trx = null) {
    await ensureTablesExist();

    const runner = trx || db;
    const existing = await runner('audio_chunk_manifests')
      .where({
        recording_id: data.recording_id,
        chunk_index: data.chunk_index,
      })
      .first();

    if (existing) {
      const [updated] = await runner('audio_chunk_manifests')
        .where('id', existing.id)
        .update({
          sha256_hash: data.sha256_hash,
          chunk_size_bytes: data.chunk_size_bytes,
          storage_path: data.storage_path,
          storage_url: data.storage_url,
          status: data.status || 'RECEIVED',
          updated_at: db.fn.now(),
        })
        .returning('*');
      return updated;
    }

    const [created] = await runner('audio_chunk_manifests')
      .insert(data)
      .returning('*');
    return created;
  },

  /**
   * Get all chunks associated with a recording session
   * @param {string} recordingId
   * @returns {Promise<Array<object>>}
   */
  async findChunksByRecordingId(recordingId) {
    await ensureTablesExist();

    return db('audio_chunk_manifests')
      .where('recording_id', recordingId)
      .orderBy('chunk_index', 'asc');
  },

  /**
   * Mark all chunks for a recording as ASSEMBLED
   * @param {string} recordingId
   * @param {string} assembledUrl
   * @param {import('knex').Knex.Transaction} [trx]
   * @returns {Promise<number>}
   */
  async markChunksAssembled(recordingId, assembledUrl, trx = null) {
    await ensureTablesExist();

    const runner = trx || db;
    return runner('audio_chunk_manifests')
      .where('recording_id', recordingId)
      .update({
        status: 'ASSEMBLED',
        storage_url: assembledUrl,
        updated_at: db.fn.now(),
      });
  },

  // ==========================================
  // 4. DEVICE REGISTRATIONS
  // ==========================================

  /**
   * Registers or updates collector device metadata
   * @param {object} deviceData
   * @param {import('knex').Knex.Transaction} [trx]
   * @returns {Promise<object>}
   */
  async registerOrUpdateDevice(deviceData, trx = null) {
    await ensureTablesExist();

    const runner = trx || db;
    const existing = await runner('device_registrations')
      .where('device_id', deviceData.device_id)
      .first();

    if (existing) {
      const [updated] = await runner('device_registrations')
        .where('id', existing.id)
        .update({
          hardware_uuid: deviceData.hardware_uuid || existing.hardware_uuid,
          user_id: deviceData.user_id || existing.user_id,
          vendor_id: deviceData.vendor_id || existing.vendor_id,
          device_model: deviceData.device_model || existing.device_model,
          os_version: deviceData.os_version || existing.os_version,
          app_version: deviceData.app_version || existing.app_version,
          fcm_token: deviceData.fcm_token || existing.fcm_token,
          status: deviceData.status || existing.status,
          last_sync_at: db.fn.now(),
          updated_at: db.fn.now(),
        })
        .returning('*');
      return updated;
    }

    const [created] = await runner('device_registrations')
      .insert({
        ...deviceData,
        last_sync_at: db.fn.now(),
      })
      .returning('*');
    return created;
  },

  /**
   * Find registered device by unique ID
   * @param {string} deviceId
   * @returns {Promise<object|null>}
   */
  async findDeviceById(deviceId) {
    await ensureTablesExist();

    return db('device_registrations').where('device_id', deviceId).first();
  },

  /**
   * Update device heartbeat timestamp
   * @param {string} deviceId
   * @param {import('knex').Knex.Transaction} [trx]
   * @returns {Promise<void>}
   */
  async updateLastSync(deviceId, trx = null) {
    await ensureTablesExist();

    const runner = trx || db;
    await runner('device_registrations')
      .where('device_id', deviceId)
      .update({
        last_sync_at: db.fn.now(),
        updated_at: db.fn.now(),
      });
  },

  // ==========================================
  // 5. OFFLINE SYNC LOGS
  // ==========================================

  /**
   * Create offline batch sync execution log
   * @param {object} data
   * @param {import('knex').Knex.Transaction} [trx]
   * @returns {Promise<object>}
   */
  async createSyncLog(data, trx = null) {
    await ensureTablesExist();

    const runner = trx || db;
    const [log] = await runner('offline_sync_logs')
      .insert({
        ...data,
        sync_details: typeof data.sync_details === 'object' ? JSON.stringify(data.sync_details) : data.sync_details,
      })
      .returning('*');
    return log;
  },

  /**
   * Find sync logs with filtering and pagination
   * @param {object} filters
   * @param {object} pagination
   * @returns {Promise<Array<object>>}
   */
  async findSyncLogs(filters = {}, pagination = {}) {
    await ensureTablesExist();

    const { limit = 20, offset = 0 } = pagination;
    let query = db('offline_sync_logs')
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset);

    if (filters.surveyorId) {
      query = query.where('surveyor_id', filters.surveyorId);
    }
    if (filters.projectId) {
      query = query.where('project_id', filters.projectId);
    }
    if (filters.vendorId) {
      query = query.where('vendor_id', filters.vendorId);
    }
    if (filters.syncStatus) {
      query = query.where('sync_status', filters.syncStatus);
    }

    return query;
  },
};

const wrappedFieldCatiModel = {
  ...fieldCatiModel,
  async init() {
    return withDbFallback(
      () => fieldCatiModel.init(),
      () => true
    );
  },
  async findAssignments(filters = {}) {
    return withDbFallback(
      () => fieldCatiModel.findAssignments(filters),
      () => mockStore.find('field_cati_assignments', filters)
    );
  },
  async findAssignmentById(id) {
    return withDbFallback(
      () => fieldCatiModel.findAssignmentById(id),
      () => mockStore.findById('field_cati_assignments', id)
    );
  },
  async createAssignment(data, trx = null) {
    return withDbFallback(
      () => fieldCatiModel.createAssignment(data, trx),
      () => mockStore.insert('field_cati_assignments', data)
    );
  },
  async updateAssignment(id, data, trx = null) {
    return withDbFallback(
      () => fieldCatiModel.updateAssignment(id, data, trx),
      () => mockStore.updateById('field_cati_assignments', id, data)
    );
  },
  async incrementCompletedCount(id, count = 1, trx = null) {
    return withDbFallback(
      () => fieldCatiModel.incrementCompletedCount(id, count, trx),
      () => {
        const item = mockStore.findById('field_cati_assignments', id);
        if (item) {
          item.completed_count = (item.completed_count || 0) + count;
          item.updated_at = new Date();
          return item;
        }
        return null;
      }
    );
  },
  async batchInsertGpsEvents(events, trx = null) {
    return withDbFallback(
      () => fieldCatiModel.batchInsertGpsEvents(events, trx),
      () => {
        if (!events || !events.length) return 0;
        events.forEach((e) => mockStore.insert('gps_events', e));
        return events.length;
      }
    );
  },
  async findGpsTrail(params) {
    return withDbFallback(
      () => fieldCatiModel.findGpsTrail(params),
      () => mockStore.find('gps_events', { surveyor_id: params.surveyorId })
    );
  },
  async getRecentLocation(surveyorId) {
    return withDbFallback(
      () => fieldCatiModel.getRecentLocation(surveyorId),
      () => {
        const events = mockStore.find('gps_events', { surveyor_id: surveyorId });
        return events.length ? events[events.length - 1] : null;
      }
    );
  },
  async upsertChunkManifest(data, trx = null) {
    return withDbFallback(
      () => fieldCatiModel.upsertChunkManifest(data, trx),
      () => mockStore.insert('audio_chunk_manifests', data)
    );
  },
  async findChunksByRecordingId(recordingId) {
    return withDbFallback(
      () => fieldCatiModel.findChunksByRecordingId(recordingId),
      () => mockStore.find('audio_chunk_manifests', { recording_id: recordingId })
    );
  },
  async markChunksAssembled(recordingId, assembledUrl, trx = null) {
    return withDbFallback(
      () => fieldCatiModel.markChunksAssembled(recordingId, assembledUrl, trx),
      () => 1
    );
  },
  async registerOrUpdateDevice(deviceData, trx = null) {
    return withDbFallback(
      () => fieldCatiModel.registerOrUpdateDevice(deviceData, trx),
      () => mockStore.insert('device_registrations', deviceData)
    );
  },
  async findDeviceById(deviceId) {
    return withDbFallback(
      () => fieldCatiModel.findDeviceById(deviceId),
      () => mockStore.findOne('device_registrations', { device_id: deviceId })
    );
  },
  async updateLastSync(deviceId, trx = null) {
    return withDbFallback(
      () => fieldCatiModel.updateLastSync(deviceId, trx),
      () => {}
    );
  },
  async createSyncLog(data, trx = null) {
    return withDbFallback(
      () => fieldCatiModel.createSyncLog(data, trx),
      () => mockStore.insert('sync_logs', data)
    );
  },
  async findSyncLogs(filters = {}, pagination = {}) {
    return withDbFallback(
      () => fieldCatiModel.findSyncLogs(filters, pagination),
      () => mockStore.find('sync_logs', filters)
    );
  },
};

module.exports = wrappedFieldCatiModel;
