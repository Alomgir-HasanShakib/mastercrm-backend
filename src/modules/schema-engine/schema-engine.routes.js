/**
 * Schema Engine Routes
 */

const express = require('express');
const router = express.Router();
const schemaEngineController = require('./schema-engine.controller');
const { authenticate } = require('../../middleware/auth');
const { setTenantContext } = require('../../middleware/tenancy');

router.use(authenticate, setTenantContext);

// List templates
router.get('/', schemaEngineController.listTemplates);
router.get('/templates', schemaEngineController.listTemplates);

// Save template
router.post('/templates', schemaEngineController.saveTemplate);

// Parse SQL DDL
router.post('/parse-sql', schemaEngineController.parseSql);

// Introspect table from client DB
router.post('/introspect-client', schemaEngineController.introspectClientTable);

// Dynamically create/ensure tables in PostgreSQL
router.post('/create-tables', schemaEngineController.createTables);

module.exports = router;
