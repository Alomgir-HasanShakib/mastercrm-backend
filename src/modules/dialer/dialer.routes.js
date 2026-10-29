/**
 * @file dialer.routes.js
 * @description Express routing definitions for Dialer Integration Hub (Click-to-call, Webhooks, CDR ingestion).
 */

const express = require('express');
const { authenticate } = require('../../middleware/auth');
const { setTenantContext } = require('../../middleware/tenancy');
const { checkPermission } = require('../../middleware/rbac');
const { validate } = require('../../middleware/validator');
const dialerController = require('./dialer.controller');
const {
  idParamSchema,
  clickToCallSchema,
  hangupCallSchema,
  cdrIngestSchema,
  listCdrSchema,
  statsQuerySchema,
} = require('./dialer.validation');

const router = express.Router();

/**
 * Public Webhook Receiver endpoints (called asynchronously by Asterisk AMI, Twilio, Vicidial, or REST Telephony Gateways)
 */
router.post(
  '/webhook/:provider',
  dialerController.handleWebhook
);

router.post(
  '/webhook',
  dialerController.handleWebhook
);

// Authenticated Dialer Operations
router.use(authenticate, setTenantContext);

/**
 * @route POST /api/v1/dialer/click-to-call
 * @route POST /api/v1/dialer/call
 * @desc Initiate outbound click-to-call session
 */
router.post(
  '/click-to-call',
  checkPermission('dialer', 'create'),
  validate(clickToCallSchema, 'body'),
  dialerController.clickToCall
);

router.post(
  '/call',
  checkPermission('dialer', 'create'),
  validate(clickToCallSchema, 'body'),
  dialerController.clickToCall
);

/**
 * @route POST /api/v1/dialer/hangup
 * @route POST /api/v1/dialer/call/:id/hangup
 * @desc Terminate active call session
 */
router.post(
  '/hangup',
  checkPermission('dialer', 'update'),
  validate(hangupCallSchema, 'body'),
  dialerController.hangupCall
);

router.post(
  '/call/:id/hangup',
  checkPermission('dialer', 'update'),
  (req, res, next) => {
    req.body = req.body || {};
    req.body.callId = req.params.id;
    return dialerController.hangupCall(req, res, next);
  }
);

/**
 * @route POST /api/v1/dialer/cdr
 * @desc Ingest completed Call Detail Record (CDR)
 */
router.post(
  '/cdr',
  checkPermission('dialer', 'create'),
  validate(cdrIngestSchema, 'body'),
  dialerController.ingestCdr
);

/**
 * @route GET /api/v1/dialer/cdr
 * @desc List Call Detail Records with filtering and pagination
 */
router.get(
  '/cdr',
  checkPermission('dialer', 'read'),
  validate(listCdrSchema, 'query'),
  dialerController.listCdrs
);

/**
 * @route GET /api/v1/dialer/cdr/:id
 * @desc Get single CDR by primary ID or call ID
 */
router.get(
  '/cdr/:id',
  checkPermission('dialer', 'read'),
  validate(idParamSchema, 'params'),
  dialerController.getCdrById
);

/**
 * @route GET /api/v1/dialer/stats
 * @desc Get dialer call telemetry statistics
 */
router.get(
  '/stats',
  checkPermission('dialer', 'read'),
  validate(statsQuerySchema, 'query'),
  dialerController.getStats
);

/**
 * @route GET /api/v1/dialer/status
 * @desc Get dialer telephony gateway status
 */
router.get(
  '/status',
  checkPermission('dialer', 'read'),
  (req, res) => {
    return res.status(200).json({
      success: true,
      data: {
        status: 'ONLINE',
        provider: process.env.DEFAULT_DIALER_PROVIDER || 'MOCK',
        timestamp: new Date().toISOString(),
      },
      message: 'Dialer service is operational',
    });
  }
);

module.exports = router;
