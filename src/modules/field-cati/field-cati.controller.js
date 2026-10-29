/**
 * @file field-cati.controller.js
 * @description HTTP Controller handling Field CATI offline bundle prefetching, GPS trail batch ingestion, audio chunk uploads, and idempotent batch sync.
 */

const { success } = require('../../utils/response');
const { ValidationError } = require('../../utils/errors');
const fieldCatiService = require('./field-cati.service');

const fieldCatiController = {
  /**
   * Prefetch Project Manifest for offline caching and encryption
   * @route GET /api/v1/field-cati/manifest/:projectId
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async getProjectManifest(req, res, next) {
    try {
      const { projectId } = req.params;
      const manifest = await fieldCatiService.getProjectManifest(projectId, req.tenantContext);

      // Set ETag header matching manifest cryptographic hash
      res.setHeader('ETag', `"${manifest.manifestHash}"`);
      res.setHeader('Cache-Control', 'public, max-age=3600');

      return success(res, manifest, 'Project offline manifest generated successfully', 200);
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Batch ingest GPS trail locations from mobile surveyor device
   * @route POST /api/v1/field-cati/location/batch
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async ingestGpsBatch(req, res, next) {
    try {
      const surveyorId = req.user.userId;
      const result = await fieldCatiService.ingestGpsBatch(req.body, surveyorId, req.tenantContext);

      return success(res, result, 'GPS location batch ingested successfully', 201);
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Upload and acknowledge multi-part audio chunk
   * Supports either multipart/form-data (via multer memoryStorage) or base64 JSON payload
   * @route POST /api/v1/field-cati/audio/chunk
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async uploadAudioChunk(req, res, next) {
    try {
      const surveyorId = req.user.userId;
      let chunkBuffer = null;

      if (req.file && req.file.buffer) {
        chunkBuffer = req.file.buffer;
      } else if (req.body.chunkData) {
        chunkBuffer = Buffer.from(req.body.chunkData, 'base64');
      } else {
        throw new ValidationError('Audio chunk binary data is missing. Provide multipart file or base64 chunkData.');
      }

      const metadata = {
        recordingId: req.body.recordingId,
        submissionId: req.body.submissionId || null,
        clientSubmissionId: req.body.clientSubmissionId || null,
        projectId: req.body.projectId || null,
        chunkIndex: parseInt(req.body.chunkIndex, 10),
        totalChunks: parseInt(req.body.totalChunks, 10),
        chunkSizeBytes: parseInt(req.body.chunkSizeBytes || chunkBuffer.length, 10),
        sha256Hash: req.body.sha256Hash,
      };

      const result = await fieldCatiService.processAudioChunk(
        metadata,
        chunkBuffer,
        surveyorId,
        req.tenantContext
      );

      return success(
        res,
        result,
        result.isComplete ? 'All audio chunks received and assembled successfully' : 'Audio chunk acknowledged',
        200
      );
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Idempotent batch sync for submissions completed offline
   * @route POST /api/v1/field-cati/sync/batch
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async syncBatchSubmissions(req, res, next) {
    try {
      const surveyorId = req.user.userId;
      const syncResult = await fieldCatiService.syncBatchSubmissions(
        req.body,
        surveyorId,
        req.tenantContext
      );

      return success(res, syncResult, 'Offline submissions batch synchronized successfully', 200);
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Retrieve field surveyor assignments
   * @route GET /api/v1/field-cati/assignments
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async getAssignments(req, res, next) {
    try {
      const surveyorId = req.user.userId;
      const assignments = await fieldCatiService.getSurveyorAssignments(
        surveyorId,
        req.query,
        req.tenantContext
      );

      return success(res, assignments, 'Surveyor assignments retrieved successfully', 200);
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Register mobile collector device
   * @route POST /api/v1/field-cati/device/register
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async registerDevice(req, res, next) {
    try {
      const surveyorId = req.user.userId;
      const registered = await fieldCatiService.registerDevice(
        req.body,
        surveyorId,
        req.tenantContext
      );

      return success(res, registered, 'Device registered successfully', 200);
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Get reconstructed GPS trail polyline for a surveyor
   * @route GET /api/v1/field-cati/location/trail/:surveyorId
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async getGpsTrail(req, res, next) {
    try {
      const targetSurveyorId = req.params.surveyorId || req.user.userId;
      const trail = await fieldCatiService.getAgentGpsTrail(targetSurveyorId, req.query);

      return success(res, trail, 'GPS location trail retrieved successfully', 200);
    } catch (err) {
      return next(err);
    }
  },
};

module.exports = fieldCatiController;
