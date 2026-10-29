/**
 * @file geography.routes.js
 * @description Express routing definitions for Geography Hierarchy Trees, AC/PC/SEP Lookups, and Excel Version Ingestion.
 */

const express = require('express');
const multer = require('multer');
const { authenticate } = require('../../middleware/auth');
const { setTenantContext } = require('../../middleware/tenancy');
const { validate } = require('../../middleware/validator');
const geographyController = require('./geography.controller');
const {
  hierarchyTreeQuerySchema,
  dependentAcsQuerySchema,
  pcsQuerySchema,
  sepsQuerySchema,
  importMetadataSchema,
} = require('./geography.validation');

const router = express.Router();

// Configure multer for Excel/CSV file upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024, // 25 MB max Excel file
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
      'application/octet-stream',
    ];
    if (
      allowedMimes.includes(file.mimetype) ||
      file.originalname.match(/\.(xlsx|xls|csv)$/i)
    ) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file format. Only .xlsx, .xls, and .csv files are supported.'));
    }
  },
});

router.use(authenticate, setTenantContext);

/**
 * @route GET /api/v1/geography/tree
 * @desc Get complete State -> PC -> AC -> Booth nested hierarchy
 * @access Authenticated CRM users
 */
router.get(
  '/tree',
  validate(hierarchyTreeQuerySchema, 'query'),
  geographyController.getHierarchyTree
);

/**
 * @route GET /api/v1/geography/acs
 * @desc Get AC list dependent on PC or State
 * @access Authenticated CRM users
 */
router.get(
  '/acs',
  validate(dependentAcsQuerySchema, 'query'),
  geographyController.getDependentAcs
);

/**
 * @route GET /api/v1/geography/states
 * @desc Get list of States
 * @access Authenticated CRM users
 */
router.get('/states', geographyController.getStates);

/**
 * @route GET /api/v1/geography/pcs
 * @desc Get list of PCs for a specific State
 * @access Authenticated CRM users
 */
router.get(
  '/pcs',
  validate(pcsQuerySchema, 'query'),
  geographyController.getPcs
);

/**
 * @route GET /api/v1/geography/seps
 * @desc Get list of SEPs / Booths for a specific AC
 * @access Authenticated CRM users
 */
router.get(
  '/seps',
  validate(sepsQuerySchema, 'query'),
  geographyController.getSeps
);

/**
 * @route GET /api/v1/geography/versions
 * @desc List uploaded geography mapping versions
 * @access Authenticated CRM users
 */
router.get('/versions', geographyController.listVersions);

/**
 * @route POST /api/v1/geography/import
 * @desc Import Excel spreadsheet with constituency mappings into a new version
 * @access Authenticated CRM users / Admin
 */
router.post(
  '/import',
  upload.single('file'),
  validate(importMetadataSchema, 'body'),
  geographyController.importExcel
);

module.exports = router;
