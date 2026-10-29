/**
 * @file ai.model.js
 * @description Knex database query methods and table definitions for AI audits, audio segments, fraud signals, voice profiles, risk evaluations, and AI call turns.
 */

const { db, isDbHealthy, withDbFallback } = require('../../database/connection');
const mockStore = require('../../database/mockStore');
const logger = require('../../utils/logger');

let tablesEnsured = false;

/**
 * AI Knex Model object providing data persistence and query capabilities.
 */
const aiModel = {
  /**
   * Ensures that AI database tables exist. Self-healing initialization for dev/test environments.
   * @returns {Promise<void>}
   */
  async ensureTables() {
    if (tablesEnsured || !isDbHealthy()) return;

    try {
      const hasAiAudits = await db.schema.hasTable('ai_audits');
      if (!hasAiAudits) {
        await db.schema.createTable('ai_audits', (table) => {
          table.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
          table.string('submission_id').notNullable().index();
          table.uuid('project_id').nullable();
          table.uuid('vendor_id').nullable();
          table.text('audio_url').nullable();
          table.string('status', 50).defaultTo('QUEUED').index();
          table.decimal('overall_score', 5, 2).defaultTo(0);
          table.decimal('aggregate_risk_score', 5, 2).defaultTo(0);
          table.string('risk_level', 20).defaultTo('LOW').index();
          table.string('routing_decision', 50).defaultTo('DIRECT_APPROVE');
          table.decimal('vad_speech_ratio', 5, 2).defaultTo(0);
          table.decimal('audio_quality_score', 5, 2).defaultTo(0);
          table.string('language_detected', 20).defaultTo('en');
          table.integer('speaker_count').defaultTo(2);
          table.boolean('collector_voice_matched').defaultTo(false);
          table.boolean('cross_user_collision').defaultTo(false);
          table.boolean('repeated_respondent_cluster').defaultTo(false);
          table.boolean('speaker_count_anomaly').defaultTo(false);
          table.integer('prompt_flags_count').defaultTo(0);
          table.integer('whisper_flags_count').defaultTo(0);
          table.integer('mismatch_flags_count').defaultTo(0);
          table.jsonb('metadata').defaultTo('{}');
          table.timestamp('completed_at').nullable();
          table.timestamps(true, true);
        });
      }

      const hasAiSegments = await db.schema.hasTable('ai_audio_segments');
      if (!hasAiSegments) {
        await db.schema.createTable('ai_audio_segments', (table) => {
          table.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
          table.uuid('ai_audit_id').nullable().index();
          table.string('submission_id').notNullable().index();
          table.uuid('question_id').nullable();
          table.string('question_tag', 100).nullable();
          table.integer('start_time_ms').defaultTo(0);
          table.integer('end_time_ms').defaultTo(0);
          table.string('speaker_label', 50).defaultTo('SPEAKER_00');
          table.text('transcript_text').nullable();
          table.decimal('confidence', 5, 2).defaultTo(0.9);
          table.text('expected_question').nullable();
          table.text('spoken_question').nullable();
          table.decimal('question_alignment_score', 5, 2).defaultTo(100);
          table.text('stored_answer').nullable();
          table.text('extracted_answer').nullable();
          table.decimal('answer_match_score', 5, 2).defaultTo(100);
          table.jsonb('flags').defaultTo('[]');
          table.decimal('speech_energy', 5, 2).defaultTo(50);
          table.timestamps(true, true);
        });
      }

      const hasAiSignals = await db.schema.hasTable('ai_fraud_signals');
      if (!hasAiSignals) {
        await db.schema.createTable('ai_fraud_signals', (table) => {
          table.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
          table.string('submission_id').notNullable().index();
          table.uuid('ai_audit_id').nullable().index();
          table.string('signal_type', 100).notNullable().index();
          table.string('severity', 20).defaultTo('LOW').index();
          table.decimal('confidence', 5, 2).defaultTo(0.8);
          table.text('description').nullable();
          table.jsonb('evidence_data').defaultTo('{}');
          table.boolean('is_suppressed').defaultTo(false);
          table.timestamps(true, true);
        });
      }

      const hasVoiceProfiles = await db.schema.hasTable('ai_voice_profiles');
      if (!hasVoiceProfiles) {
        await db.schema.createTable('ai_voice_profiles', (table) => {
          table.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
          table.uuid('user_id').nullable().index();
          table.string('full_name', 200).nullable();
          table.string('role', 50).defaultTo('ENUMERATOR');
          table.text('sample_audio_url').nullable();
          table.text('embedding_vector').nullable();
          table.integer('embedding_dimension').defaultTo(512);
          table.decimal('sample_duration_sec', 6, 2).defaultTo(0);
          table.decimal('sample_snr_db', 6, 2).defaultTo(25);
          table.string('status', 50).defaultTo('ACTIVE').index();
          table.integer('verification_count').defaultTo(0);
          table.timestamp('last_verified_at').nullable();
          table.jsonb('metadata').defaultTo('{}');
          table.timestamps(true, true);
        });
      }

      const hasRiskEvals = await db.schema.hasTable('ai_risk_evaluations');
      if (!hasRiskEvals) {
        await db.schema.createTable('ai_risk_evaluations', (table) => {
          table.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
          table.string('submission_id').notNullable().index();
          table.uuid('ai_audit_id').nullable().index();
          table.decimal('aggregate_risk_score', 5, 2).defaultTo(0);
          table.string('risk_level', 20).defaultTo('LOW').index();
          table.string('recommended_route', 50).defaultTo('DIRECT_APPROVE');
          table.jsonb('signals_summary').defaultTo('[]');
          table.jsonb('weights_applied').defaultTo('{}');
          table.text('decision_explanation').nullable();
          table.string('evaluated_by', 100).defaultTo('AI_RISK_ENGINE_V1');
          table.timestamps(true, true);
        });
      }

      const hasCallTurns = await db.schema.hasTable('ai_call_turns');
      if (!hasCallTurns) {
        await db.schema.createTable('ai_call_turns', (table) => {
          table.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
          table.string('conversation_id', 100).notNullable().index();
          table.string('call_type', 20).defaultTo('TVC');
          table.string('submission_id').nullable().index();
          table.string('lead_id').nullable();
          table.integer('turn_number').defaultTo(1);
          table.string('role', 20).defaultTo('assistant');
          table.text('input_text').nullable();
          table.text('generated_response').nullable();
          table.string('intent_detected', 100).nullable();
          table.decimal('confidence', 5, 2).defaultTo(0.9);
          table.string('emotion_tone', 50).defaultTo('NEUTRAL');
          table.string('action_disposition', 100).defaultTo('CONTINUE');
          table.jsonb('turn_metadata').defaultTo('{}');
          table.timestamps(true, true);
        });
      }

      tablesEnsured = true;
    } catch (err) {
      logger.warn('AI table auto-creation non-fatal check:', { error: err.message });
      tablesEnsured = true;
    }
  },

  /**
   * Create a new AI audit entry
   * @param {object} data
   * @param {import('knex').Knex.Transaction} [trx]
   * @returns {Promise<object>}
   */
  async createAudit(data, trx = null) {
    await this.ensureTables();
    const query = db('ai_audits').insert(data).returning('*');
    if (trx) query.transacting(trx);
    const [created] = await query;
    return created;
  },

  /**
   * Update an AI audit record
   * @param {string} id
   * @param {object} data
   * @param {import('knex').Knex.Transaction} [trx]
   * @returns {Promise<object>}
   */
  async updateAudit(id, data, trx = null) {
    await this.ensureTables();
    const query = db('ai_audits')
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
   * Find AI audit by primary ID
   * @param {string} id
   * @returns {Promise<object|null>}
   */
  async findAuditById(id) {
    await this.ensureTables();
    return db('ai_audits').where('id', id).first();
  },

  /**
   * Find most recent AI audit for a submission
   * @param {string} submissionId
   * @returns {Promise<object|null>}
   */
  async findAuditBySubmissionId(submissionId) {
    await this.ensureTables();
    return db('ai_audits')
      .where('submission_id', submissionId)
      .orderBy('created_at', 'desc')
      .first();
  },

  /**
   * List AI audits matching filters
   * @param {object} filters
   * @param {object} pagination
   * @returns {Promise<Array<object>>}
   */
  async findAudits(filters = {}, pagination = {}) {
    await this.ensureTables();
    let query = db('ai_audits');

    if (filters.projectId) query = query.where('project_id', filters.projectId);
    if (filters.vendorId) query = query.where('vendor_id', filters.vendorId);
    if (filters.status) query = query.where('status', filters.status);
    if (filters.riskLevel) query = query.where('risk_level', filters.riskLevel);
    if (filters.routingDecision) query = query.where('routing_decision', filters.routingDecision);

    if (pagination.sortBy) {
      query = query.orderBy(pagination.sortBy, pagination.sortOrder || 'desc');
    } else {
      query = query.orderBy('created_at', 'desc');
    }

    if (pagination.limit) query = query.limit(pagination.limit);
    if (pagination.offset !== undefined) query = query.offset(pagination.offset);

    return query;
  },

  /**
   * Count AI audits matching filters
   * @param {object} filters
   * @returns {Promise<number>}
   */
  async countAudits(filters = {}) {
    await this.ensureTables();
    let query = db('ai_audits');

    if (filters.projectId) query = query.where('project_id', filters.projectId);
    if (filters.vendorId) query = query.where('vendor_id', filters.vendorId);
    if (filters.status) query = query.where('status', filters.status);
    if (filters.riskLevel) query = query.where('risk_level', filters.riskLevel);

    const result = await query.count('* as count').first();
    return result ? parseInt(result.count, 10) : 0;
  },

  /**
   * Bulk insert audio segments for an audit
   * @param {Array<object>} segments
   * @param {import('knex').Knex.Transaction} [trx]
   * @returns {Promise<Array<object>>}
   */
  async createAudioSegments(segments = [], trx = null) {
    if (!segments.length) return [];
    await this.ensureTables();
    const query = db('ai_audio_segments').insert(segments).returning('*');
    if (trx) query.transacting(trx);
    return query;
  },

  /**
   * Find audio segments by AI audit ID
   * @param {string} aiAuditId
   * @returns {Promise<Array<object>>}
   */
  async findAudioSegmentsByAuditId(aiAuditId) {
    await this.ensureTables();
    return db('ai_audio_segments')
      .where('ai_audit_id', aiAuditId)
      .orderBy('start_time_ms', 'asc');
  },

  /**
   * Find audio segments by submission ID
   * @param {string} submissionId
   * @returns {Promise<Array<object>>}
   */
  async findAudioSegmentsBySubmissionId(submissionId) {
    await this.ensureTables();
    return db('ai_audio_segments')
      .where('submission_id', submissionId)
      .orderBy('start_time_ms', 'asc');
  },

  /**
   * Bulk insert fraud signals
   * @param {Array<object>} signals
   * @param {import('knex').Knex.Transaction} [trx]
   * @returns {Promise<Array<object>>}
   */
  async createFraudSignals(signals = [], trx = null) {
    if (!signals.length) return [];
    await this.ensureTables();
    const query = db('ai_fraud_signals').insert(signals).returning('*');
    if (trx) query.transacting(trx);
    return query;
  },

  /**
   * Find fraud signals for a submission
   * @param {string} submissionId
   * @returns {Promise<Array<object>>}
   */
  async findFraudSignalsBySubmissionId(submissionId) {
    await this.ensureTables();
    return db('ai_fraud_signals')
      .where('submission_id', submissionId)
      .orderBy('created_at', 'desc');
  },

  /**
   * Find fraud signals by AI audit ID
   * @param {string} aiAuditId
   * @returns {Promise<Array<object>>}
   */
  async findFraudSignalsByAuditId(aiAuditId) {
    await this.ensureTables();
    return db('ai_fraud_signals')
      .where('ai_audit_id', aiAuditId)
      .orderBy('created_at', 'desc');
  },

  /**
   * Upsert a user voice profile
   * @param {object} profileData
   * @param {import('knex').Knex.Transaction} [trx]
   * @returns {Promise<object>}
   */
  async upsertVoiceProfile(profileData, trx = null) {
    await this.ensureTables();
    const runner = trx || db;

    const { incrementVerification, ...cleanData } = profileData;

    let existing = null;
    if (cleanData.user_id) {
      existing = await runner('ai_voice_profiles').where('user_id', cleanData.user_id).first();
    }

    if (existing) {
      const [updated] = await runner('ai_voice_profiles')
        .where('id', existing.id)
        .update({
          ...cleanData,
          verification_count: (existing.verification_count || 0) + (incrementVerification ? 1 : 0),
          updated_at: db.fn.now(),
        })
        .returning('*');
      return updated;
    }

    const [created] = await runner('ai_voice_profiles').insert(cleanData).returning('*');
    return created;
  },

  /**
   * Find voice profile by user ID
   * @param {string} userId
   * @returns {Promise<object|null>}
   */
  async findVoiceProfileByUserId(userId) {
    await this.ensureTables();
    return db('ai_voice_profiles').where('user_id', userId).first();
  },

  /**
   * List voice profiles
   * @param {object} filters
   * @returns {Promise<Array<object>>}
   */
  async findVoiceProfiles(filters = {}) {
    await this.ensureTables();
    let query = db('ai_voice_profiles');
    if (filters.status) query = query.where('status', filters.status);
    if (filters.role) query = query.where('role', filters.role);
    return query.orderBy('created_at', 'desc');
  },

  /**
   * Update voice profile by ID
   * @param {string} id
   * @param {object} data
   * @param {import('knex').Knex.Transaction} [trx]
   * @returns {Promise<object>}
   */
  async updateVoiceProfile(id, data, trx = null) {
    await this.ensureTables();
    const query = db('ai_voice_profiles')
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
   * Create risk evaluation record
   * @param {object} data
   * @param {import('knex').Knex.Transaction} [trx]
   * @returns {Promise<object>}
   */
  async createRiskEvaluation(data, trx = null) {
    await this.ensureTables();
    const query = db('ai_risk_evaluations').insert(data).returning('*');
    if (trx) query.transacting(trx);
    const [created] = await query;
    return created;
  },

  /**
   * Find most recent risk evaluation for submission
   * @param {string} submissionId
   * @returns {Promise<object|null>}
   */
  async findRiskEvaluationBySubmissionId(submissionId) {
    await this.ensureTables();
    return db('ai_risk_evaluations')
      .where('submission_id', submissionId)
      .orderBy('created_at', 'desc')
      .first();
  },

  /**
   * Record conversational turn for TVC or FA call
   * @param {object} turnData
   * @param {import('knex').Knex.Transaction} [trx]
   * @returns {Promise<object>}
   */
  async createCallTurn(turnData, trx = null) {
    await this.ensureTables();
    const query = db('ai_call_turns').insert(turnData).returning('*');
    if (trx) query.transacting(trx);
    const [created] = await query;
    return created;
  },

  /**
   * Retrieve conversational turn history for a session
   * @param {string} conversationId
   * @returns {Promise<Array<object>>}
   */
  async findCallTurnsByConversationId(conversationId) {
    await this.ensureTables();
    return db('ai_call_turns')
      .where('conversation_id', conversationId)
      .orderBy('turn_number', 'asc');
  },
};

const wrappedAiModel = {
  ...aiModel,
  async ensureTables() {
    return withDbFallback(
      () => aiModel.ensureTables(),
      () => true
    );
  },
  async createAudit(data, trx = null) {
    return withDbFallback(
      () => aiModel.createAudit(data, trx),
      () => mockStore.insert('ai_audits', data)
    );
  },
  async updateAudit(id, data, trx = null) {
    return withDbFallback(
      () => aiModel.updateAudit(id, data, trx),
      () => mockStore.updateById('ai_audits', id, data)
    );
  },
  async findAuditById(id) {
    return withDbFallback(
      () => aiModel.findAuditById(id),
      () => mockStore.findById('ai_audits', id)
    );
  },
  async findAuditBySubmissionId(submissionId) {
    return withDbFallback(
      () => aiModel.findAuditBySubmissionId(submissionId),
      () => mockStore.findOne('ai_audits', { submission_id: submissionId })
    );
  },
  async findAudits(filters = {}, pagination = {}) {
    return withDbFallback(
      () => aiModel.findAudits(filters, pagination),
      () => mockStore.find('ai_audits', filters)
    );
  },
  async countAudits(filters = {}) {
    return withDbFallback(
      () => aiModel.countAudits(filters),
      () => mockStore.count('ai_audits', filters)
    );
  },
  async createAudioSegments(segments, trx = null) {
    return withDbFallback(
      () => aiModel.createAudioSegments(segments, trx),
      () => {
        if (!segments || !segments.length) return [];
        return segments.map((s) => mockStore.insert('audio_segments', s));
      }
    );
  },
  async findAudioSegmentsByAuditId(aiAuditId) {
    return withDbFallback(
      () => aiModel.findAudioSegmentsByAuditId(aiAuditId),
      () => mockStore.find('audio_segments', { ai_audit_id: aiAuditId })
    );
  },
  async findAudioSegmentsBySubmissionId(submissionId) {
    return withDbFallback(
      () => aiModel.findAudioSegmentsBySubmissionId(submissionId),
      () => mockStore.find('audio_segments', { submission_id: submissionId })
    );
  },
  async createFraudSignals(signals, trx = null) {
    return withDbFallback(
      () => aiModel.createFraudSignals(signals, trx),
      () => {
        if (!signals || !signals.length) return [];
        return signals.map((s) => mockStore.insert('fraud_signals', s));
      }
    );
  },
  async findFraudSignalsBySubmissionId(submissionId) {
    return withDbFallback(
      () => aiModel.findFraudSignalsBySubmissionId(submissionId),
      () => mockStore.find('fraud_signals', { submission_id: submissionId })
    );
  },
  async findFraudSignalsByAuditId(aiAuditId) {
    return withDbFallback(
      () => aiModel.findFraudSignalsByAuditId(aiAuditId),
      () => mockStore.find('fraud_signals', { ai_audit_id: aiAuditId })
    );
  },
  async upsertVoiceProfile(profileData, trx = null) {
    return withDbFallback(
      () => aiModel.upsertVoiceProfile(profileData, trx),
      () => {
        const { incrementVerification, ...cleanData } = profileData;
        const existing = mockStore.findOne('voice_profiles', { user_id: cleanData.user_id });
        if (existing) {
          return mockStore.updateById('voice_profiles', existing.id, {
            ...cleanData,
            verification_count: (existing.verification_count || 0) + (incrementVerification ? 1 : 0),
          });
        }
        return mockStore.insert('voice_profiles', cleanData);
      }
    );
  },
  async findVoiceProfileByUserId(userId) {
    return withDbFallback(
      () => aiModel.findVoiceProfileByUserId(userId),
      () => mockStore.findOne('voice_profiles', { user_id: userId })
    );
  },
  async findVoiceProfiles(filters = {}, pagination = {}) {
    return withDbFallback(
      () => aiModel.findVoiceProfiles(filters, pagination),
      () => mockStore.find('voice_profiles', filters)
    );
  },
  async updateVoiceProfile(id, updates, trx = null) {
    return withDbFallback(
      () => aiModel.updateVoiceProfile(id, updates, trx),
      () => mockStore.updateById('voice_profiles', id, updates)
    );
  },
  async createRiskEvaluation(data, trx = null) {
    return withDbFallback(
      () => aiModel.createRiskEvaluation(data, trx),
      () => mockStore.insert('risk_evaluations', data)
    );
  },
  async findRiskEvaluationBySubmissionId(submissionId) {
    return withDbFallback(
      () => aiModel.findRiskEvaluationBySubmissionId(submissionId),
      () => mockStore.findOne('risk_evaluations', { submission_id: submissionId })
    );
  },
  async createCallTurn(turnData, trx = null) {
    return withDbFallback(
      () => aiModel.createCallTurn(turnData, trx),
      () => mockStore.insert('ai_call_turns', turnData)
    );
  },
  async findCallTurnsByConversationId(conversationId) {
    return withDbFallback(
      () => aiModel.findCallTurnsByConversationId(conversationId),
      () => mockStore.find('ai_call_turns', { conversation_id: conversationId })
    );
  },
};

module.exports = wrappedAiModel;
