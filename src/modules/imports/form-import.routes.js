/**
 * @file form-import.routes.js
 * @description Express routes for workbook upload, staging, issue review, simulation, and publishing.
 */

const express = require('express');
const multer = require('multer');
const formImportController = require('./form-import.controller');

const router = express.Router({ mergeParams: true });

// Configure secure memory storage upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
    files: 1,
  },
  fileFilter: (req, file, cb) => {
    if (
      file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.mimetype === 'application/vnd.ms-excel' ||
      file.originalname.match(/\.(xlsx|xls)$/i)
    ) {
      cb(null, true);
    } else {
      cb(new Error('Only Microsoft Excel (.xlsx, .xls) files are accepted.'));
    }
  },
});

// Multipart workbook upload
router.post('/', upload.single('file'), (req, res, next) => formImportController.uploadWorkbook(req, res, next));
router.post('/upload', upload.single('file'), (req, res, next) => formImportController.uploadWorkbook(req, res, next));

// Staged import status & summary
router.get('/:importId', (req, res, next) => formImportController.getImportDetails(req, res, next));

// Issues review
router.get('/:importId/issues', (req, res, next) => formImportController.getIssues(req, res, next));

// Resolve issue with policy
router.post('/:importId/resolve', (req, res, next) => formImportController.resolveIssue(req, res, next));

// Preview draft canonical schema
router.get('/:importId/preview', (req, res, next) => formImportController.getPreviewSchema(req, res, next));

// Simulate branch logic
router.post('/:importId/simulate', (req, res, next) => formImportController.simulateRules(req, res, next));

// Publish form version
router.post('/:importId/publish', (req, res, next) => formImportController.publish(req, res, next));

module.exports = router;
