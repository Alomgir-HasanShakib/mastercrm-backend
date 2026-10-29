/**
 * @file field-cati.routes.js
 * @description Express routing definitions for Field CATI, offline manifest prefetching, GPS trails, audio chunking, and batch sync.
 */

const express = require('express');
const multer = require('multer');
const { authenticate } = require('../../middleware/auth');
const { setTenantContext } = require('../../middleware/tenancy');
const { validate } = require('../../middleware/validator');
const fieldCatiController = require('./field-cati.controller');
const {
  manifestParamsSchema,
  gpsBatchSchema,
  audioChunkSchema,
  offlineBatchSyncSchema,
  assignmentsQuerySchema,
  registerDeviceSchema,
  gpsTrailQuerySchema,
} = require('./field-cati.validation');

const router = express.Router();

// Configure in-memory upload handler for audio chunks
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 30 * 1024 * 1024, // 30 MB chunk limit
  },
});

// All Field CATI routes require authenticated user and tenant context
router.use(authenticate, setTenantContext);

/**
 * @route GET /api/v1/field-cati/manifest/:projectId
 * @desc Download project manifest for offline caching and questionnaire execution
 * @access Authenticated Surveyor / Vendor Agent
 */
router.get(
  '/manifest/:projectId',
  validate(manifestParamsSchema, 'params'),
  fieldCatiController.getProjectManifest
);

/**
 * @route POST /api/v1/field-cati/location/batch
 * @desc Batch ingest GPS trail events and detect location spoofing/anomalies
 * @access Authenticated Surveyor
 */
router.post(
  '/location/batch',
  validate(gpsBatchSchema, 'body'),
  fieldCatiController.ingestGpsBatch
);

/**
 * @route POST /api/v1/field-cati/audio/chunk
 * @desc Upload and acknowledge resumable audio chunk (supports multipart form file or base64)
 * @access Authenticated Surveyor
 */
router.post(
  '/audio/chunk',
  upload.single('chunk'),
  validate(audioChunkSchema, 'body'),
  fieldCatiController.uploadAudioChunk
);

/**
 * @route POST /api/v1/field-cati/sync/batch
 * @desc Idempotent batch sync for surveys completed offline with deduplication
 * @access Authenticated Surveyor
 */
router.post(
  '/sync/batch',
  validate(offlineBatchSyncSchema, 'body'),
  fieldCatiController.syncBatchSubmissions
);

/**
 * @route GET /api/v1/field-cati/assignments
 * @desc Retrieve active surveyor assignments with quotas and target progress
 * @access Authenticated Surveyor
 */
router.get(
  '/assignments',
  validate(assignmentsQuerySchema, 'query'),
  fieldCatiController.getAssignments
);

/**
 * @route POST /api/v1/field-cati/device/register
 * @desc Register or update surveyor mobile device metadata
 * @access Authenticated Surveyor
 */
router.post(
  '/device/register',
  validate(registerDeviceSchema, 'body'),
  fieldCatiController.registerDevice
);

/**
 * @route GET /api/v1/field-cati/location/trail/:surveyorId
 * @desc Get reconstructed GPS breadcrumb trail
 * @access Authenticated Auditor / Supervisor
 */
router.get(
  '/location/trail/:surveyorId',
  validate(gpsTrailQuerySchema, 'query'),
  fieldCatiController.getGpsTrail
);

module.exports = router;
