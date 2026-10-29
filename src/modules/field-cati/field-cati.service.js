/**
 * @file field-cati.service.js
 * @description Business logic layer for Field CATI, manifest prefetch, GPS trail ingestion, audio chunk assembly, and idempotent offline sync.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const dayjs = require('dayjs');
const { Queue } = require('bullmq');
const { db } = require('../../database/connection');
const config = require('../../config');
const logger = require('../../utils/logger');
const { NotFoundError, ValidationError } = require('../../utils/errors');
const fieldCatiModel = require('./field-cati.model');

// Ensure upload directories exist
const CHUNKS_DIR = path.resolve(config.storage.uploadDir || 'uploads', 'audio_chunks');
const RECORDINGS_DIR = path.resolve(config.storage.uploadDir || 'uploads', 'recordings');

if (!fs.existsSync(CHUNKS_DIR)) {
  fs.mkdirSync(CHUNKS_DIR, { recursive: true });
}
if (!fs.existsSync(RECORDINGS_DIR)) {
  fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
}

// BullMQ Queue setup for AI Pre-processing pipeline
let aiProcessingQueue = null;
try {
  const redisOptions = {
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password || undefined,
    db: config.redis.db,
    maxRetriesPerRequest: null,
  };

  aiProcessingQueue = new Queue('ai-preprocessing', {
    connection: redisOptions,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      removeOnComplete: 100,
      removeOnFail: 500,
    },
  });

  aiProcessingQueue.on('error', (err) => {
    logger.warn('AI Pre-processing BullMQ Queue connection warning:', { message: err.message });
  });
} catch (queueErr) {
  logger.warn('Could not initialize BullMQ AI queue, fallback enabled:', { message: queueErr.message });
}

/**
 * Calculates Great-Circle Distance between two GPS points using Haversine Formula.
 *
 * @param {number} lat1
 * @param {number} lon1
 * @param {number} lat2
 * @param {number} lon2
 * @returns {number} Distance in kilometers
 */
const calculateHaversineDistanceKm = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const fieldCatiService = {
  /**
   * Generates business submission ID formatted as SUB-{projectCode}-{date}-{sequence}
   *
   * @param {string} projectId
   * @param {import('knex').Knex.Transaction} [trx]
   * @returns {Promise<string>}
   */
  async generateSubmissionCode(projectId, trx = null) {
    const runner = trx || db;
    const project = await runner('projects').where({ id: projectId }).first();
    const projectCode = project ? project.project_code || project.code || 'PRJ' : 'PRJ';
    const dateStr = dayjs().format('YYYYMMDD');

    const [{ count }] = await runner('submissions')
      .where('project_id', projectId)
      .andWhereRaw("TO_CHAR(created_at, 'YYYYMMDD') = ?", [dateStr])
      .count('id as count');

    const sequence = String(parseInt(count, 10) + 1).padStart(5, '0');
    return `SUB-${projectCode}-${dateStr}-${sequence}`;
  },

  /**
   * Prefetch Project Manifest generation:
   * Compiles signed/pinned questionnaire version, option master sets,
   * language translations, visual rules, and geography nodes into an encrypted-ready bundle.
   *
   * @param {string} projectId
   * @param {object} tenantContext
   * @returns {Promise<object>} Compiled encrypted-ready project manifest bundle
   */
  async getProjectManifest(projectId, tenantContext = {}) {
    // 1. Validate project existence
    const project = await db('projects').where('id', projectId).first();
    if (!project) {
      throw new NotFoundError(`Project '${projectId}' not found`);
    }

    // 2. Fetch pinned / active questionnaire version
    let questionnaireVersion = await db('questionnaire_versions')
      .where({ project_id: projectId, status: 'PUBLISHED' })
      .orderBy('version_number', 'desc')
      .first();

    if (!questionnaireVersion) {
      questionnaireVersion = await db('questionnaire_versions')
        .where({ project_id: projectId })
        .orderBy('version_number', 'desc')
        .first();
    }

    if (!questionnaireVersion) {
      throw new NotFoundError(`No questionnaire version found for project '${projectId}'`);
    }

    const versionId = questionnaireVersion.id;

    // 3. Fetch sections, questions, and options
    const sections = await db('sections')
      .where({ questionnaire_version_id: versionId })
      .orderBy('display_order', 'asc');

    const questions = await db('questions')
      .where({ questionnaire_version_id: versionId })
      .orderBy('display_order', 'asc');

    const questionIds = questions.map((q) => q.id);
    const options = questionIds.length > 0
      ? await db('question_options')
          .whereIn('question_id', questionIds)
          .orderBy('display_order', 'asc')
      : [];

    // Map options to questions
    const optionsByQuestion = {};
    for (const opt of options) {
      if (!optionsByQuestion[opt.question_id]) {
        optionsByQuestion[opt.question_id] = [];
      }
      optionsByQuestion[opt.question_id].push(opt);
    }

    // 4. Fetch translations for questions, options, and sections
    const entityIds = [...questionIds, ...options.map((o) => o.id), ...sections.map((s) => s.id)];
    let translations = [];
    if (entityIds.length > 0) {
      try {
        translations = await db('translations')
          .whereIn('entity_id', entityIds);
      } catch (err) {
        logger.debug('Translations query skipped or empty:', { error: err.message });
      }
    }

    // Group translations by language code and entity ID
    const translationsMap = {};
    for (const tr of translations) {
      const lang = tr.language_code || 'en';
      if (!translationsMap[lang]) {
        translationsMap[lang] = {};
      }
      if (!translationsMap[lang][tr.entity_id]) {
        translationsMap[lang][tr.entity_id] = {};
      }
      translationsMap[lang][tr.entity_id][tr.field_name || 'text'] = tr.localized_text;
    }

    // 5. Fetch visual rules & logic branching rules
    let rules = [];
    try {
      rules = await db('rule_definitions')
        .where('project_id', projectId)
        .where('is_enabled', true)
        .orderBy('priority', 'asc');
    } catch (err) {
      logger.debug('Rule definitions query skipped or empty:', { error: err.message });
    }

    // 6. Fetch geography nodes (States, AC, PC, SEP, Polling Stations)
    let geographyNodes = [];
    try {
      const hasGeo = await db.schema.hasTable('geographies');
      if (hasGeo) {
        geographyNodes = await db('geographies')
          .where('project_id', projectId)
          .select('id', 'code', 'name', 'type', 'parent_id', 'boundary_coordinates', 'metadata')
          .orderBy('type', 'asc');
      } else {
        // Fallback geography metadata from project config
        geographyNodes = [
          {
            type: 'PROJECT_SCOPE',
            projectId: project.id,
            states: project.assigned_states || [],
            metadata: project.metadata || {},
          },
        ];
      }
    } catch (geoErr) {
      logger.debug('Geography query fallback applied:', { message: geoErr.message });
      geographyNodes = [];
    }

    // 7. Assemble Question Tree
    const compiledQuestions = questions.map((q) => ({
      id: q.id,
      sectionId: q.section_id,
      questionNo: q.question_no,
      questionTag: q.question_tag,
      questionText: q.question_text,
      questionType: q.question_type,
      isRequired: q.is_required,
      validationRules: q.validation_rules || {},
      options: optionsByQuestion[q.id] || [],
    }));

    // 8. Assemble Manifest Payload
    const manifestBundle = {
      manifestVersion: `V${questionnaireVersion.version_number}.${dayjs().format('YYYYMMDDHHmmss')}`,
      compiledAt: new Date().toISOString(),
      offlineExpiryMinutes: 10080, // 7 days offline validity
      project: {
        id: project.id,
        name: project.name,
        code: project.project_code || project.code,
        status: project.status,
      },
      questionnaire: {
        id: questionnaireVersion.id,
        versionNumber: questionnaireVersion.version_number,
        title: questionnaireVersion.title || questionnaireVersion.name,
        module: questionnaireVersion.module,
        sections,
        questions: compiledQuestions,
      },
      optionsMaster: options,
      translations: translationsMap,
      visualRules: rules,
      geographyNodes,
    };

    // 9. Compute cryptographic SHA-256 integrity hash
    const manifestJson = JSON.stringify(manifestBundle);
    const manifestHash = crypto.createHash('sha256').update(manifestJson).digest('hex');

    // 10. Generate encryption-ready envelope
    return {
      manifestHash,
      signature: crypto.createHmac('sha256', config.crypto.encryptionKey).update(manifestHash).digest('hex'),
      bundle: manifestBundle,
    };
  },

  /**
   * GPS Location Events ingestion:
   * Batch ingest GPS fixes with geo-trail reconstruction, anomaly detection,
   * and distance calculation.
   *
   * @param {object} payload
   * @param {string} surveyorId
   * @param {object} tenantContext
   * @returns {Promise<object>} Ingestion summary
   */
  async ingestGpsBatch(payload, surveyorId, tenantContext = {}) {
    const { events = [], projectId, deviceId, submissionId } = payload;

    if (!events || events.length === 0) {
      throw new ValidationError('GPS events batch cannot be empty');
    }

    // Sort events chronologically
    const sortedEvents = [...events].sort((a, b) => {
      const timeA = new Date(a.recordedAt || a.timestamp || 0).getTime();
      const timeB = new Date(b.recordedAt || b.timestamp || 0).getTime();
      return timeA - timeB;
    });

    let totalDistanceKm = 0;
    const anomalies = [];
    const dbEvents = [];

    let previousPoint = null;

    for (let i = 0; i < sortedEvents.length; i++) {
      const point = sortedEvents[i];
      const recordedAt = point.recordedAt || point.timestamp || new Date();
      const lat = parseFloat(point.latitude || point.lat);
      const lng = parseFloat(point.longitude || point.lng);

      if (isNaN(lat) || isNaN(lng)) {
        continue;
      }

      // Check distance and speed anomalies between consecutive points
      if (previousPoint) {
        const distKm = calculateHaversineDistanceKm(
          previousPoint.latitude,
          previousPoint.longitude,
          lat,
          lng
        );
        totalDistanceKm += distKm;

        const timeDiffSeconds =
          (new Date(recordedAt).getTime() - new Date(previousPoint.recordedAt).getTime()) / 1000;

        if (timeDiffSeconds > 0) {
          const speedKmh = (distKm / timeDiffSeconds) * 3600;
          // Unrealistic speed (> 160 km/h) indicates GPS spoofing or teleportation
          if (speedKmh > 160) {
            anomalies.push({
              type: 'SPEED_ANOMALY_SPOOF_RISK',
              from: { lat: previousPoint.latitude, lng: previousPoint.longitude },
              to: { lat, lng },
              calculatedSpeedKmh: Math.round(speedKmh),
              recordedAt,
            });
          }
        }
      }

      // Flag mock location provider if detected on Android device
      if (point.isMockLocation) {
        anomalies.push({
          type: 'MOCK_PROVIDER_DETECTED',
          lat,
          lng,
          recordedAt,
        });
      }

      const eventPayload = {
        event_id: point.eventId || `GPS-${Date.now()}-${i}`,
        surveyor_id: surveyorId,
        project_id: projectId || point.projectId || null,
        device_id: deviceId || point.deviceId || null,
        submission_id: submissionId || point.submissionId || null,
        latitude: lat,
        longitude: lng,
        altitude: point.altitude !== undefined ? point.altitude : null,
        accuracy: point.accuracy !== undefined ? point.accuracy : null,
        speed: point.speed !== undefined ? point.speed : null,
        heading: point.heading !== undefined ? point.heading : null,
        battery_level: point.batteryLevel !== undefined ? point.batteryLevel : null,
        network_type: point.networkType || null,
        is_mock_location: Boolean(point.isMockLocation),
        recorded_at: recordedAt,
      };

      dbEvents.push(eventPayload);
      previousPoint = { latitude: lat, longitude: lng, recordedAt };
    }

    // Batch insert into database
    const insertedCount = await fieldCatiModel.batchInsertGpsEvents(dbEvents);

    // Update device last heartbeat
    if (deviceId) {
      await fieldCatiModel.updateLastSync(deviceId);
    }

    return {
      pointsIngested: insertedCount,
      distanceCoveredKm: parseFloat(totalDistanceKm.toFixed(3)),
      anomaliesCount: anomalies.length,
      anomalies,
      latestLocation: dbEvents.length > 0 ? dbEvents[dbEvents.length - 1] : null,
    };
  },

  /**
   * Audio Chunk Manifest & Resumable Upload:
   * Tracks multi-part chunks, validates SHA-256 checksum, stores to disk,
   * and automatically assembles final recording when all chunks are received.
   *
   * @param {object} metadata
   * @param {Buffer} chunkBuffer
   * @param {string} surveyorId
   * @param {object} tenantContext
   * @returns {Promise<object>} Upload acknowledgment & assembly state
   */
  async processAudioChunk(metadata, chunkBuffer, surveyorId, tenantContext = {}) {
    const {
      recordingId,
      submissionId,
      clientSubmissionId,
      projectId,
      chunkIndex,
      totalChunks,
      chunkSizeBytes,
      sha256Hash,
    } = metadata;

    if (!chunkBuffer || chunkBuffer.length === 0) {
      throw new ValidationError('Audio chunk buffer cannot be empty');
    }

    // 1. Verify SHA-256 checksum
    const calculatedHash = crypto.createHash('sha256').update(chunkBuffer).digest('hex');
    if (sha256Hash && calculatedHash.toLowerCase() !== sha256Hash.toLowerCase()) {
      throw new ValidationError(
        `SHA-256 checksum mismatch. Expected: ${sha256Hash}, Received: ${calculatedHash}`
      );
    }

    // 2. Save individual chunk to disk
    const sessionChunksDir = path.join(CHUNKS_DIR, recordingId);
    if (!fs.existsSync(sessionChunksDir)) {
      fs.mkdirSync(sessionChunksDir, { recursive: true });
    }

    const chunkFileName = `chunk_${String(chunkIndex).padStart(5, '0')}.part`;
    const chunkFilePath = path.join(sessionChunksDir, chunkFileName);
    fs.writeFileSync(chunkFilePath, chunkBuffer);

    // 3. Upsert chunk manifest record in database
    const manifestEntry = await fieldCatiModel.upsertChunkManifest({
      recording_id: recordingId,
      submission_id: submissionId || null,
      client_submission_id: clientSubmissionId || null,
      project_id: projectId || null,
      surveyor_id: surveyorId,
      chunk_index: chunkIndex,
      total_chunks: totalChunks,
      chunk_size_bytes: chunkBuffer.length,
      sha256_hash: calculatedHash,
      storage_path: chunkFilePath,
      status: 'VERIFIED',
    });

    // 4. Check if all chunks are received
    const allUploadedChunks = await fieldCatiModel.findChunksByRecordingId(recordingId);
    const isComplete = allUploadedChunks.length === totalChunks;

    let assembledUrl = null;
    let assembledPath = null;

    if (isComplete) {
      // Assemble all chunks into single audio file
      const finalFileName = `${recordingId}.webm`;
      assembledPath = path.join(RECORDINGS_DIR, finalFileName);
      const writeStream = fs.createWriteStream(assembledPath);

      for (let i = 0; i < totalChunks; i++) {
        const partPath = path.join(sessionChunksDir, `chunk_${String(i).padStart(5, '0')}.part`);
        if (fs.existsSync(partPath)) {
          const partBuffer = fs.readFileSync(partPath);
          writeStream.write(partBuffer);
        } else {
          logger.warn(`Missing audio chunk ${i} during assembly of ${recordingId}`);
        }
      }
      writeStream.end();

      assembledUrl = `/uploads/recordings/${finalFileName}`;

      // Mark chunks as ASSEMBLED in database
      await fieldCatiModel.markChunksAssembled(recordingId, assembledUrl);

      // If associated submission exists, update its audio reference
      if (submissionId) {
        await db('submissions')
          .where({ id: submissionId })
          .orWhere({ submission_id: submissionId })
          .update({
            respondent_metadata: db.raw(
              "jsonb_set(COALESCE(respondent_metadata, '{}'::jsonb), '{audioUrl}', ?)",
              [JSON.stringify(assembledUrl)]
            ),
            updated_at: db.fn.now(),
          });
      }

      logger.info(`Successfully assembled multi-part audio recording ${recordingId}`, {
        totalChunks,
        assembledPath,
      });
    }

    return {
      recordingId,
      chunkIndex,
      totalChunks,
      chunksUploaded: allUploadedChunks.length,
      isComplete,
      assembledUrl,
      status: isComplete ? 'ASSEMBLED' : 'CHUNKING',
    };
  },

  /**
   * Robust Idempotent Batch Sync:
   * Receives batch submissions completed offline, verifies deduplication by
   * (vendor_id, project_id, client_submission_id), commits canonical records in Knex transaction,
   * and triggers the AI pre-processing pipeline.
   *
   * @param {object} payload
   * @param {string} surveyorId
   * @param {object} tenantContext
   * @returns {Promise<object>} Idempotent batch sync result
   */
  async syncBatchSubmissions(payload, surveyorId, tenantContext = {}) {
    const { submissions = [], deviceId } = payload;

    if (!submissions || submissions.length === 0) {
      throw new ValidationError('Batch submissions list cannot be empty');
    }

    const batchId = `SYNC-${dayjs().format('YYYYMMDDHHmmss')}-${crypto.randomBytes(4).toString('hex')}`;
    let createdCount = 0;
    let updatedCount = 0;
    let duplicateCount = 0;
    const results = [];

    const effectiveVendorId = tenantContext.vendorId || null;
    const projectId = submissions[0]?.projectId || null;

    for (const item of submissions) {
      const clientSubId = item.clientSubmissionId;
      const subProjectId = item.projectId;
      const subVendorId = item.vendorId || effectiveVendorId;

      await db.transaction(async (trx) => {
        // Deduplication check by (vendor_id, project_id, client_submission_id)
        let existing = await trx('submissions')
          .where('project_id', subProjectId)
          .andWhereRaw("respondent_metadata->>'clientSubmissionId' = ?", [clientSubId])
          .first();

        // Also check if existing by vendorId if present
        if (existing && subVendorId && existing.vendor_id && existing.vendor_id !== subVendorId) {
          existing = null;
        }

        if (existing) {
          // Idempotent update or acknowledge
          await trx('submissions')
            .where('id', existing.id)
            .update({
              source_status: item.sourceStatus || existing.source_status,
              completed_at: item.completedAt || existing.completed_at,
              updated_at: db.fn.now(),
            });

          // Update responses if provided
          if (item.responses && item.responses.length > 0) {
            for (const resp of item.responses) {
              const existingResp = await trx('submission_responses')
                .where({
                  submission_id: existing.id,
                  question_tag: resp.questionTag,
                })
                .first();

              if (existingResp) {
                await trx('submission_responses')
                  .where('id', existingResp.id)
                  .update({
                    response_value: JSON.stringify(resp.responseValue),
                    time_taken_seconds: resp.timeTakenSeconds || existingResp.time_taken_seconds,
                    updated_at: db.fn.now(),
                  });
              } else {
                await trx('submission_responses').insert({
                  submission_id: existing.id,
                  question_id: resp.questionId || null,
                  question_tag: resp.questionTag,
                  response_value: JSON.stringify(resp.responseValue),
                  time_taken_seconds: resp.timeTakenSeconds || null,
                  created_at: db.fn.now(),
                  updated_at: db.fn.now(),
                });
              }
            }
          }

          duplicateCount++;
          updatedCount++;
          results.push({
            clientSubmissionId: clientSubId,
            submissionId: existing.submission_id,
            status: 'IDEMPOTENT_UPDATED',
          });
        } else {
          // Canonical New Submission creation
          const canonicalSubmissionCode = await this.generateSubmissionCode(subProjectId, trx);

          const metadata = {
            ...(item.respondentMetadata || {}),
            clientSubmissionId: clientSubId,
            audioRecordingId: item.audioRecordingId || null,
            audioUrl: item.audioUrl || null,
            offlineSyncBatchId: batchId,
          };

          const [newSubmission] = await trx('submissions')
            .insert({
              submission_id: canonicalSubmissionCode,
              project_id: subProjectId,
              vendor_id: subVendorId,
              state_id: item.stateId || null,
              source_channel: 'FIELD_CATI',
              source_agent_id: surveyorId,
              source_device_id: deviceId || item.sourceDeviceId || null,
              questionnaire_version_id: item.questionnaireVersionId || null,
              respondent_name: item.respondentName || null,
              respondent_phone: item.respondentPhone || null,
              respondent_metadata: JSON.stringify(metadata),
              geography_data: JSON.stringify(item.geographyData || {}),
              source_status: item.sourceStatus || 'SUBMITTED',
              capi_status: 'PENDING',
              started_at: item.startedAt || db.fn.now(),
              completed_at: item.completedAt || db.fn.now(),
              created_at: db.fn.now(),
              updated_at: db.fn.now(),
            })
            .returning('*');

          // Commit responses
          if (item.responses && item.responses.length > 0) {
            const respRows = item.responses.map((resp) => ({
              submission_id: newSubmission.id,
              question_id: resp.questionId || null,
              question_tag: resp.questionTag,
              response_value: JSON.stringify(resp.responseValue),
              time_taken_seconds: resp.timeTakenSeconds || null,
              created_at: db.fn.now(),
              updated_at: db.fn.now(),
            }));
            await trx('submission_responses').insert(respRows);
          }

          // Ingest GPS fixes if bundled with submission
          if (item.gpsEvents && item.gpsEvents.length > 0) {
            const gpsPayload = item.gpsEvents.map((g) => ({
              event_id: `GPS-SUB-${newSubmission.id}-${Date.now()}`,
              surveyor_id: surveyorId,
              project_id: subProjectId,
              device_id: deviceId || null,
              submission_id: newSubmission.submission_id,
              latitude: parseFloat(g.latitude || g.lat),
              longitude: parseFloat(g.longitude || g.lng),
              accuracy: g.accuracy || null,
              recorded_at: g.recordedAt || db.fn.now(),
            }));
            await fieldCatiModel.batchInsertGpsEvents(gpsPayload, trx);
          }

          createdCount++;
          results.push({
            clientSubmissionId: clientSubId,
            submissionId: newSubmission.submission_id,
            canonicalId: newSubmission.id,
            status: 'CREATED',
          });

          // Trigger AI Pre-Processing Pipeline
          await this.dispatchAiPreprocessing({
            submissionId: newSubmission.id,
            submissionCode: newSubmission.submission_id,
            projectId: subProjectId,
            vendorId: subVendorId,
            surveyorId,
            audioRecordingId: item.audioRecordingId || null,
            audioUrl: item.audioUrl || null,
            responsesCount: item.responses ? item.responses.length : 0,
            timestamp: new Date().toISOString(),
          });
        }
      });
    }

    // Record offline sync log
    await fieldCatiModel.createSyncLog({
      batch_id: batchId,
      vendor_id: effectiveVendorId,
      project_id: projectId,
      surveyor_id: surveyorId,
      device_id: deviceId || null,
      total_records: submissions.length,
      successful_records: createdCount + updatedCount,
      failed_records: 0,
      conflicts_count: duplicateCount,
      sync_status: 'SUCCESS',
      sync_details: {
        batchId,
        createdCount,
        updatedCount,
        duplicateCount,
        results,
      },
      client_timestamp: payload.clientTimestamp || new Date(),
      server_timestamp: new Date(),
    });

    return {
      batchId,
      totalSubmitted: submissions.length,
      created: createdCount,
      updated: updatedCount,
      duplicates: duplicateCount,
      results,
    };
  },

  /**
   * Dispatches task to AI pre-processing pipeline via BullMQ or local async fallback
   *
   * @param {object} jobData
   * @returns {Promise<void>}
   */
  async dispatchAiPreprocessing(jobData) {
    try {
      if (aiProcessingQueue) {
        await aiProcessingQueue.add('process-field-submission', jobData, {
          jobId: `ai-prep-${jobData.submissionId}`,
        });
        logger.info(`Dispatched submission ${jobData.submissionCode} to BullMQ AI pre-processing queue.`);
      } else {
        // Fallback: asynchronous background log / execution
        setImmediate(async () => {
          logger.info(`[AI Pipeline Fallback] Processing submission ${jobData.submissionCode} speech-to-text & quality checks.`);
        });
      }
    } catch (err) {
      logger.warn(`Could not enqueue AI pre-processing task for ${jobData.submissionCode}:`, {
        error: err.message,
      });
    }
  },

  /**
   * Get active surveyor assignments with targets and progress
   *
   * @param {string} surveyorId
   * @param {object} filters
   * @param {object} tenantContext
   * @returns {Promise<Array<object>>}
   */
  async getSurveyorAssignments(surveyorId, filters = {}, tenantContext = {}) {
    const queryFilters = {
      ...filters,
      surveyorId,
    };

    if (tenantContext.vendorId) {
      queryFilters.vendorId = tenantContext.vendorId;
    }

    const assignments = await fieldCatiModel.findAssignments(queryFilters);

    // Compute live progress counts for each assignment
    return Promise.all(
      assignments.map(async (asn) => {
        let completed = asn.completed_count || 0;
        try {
          if (asn.project_id) {
            const [{ count }] = await db('submissions')
              .where({
                project_id: asn.project_id,
                source_agent_id: surveyorId,
              })
              .count('id as count');
            completed = parseInt(count, 10);
          }
        } catch (cntErr) {
          logger.debug('Progress count check fallback:', { error: cntErr.message });
        }

        const targetQuota = asn.target_quota || 100;
        const progressPercentage = Math.min(100, Math.round((completed / targetQuota) * 100));

        return {
          ...asn,
          completed_count: completed,
          progress_percentage: progressPercentage,
          is_quota_reached: completed >= targetQuota,
        };
      })
    );
  },

  /**
   * Registers or updates surveyor mobile device
   *
   * @param {object} data
   * @param {string} surveyorId
   * @param {object} tenantContext
   * @returns {Promise<object>}
   */
  async registerDevice(data, surveyorId, tenantContext = {}) {
    return fieldCatiModel.registerOrUpdateDevice({
      device_id: data.deviceId,
      hardware_uuid: data.hardwareUuid,
      user_id: surveyorId,
      vendor_id: tenantContext.vendorId || null,
      device_model: data.deviceModel || null,
      os_version: data.osVersion || null,
      app_version: data.appVersion || null,
      fcm_token: data.fcmToken || null,
      status: 'ACTIVE',
    });
  },

  /**
   * Retrieves reconstructed GPS trail for an agent
   *
   * @param {string} surveyorId
   * @param {object} params
   * @returns {Promise<object>}
   */
  async getAgentGpsTrail(surveyorId, params = {}) {
    const points = await fieldCatiModel.findGpsTrail({
      surveyorId,
      projectId: params.projectId,
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
      limit: params.limit || 500,
    });

    let totalDistKm = 0;
    for (let i = 1; i < points.length; i++) {
      totalDistKm += calculateHaversineDistanceKm(
        points[i - 1].latitude,
        points[i - 1].longitude,
        points[i].latitude,
        points[i].longitude
      );
    }

    return {
      surveyorId,
      totalPoints: points.length,
      distanceCoveredKm: parseFloat(totalDistKm.toFixed(3)),
      trail: points,
    };
  },
};

module.exports = fieldCatiService;
