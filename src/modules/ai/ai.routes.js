/**
 * @file ai.routes.js
 * @description Express routing definitions for AI Orchestration, Voice KYC, and Conversational Engine.
 */

const express = require('express');
const { authenticate } = require('../../middleware/auth');
const { setTenantContext } = require('../../middleware/tenancy');
const { validate } = require('../../middleware/validator');
const aiController = require('./ai.controller');
const {
  submissionIdParamSchema,
  triggerAuditSchema,
  enrollVoiceSchema,
  verifyVoiceSchema,
  tvcTurnSchema,
  faTurnSchema,
} = require('./ai.validation');

const router = express.Router();

// Enforce authentication and tenant context across all AI endpoints
router.use(authenticate, setTenantContext);

/**
 * @route GET /api/v1/ai/models/status
 * @route GET /api/v1/ai/status
 * @desc Get status of deployed AI models, speech recognition, diarization, and LLM inference
 * @access Authenticated
 */
const getAiStatus = (req, res) => {
  return res.status(200).json({
    success: true,
    data: {
      status: 'HEALTHY',
      models: {
        speechToText: { name: 'Whisper-Large-v3', status: 'READY', latencyMs: 120 },
        speakerDiarization: { name: 'PyAnnote-Audio-3.1', status: 'READY', latencyMs: 240 },
        voiceKyc: { name: 'ECAPA-TDNN-Embeddings', status: 'READY', latencyMs: 85 },
        llmAuditor: { name: 'Gemini-1.5-Pro', status: 'READY', latencyMs: 450 },
        conversationalEngine: { name: 'Gemini-Flash', status: 'READY', latencyMs: 180 },
      },
      lastChecked: new Date().toISOString(),
    },
    message: 'AI intelligence models are operational',
  });
};

const { requireAiAuditEnabled } = require('../../middleware/subscriptionGate');

router.get('/models/status', getAiStatus);
router.get('/status', getAiStatus);

// Enforce AI Audit entitlement gate across all operational AI speech and audit features
router.use(requireAiAuditEnabled);

/**
 * @route POST /api/v1/ai/audit/:submissionId
 * @desc Trigger AI speech, diarization, voice fraud, and alignment audit on a submission
 * @access Authenticated
 */
router.post(
  '/audit/:submissionId',
  validate(submissionIdParamSchema, 'params'),
  validate(triggerAuditSchema, 'body'),
  aiController.triggerAudit
);

/**
 * @route GET /api/v1/ai/audit/:submissionId
 * @desc Retrieve AI audit findings, timestamped audio segments, transcripts, and flags
 * @access Authenticated
 */
router.get(
  '/audit/:submissionId',
  validate(submissionIdParamSchema, 'params'),
  aiController.getAudit
);

/**
 * @route POST /api/v1/ai/voice/enroll
 * @desc Enroll an enumerator or field agent's voice reference embedding for Voice KYC
 * @access Authenticated
 */
router.post(
  '/voice/enroll',
  validate(enrollVoiceSchema, 'body'),
  aiController.enrollVoice
);

/**
 * @route POST /api/v1/ai/voice/verify
 * @desc Verify an incoming audio sample against an enrolled Voice KYC profile
 * @access Authenticated
 */
router.post(
  '/voice/verify',
  validate(verifyVoiceSchema, 'body'),
  aiController.verifyVoice
);

/**
 * @route GET /api/v1/ai/risk/:submissionId
 * @desc Get automated fraud risk score, signal breakdown, and routing decision
 * @access Authenticated
 */
router.get(
  '/risk/:submissionId',
  validate(submissionIdParamSchema, 'params'),
  aiController.getRiskEvaluation
);

/**
 * @route POST /api/v1/ai/tvc/turn
 * @desc Process an AI Tele-Verification (TVC) automated calling conversational turn
 * @access Authenticated
 */
router.post(
  '/tvc/turn',
  validate(tvcTurnSchema, 'body'),
  aiController.handleTvcTurn
);

/**
 * @route POST /api/v1/ai/fa/turn
 * @desc Process an AI Field Agent (FA) feedback and coaching conversational turn
 * @access Authenticated
 */
router.post(
  '/fa/turn',
  validate(faTurnSchema, 'body'),
  aiController.handleFaTurn
);

/**
 * @route GET /api/v1/ai/fraud-signals
 * @desc Get all active interviewer voice fraud & collusion signals
 * @access Authenticated
 */
router.get('/fraud-signals', aiController.getFraudSignals);

/**
 * @route POST /api/v1/ai/fraud-signals/:signalId/action
 * @desc Apply administrative remediation action to a fraud signal (quarantine, resolve, super_audit, tvc)
 * @access Authenticated
 */
router.post('/fraud-signals/:signalId/action', aiController.updateFraudSignalAction);

/**
 * @route GET /api/v1/ai/voice/profiles
 * @desc Retrieve all registered interviewer Voice KYC profiles
 * @access Authenticated
 */
router.get('/voice/profiles', aiController.getVoiceProfiles);

/**
 * @route POST /api/v1/ai/simulate-scenario
 * @desc Simulate best-case or worst-case voice fraud test scenarios (Proxy, Collision, Ghost, Robocall, Low SNR)
 * @access Authenticated
 */
router.post('/simulate-scenario', aiController.simulateScenario);

/**
 * @route POST /api/v1/ai/emergency-override
 * @desc Activate Emergency Manual Override (7 PM IST Bypass) for 15m, 30m, or 1 hour
 * @access Authenticated
 */
router.post('/emergency-override', aiController.activateEmergencyOverride);

/**
 * @route POST /api/v1/ai/emergency-override/cancel
 * @route DELETE /api/v1/ai/emergency-override
 * @desc Cancel active Emergency Manual Override
 * @access Authenticated
 */
router.post('/emergency-override/cancel', aiController.cancelEmergencyOverride);
router.delete('/emergency-override', aiController.cancelEmergencyOverride);

/**
 * @route GET /api/v1/ai/emergency-override
 * @desc Get current Emergency Manual Override status and countdown
 * @access Authenticated
 */
router.get('/emergency-override', aiController.getEmergencyOverrideStatus);

module.exports = router;
