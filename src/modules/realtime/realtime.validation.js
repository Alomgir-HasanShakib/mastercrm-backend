/**
 * @file realtime.validation.js
 * @description Joi validation schemas for Realtime workforce presence queries, manual broadcasts, and state updates.
 */

const Joi = require('joi');

const VALID_STATES = [
  'ONLINE',
  'OFFLINE',
  'IDLE',
  'IN_CALL',
  'WRAP_UP',
  'BREAK',
  'SURVEY_IN_PROGRESS',
  'AUDIT_IN_PROGRESS',
  'SYNCING',
];

const VALID_CHANNELS = ['CATI', 'CAPI', 'TVC', 'FA', 'PORTAL'];

/**
 * Validation schema for GET /workforce/live query parameters.
 */
const workforceLiveQuerySchema = Joi.object({
  channel: Joi.string().valid(...VALID_CHANNELS).optional(),
  state: Joi.string().valid(...VALID_STATES).optional(),
  role: Joi.string().max(64).optional(),
  vendorId: Joi.string().allow(null, '').optional(),
  projectId: Joi.string().allow(null, '').optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(200).default(50),
});

/**
 * Validation schema for POST /broadcast manual system announcement.
 */
const broadcastMessageSchema = Joi.object({
  message: Joi.string().min(1).max(2000).required(),
  title: Joi.string().max(255).default('Workforce Broadcast'),
  type: Joi.string().valid('INFO', 'WARNING', 'ALERT', 'URGENT').default('INFO'),
  targetRoom: Joi.string().allow(null, '').optional(),
  targetVendorId: Joi.string().allow(null, '').optional(),
  targetProjectId: Joi.string().allow(null, '').optional(),
  targetRole: Joi.string().allow(null, '').optional(),
  targetChannel: Joi.string().valid(...VALID_CHANNELS, 'ALL').default('ALL'),
  targetUserId: Joi.string().allow(null, '').optional(),
});

/**
 * Validation schema for supervisor or system manual state change POST /workforce/state.
 */
const stateTransitionSchema = Joi.object({
  userId: Joi.string().allow(null, '').optional(),
  state: Joi.string().valid(...VALID_STATES).required(),
  channel: Joi.string().valid(...VALID_CHANNELS).default('PORTAL'),
  projectId: Joi.string().allow(null, '').optional(),
  reason: Joi.string().max(255).allow(null, '').optional(),
  metadata: Joi.object().default({}),
});

/**
 * Validation schema for routes with :userId route parameter.
 */
const userIdParamSchema = Joi.object({
  userId: Joi.string().required(),
});

/**
 * Validation schema for POST /api/v1/realtime/ping heartbeat
 */
const pingSchema = Joi.object({
  latitude: Joi.number().min(-90).max(90).optional(),
  lat: Joi.number().min(-90).max(90).optional(),
  longitude: Joi.number().min(-180).max(180).optional(),
  lng: Joi.number().min(-180).max(180).optional(),
  accuracy: Joi.number().min(0).optional(),
  batteryLevel: Joi.number().min(0).max(100).optional(),
  battery: Joi.number().min(0).max(100).optional(),
  status: Joi.string().valid('ACTIVE', 'IDLE', 'OFFLINE', 'ONLINE', ...VALID_STATES).default('ACTIVE'),
  currentAction: Joi.string().max(255).allow('', null).optional(),
  idleDuration: Joi.number().min(0).optional(),
  deviceId: Joi.string().max(100).allow('', null).optional(),
  projectId: Joi.string().allow('', null).optional(),
  campaignId: Joi.string().allow('', null).optional(),
  channel: Joi.string().valid(...VALID_CHANNELS).optional(),
  metadata: Joi.object().optional(),
});

/**
 * Validation schema for GET /api/v1/realtime/presence
 */
const presenceQuerySchema = Joi.object({
  status: Joi.string().allow('', null).optional(),
  channel: Joi.string().allow('', null).optional(),
  role: Joi.string().allow('', null).optional(),
  vendorId: Joi.string().allow('', null).optional(),
  projectId: Joi.string().allow('', null).optional(),
  campaignId: Joi.string().allow('', null).optional(),
  search: Joi.string().allow('', null).optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(500).default(100),
});

module.exports = {
  VALID_STATES,
  VALID_CHANNELS,
  workforceLiveQuerySchema,
  broadcastMessageSchema,
  stateTransitionSchema,
  userIdParamSchema,
  pingSchema,
  presenceQuerySchema,
};

