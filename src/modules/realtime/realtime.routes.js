/**
 * @file realtime.routes.js
 * @description Express routing definitions for Realtime workforce presence, live monitoring, and broadcast notifications.
 */

const express = require('express');
const { authenticate } = require('../../middleware/auth');
const { setTenantContext } = require('../../middleware/tenancy');
const { checkPermission } = require('../../middleware/rbac');
const { validate } = require('../../middleware/validator');
const realtimeController = require('./realtime.controller');
const {
  workforceLiveQuerySchema,
  broadcastMessageSchema,
  stateTransitionSchema,
  userIdParamSchema,
  pingSchema,
  presenceQuerySchema,
} = require('./realtime.validation');

const router = express.Router();


// Enforce authentication & tenant context across all realtime endpoints
router.use(authenticate, setTenantContext);

/**
 * @route GET /api/v1/realtime/workforce/live
 * @desc Get live workforce presence summary across CATI, CAPI, TVC, FA and active roster
 * @access Authenticated (Supervisor, Admin, Manager)
 */
router.get(
  '/workforce/live',
  checkPermission('realtime', 'read'),
  validate(workforceLiveQuerySchema, 'query'),
  realtimeController.getLiveWorkforce
);

/**
 * @route POST /api/v1/realtime/broadcast
 * @desc Broadcast administrative announcement or alert to workforce rooms
 * @access Authenticated (Supervisor, Master Admin)
 */
router.post(
  '/broadcast',
  checkPermission('realtime', 'manage'),
  validate(broadcastMessageSchema, 'body'),
  realtimeController.broadcastMessage
);

/**
 * @route GET /api/v1/realtime/users/:userId/presence
 * @desc Inspect single user's current live presence status
 * @access Authenticated
 */
router.get(
  '/users/:userId/presence',
  checkPermission('realtime', 'read'),
  validate(userIdParamSchema, 'params'),
  realtimeController.getUserPresence
);

/**
 * @route POST /api/v1/realtime/workforce/state
 * @desc Update or force an agent operational presence state
 * @access Authenticated
 */
router.post(
  '/workforce/state',
  checkPermission('realtime', 'write'),
  validate(stateTransitionSchema, 'body'),
  realtimeController.setWorkforceState
);

/**
 * @route GET /api/v1/realtime/presence
 * @desc Get live active users, GPS coordinates, battery level, status (ACTIVE/IDLE/OFFLINE), currentAction, idleDuration, lastPingAt
 * @access Authenticated
 */
router.get(
  '/presence',
  checkPermission('realtime', 'read'),
  validate(presenceQuerySchema, 'query'),
  realtimeController.getPresence
);

/**
 * @route POST /api/v1/realtime/ping
 * @desc Agent heartbeat ping updating GPS lat/lng, battery %, status, and current task action
 * @access Authenticated (All active field and office users)
 */
router.post(
  '/ping',
  validate(pingSchema, 'body'),
  realtimeController.pingHeartbeat
);

module.exports = router;

