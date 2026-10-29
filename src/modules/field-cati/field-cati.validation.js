/**
 * @file field-cati.validation.js
 * @description Joi validation schemas for Field CATI prefetch manifests, GPS trail ingestion, audio chunks, and offline batch sync.
 */

const Joi = require('joi');

/**
 * Manifest route parameter schema
 */
const manifestParamsSchema = Joi.object({
  projectId: Joi.string().required().messages({
    'string.empty': 'Project ID is required',
    'any.required': 'Project ID is required',
  }),
});

/**
 * GPS Fix Event Schema
 */
const gpsEventItemSchema = Joi.object({
  eventId: Joi.string().optional().allow(null, ''),
  latitude: Joi.number().min(-90).max(90).required().messages({
    'number.base': 'Latitude must be a valid number',
    'number.min': 'Latitude must be >= -90',
    'number.max': 'Latitude must be <= 90',
    'any.required': 'Latitude is required',
  }),
  longitude: Joi.number().min(-180).max(180).required().messages({
    'number.base': 'Longitude must be a valid number',
    'number.min': 'Longitude must be >= -180',
    'number.max': 'Longitude must be <= 180',
    'any.required': 'Longitude is required',
  }),
  altitude: Joi.number().optional().allow(null),
  accuracy: Joi.number().min(0).optional().allow(null),
  speed: Joi.number().min(0).optional().allow(null),
  heading: Joi.number().min(0).max(360).optional().allow(null),
  batteryLevel: Joi.number().min(0).max(100).optional().allow(null),
  networkType: Joi.string().max(50).optional().allow(null, ''),
  isMockLocation: Joi.boolean().default(false),
  submissionId: Joi.string().optional().allow(null, ''),
  recordedAt: Joi.date().iso().optional().allow(null),
  timestamp: Joi.alternatives().try(Joi.date().iso(), Joi.number()).optional(),
});

/**
 * Batch GPS Ingestion Schema
 */
const gpsBatchSchema = Joi.object({
  projectId: Joi.string().optional().allow(null, ''),
  deviceId: Joi.string().optional().allow(null, ''),
  submissionId: Joi.string().optional().allow(null, ''),
  events: Joi.array().items(gpsEventItemSchema).min(1).required().messages({
    'array.min': 'At least one GPS event is required',
    'any.required': 'Events array is required',
  }),
});

/**
 * Audio Chunk Upload Metadata Schema
 */
const audioChunkSchema = Joi.object({
  recordingId: Joi.string().max(128).required().messages({
    'string.empty': 'Recording ID is required',
    'any.required': 'Recording ID is required',
  }),
  chunkIndex: Joi.number().integer().min(0).required().messages({
    'number.base': 'Chunk index must be an integer',
    'number.min': 'Chunk index must be >= 0',
    'any.required': 'Chunk index is required',
  }),
  totalChunks: Joi.number().integer().min(1).required().messages({
    'number.base': 'Total chunks must be an integer',
    'number.min': 'Total chunks must be >= 1',
    'any.required': 'Total chunks is required',
  }),
  chunkSizeBytes: Joi.number().integer().min(0).required().messages({
    'number.base': 'Chunk size in bytes must be an integer',
    'any.required': 'Chunk size in bytes is required',
  }),
  sha256Hash: Joi.string().hex().length(64).required().messages({
    'string.hex': 'SHA-256 hash must be valid hexadecimal',
    'string.length': 'SHA-256 hash must be exactly 64 characters',
    'any.required': 'SHA-256 hash is required',
  }),
  submissionId: Joi.string().optional().allow(null, ''),
  clientSubmissionId: Joi.string().optional().allow(null, ''),
  projectId: Joi.string().optional().allow(null, ''),
  chunkData: Joi.string().optional().allow(null, ''), // Base64 encoded if sending via JSON body
});

/**
 * Single Offline Submission Response Item Schema
 */
const submissionResponseItemSchema = Joi.object({
  questionId: Joi.string().optional().allow(null, ''),
  questionTag: Joi.string().required().messages({
    'string.empty': 'Question tag is required',
    'any.required': 'Question tag is required',
  }),
  responseValue: Joi.any().required().messages({
    'any.required': 'Response value is required',
  }),
  optionIds: Joi.array().items(Joi.string()).optional(),
  timeTakenSeconds: Joi.number().min(0).optional().allow(null),
  audioTimestampSeconds: Joi.number().min(0).optional().allow(null),
  metadata: Joi.object().optional(),
});

/**
 * Single Offline Submission Item Schema
 */
const offlineSubmissionItemSchema = Joi.object({
  clientSubmissionId: Joi.string().max(128).required().messages({
    'string.empty': 'Client submission ID is required for idempotent deduplication',
    'any.required': 'Client submission ID is required',
  }),
  projectId: Joi.string().required().messages({
    'string.empty': 'Project ID is required',
    'any.required': 'Project ID is required',
  }),
  vendorId: Joi.string().optional().allow(null, ''),
  questionnaireVersionId: Joi.string().optional().allow(null, ''),
  stateId: Joi.string().optional().allow(null, ''),
  acId: Joi.string().optional().allow(null, ''),
  pcId: Joi.string().optional().allow(null, ''),
  sepId: Joi.string().optional().allow(null, ''),
  respondentName: Joi.string().max(255).optional().allow(null, ''),
  respondentPhone: Joi.string().max(50).optional().allow(null, ''),
  respondentMetadata: Joi.object().optional(),
  geographyData: Joi.object().optional(),
  sourceStatus: Joi.string().default('SUBMITTED'),
  startedAt: Joi.date().iso().optional(),
  completedAt: Joi.date().iso().optional(),
  audioRecordingId: Joi.string().optional().allow(null, ''),
  audioUrl: Joi.string().optional().allow(null, ''),
  sourceDeviceId: Joi.string().optional().allow(null, ''),
  responses: Joi.array().items(submissionResponseItemSchema).default([]),
  gpsEvents: Joi.array().items(gpsEventItemSchema).optional(),
});

/**
 * Batch Offline Sync Request Schema
 */
const offlineBatchSyncSchema = Joi.object({
  deviceId: Joi.string().max(128).optional().allow(null, ''),
  clientTimestamp: Joi.date().iso().optional(),
  submissions: Joi.array().items(offlineSubmissionItemSchema).min(1).required().messages({
    'array.min': 'At least one submission is required in batch sync',
    'any.required': 'Submissions array is required',
  }),
});

/**
 * Assignments Query Schema
 */
const assignmentsQuerySchema = Joi.object({
  projectId: Joi.string().optional(),
  status: Joi.string().valid('ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'ALL').default('ALL'),
  stateId: Joi.string().optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

/**
 * Device Registration Schema
 */
const registerDeviceSchema = Joi.object({
  deviceId: Joi.string().max(128).required().messages({
    'string.empty': 'Device ID is required',
    'any.required': 'Device ID is required',
  }),
  hardwareUuid: Joi.string().max(128).optional().allow(null, ''),
  deviceModel: Joi.string().max(100).optional().allow(null, ''),
  osVersion: Joi.string().max(50).optional().allow(null, ''),
  appVersion: Joi.string().max(50).optional().allow(null, ''),
  fcmToken: Joi.string().max(512).optional().allow(null, ''),
});

/**
 * GPS Trail Query Schema
 */
const gpsTrailQuerySchema = Joi.object({
  projectId: Joi.string().optional(),
  dateFrom: Joi.date().iso().optional(),
  dateTo: Joi.date().iso().optional(),
  limit: Joi.number().integer().min(1).max(2000).default(500),
});

module.exports = {
  manifestParamsSchema,
  gpsEventItemSchema,
  gpsBatchSchema,
  audioChunkSchema,
  offlineSubmissionItemSchema,
  offlineBatchSyncSchema,
  assignmentsQuerySchema,
  registerDeviceSchema,
  gpsTrailQuerySchema,
};
