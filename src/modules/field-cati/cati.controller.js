/**
 * @file cati.controller.js
 * @description HTTP controller for CATI - Field Survey (FIELD_CATI) endpoints:
 * - GET /api/v1/cati/assignments
 * - POST /api/v1/cati/submissions/:id
 * - POST /api/v1/cati/submissions/:id/audio
 * - POST /api/v1/cati/sync
 */

const { success } = require('../../utils/response');
const catiService = require('./cati.service');
const { logOperation } = require('../../middlewares/auditLog.middleware');

const catiController = {
  /**
   * Retrieves assigned ACs, active project, and dynamic questionnaire manifest.
   * @route GET /api/v1/cati/assignments
   */
  async getAssignments(req, res, next) {
    try {
      const data = await catiService.getAssignments(req.user, req.tenantContext);
      return success(res, data, 'Field assignments and questionnaire manifest loaded successfully', 200);
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Saves a field survey submission with question tags and responses.
   * @route POST /api/v1/cati/submissions/:id
   */
  async saveSubmission(req, res, next) {
    try {
      const { id } = req.params;
      const result = await catiService.saveSubmission(id, req.body, req.user);

      logOperation({
        req,
        action: 'CATI_SURVEY_SUBMISSION',
        module: 'CATI',
        entityType: 'submissions',
        entityId: id,
        newValues: { status: result.status, questionCount: Object.keys(req.body.responses || {}).length },
        metadata: { submissionId: id },
      });

      return success(res, result, 'Survey submission and question tags saved successfully', 201);
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Uploads recorded audio for a survey submission.
   * @route POST /api/v1/cati/submissions/:id/audio
   */
  async uploadAudio(req, res, next) {
    try {
      const { id } = req.params;
      const fileObj = req.file || null;
      const meta = req.body || {};
      const result = await catiService.uploadAudio(id, fileObj, meta, req.user);

      logOperation({
        req,
        action: 'CATI_AUDIO_UPLOAD',
        module: 'CATI',
        entityType: 'submissions',
        entityId: id,
        newValues: { audioUrl: result.audioUrl || result.url },
        metadata: { fileSize: fileObj?.size },
      });

      return success(res, result, 'Survey audio uploaded and linked successfully', 200);
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Synchronizes offline surveys, audio, and GPS trails in batch.
   * @route POST /api/v1/cati/sync
   */
  async syncOffline(req, res, next) {
    try {
      const result = await catiService.syncOfflineSubmissions(req.body, req.user);

      logOperation({
        req,
        action: 'CATI_OFFLINE_SYNC',
        module: 'CATI',
        entityType: 'offline_batch',
        entityId: 'sync-batch',
        newValues: { count: result.processedCount || result.length || 0 },
        metadata: { result },
      });

      return success(res, result, 'Offline survey batch processed successfully', 200);
    } catch (err) {
      return next(err);
    }
  },
};

module.exports = catiController;
