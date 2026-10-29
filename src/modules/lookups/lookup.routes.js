/**
 * @file lookup.routes.js
 * @description Express routes for lookup datasets and parent-filtered options.
 */

const express = require('express');
const lookupController = require('./lookup.controller');

const router = express.Router({ mergeParams: true });

router.get('/:datasetId/options', (req, res, next) => lookupController.getOptions(req, res, next));
router.get('/:datasetId/hierarchy', (req, res, next) => lookupController.getHierarchy(req, res, next));

module.exports = router;
