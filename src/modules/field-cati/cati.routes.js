/**
 * @file cati.routes.js
 * @description Express router for CATI - Field Survey (FIELD_CATI) endpoints:
 * - GET /api/v1/cati/assignments
 * - POST /api/v1/cati/submissions/:id
 * - POST /api/v1/cati/submissions/:id/audio
 * - POST /api/v1/cati/sync
 */

const express = require('express');
const multer = require('multer');
const { authenticate } = require('../../middleware/auth');
const { setTenantContext } = require('../../middleware/tenancy');
const catiController = require('./cati.controller');

const router = express.Router();

// Multer memory storage for direct audio uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB audio limit
  },
});

// All routes require authenticated user and tenant context
router.use(authenticate, setTenantContext);

/**
 * @route GET /api/v1/cati/assignments
 * @desc Get assigned ACs, active project, and dynamic questionnaire manifest
 */
router.get('/assignments', catiController.getAssignments);

/**
 * @route POST /api/v1/cati/submissions/:id
 * @desc Save survey submission with question tags, answers, GPS, and timestamps
 */
router.post('/submissions/:id', catiController.saveSubmission);

/**
 * @route POST /api/v1/cati/submissions/:id/audio
 * @desc Upload survey audio recording, attach to submission and CAPI audit
 */
router.post('/submissions/:id/audio', upload.single('audio'), catiController.uploadAudio);

/**
 * @route POST /api/v1/cati/sync
 * @desc Batch sync offline survey submissions and GPS events
 */
router.post('/sync', catiController.syncOffline);

module.exports = router;
