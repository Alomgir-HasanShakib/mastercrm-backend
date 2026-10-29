/**
 * @file voice-fraud.routes.js
 * @description Routing definitions for AI Voice Fraud Detection & Biometric Speaker Verification.
 */

const express = require('express');
const multer = require('multer');
const voiceFraudController = require('./voice-fraud.controller');
const { authenticate } = require('../../middleware/auth');
const { setTenantContext } = require('../../middleware/tenancy');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

const router = express.Router();

// Enforce authentication & tenant context
router.use(authenticate, setTenantContext);

// Baseline Voice Enrollment
router.post('/enroll', upload.single('audio'), voiceFraudController.enroll);
router.get('/profiles', voiceFraudController.getProfiles);
router.get('/profiles/:agentId', voiceFraudController.getProfile);
router.delete('/profiles/:agentId', voiceFraudController.deleteProfile);

// Automated / On-demand Lead Verification
router.post('/verify', upload.single('audio'), voiceFraudController.verifyLeadVoice);

// Voice Fraud Incidents Records & Radar
router.get('/records', voiceFraudController.getRecords);
router.get('/records/:id', voiceFraudController.getRecordById);
router.patch('/records/:id/status', voiceFraudController.updateRecordStatus);
router.get('/stats', voiceFraudController.getStats);

module.exports = router;
