/**
 * Schema Engine Controller
 */

const schemaEngineService = require('./schema-engine.service');
const { success, error } = require('../../utils/response');

class SchemaEngineController {
  async listTemplates(req, res, next) {
    try {
      const organizationId = req.user?.organizationId || req.tenant?.organizationId;
      const templates = await schemaEngineService.listTemplates(organizationId);
      return success(res, templates, 'Schema templates retrieved successfully');
    } catch (err) {
      return next(err);
    }
  }

  async saveTemplate(req, res, next) {
    try {
      const organizationId = req.user?.organizationId || req.tenant?.organizationId;
      const result = await schemaEngineService.saveTemplate(req.body, organizationId);
      return success(res, result, 'Schema template saved successfully', 201);
    } catch (err) {
      return next(err);
    }
  }

  async parseSql(req, res, next) {
    try {
      const { sql } = req.body;
      if (!sql) {
        return error(res, 'SQL statement is required in request body', 400);
      }
      const parsed = schemaEngineService.parseSql(sql);
      return success(res, parsed, 'SQL parsed successfully');
    } catch (err) {
      return error(res, `Failed to parse SQL: ${err.message}`, 400);
    }
  }

  async introspectClientTable(req, res, next) {
    try {
      const { tableName } = req.body;
      if (!tableName) {
        return error(res, 'Table name is required for introspection', 400);
      }
      const schema = await schemaEngineService.introspectClientTable(tableName);
      return success(res, schema, `Introspected table ${tableName} successfully`);
    } catch (err) {
      return error(res, err.message, 400);
    }
  }

  async createTables(req, res, next) {
    try {
      const result = await schemaEngineService.createTablesFromSchema(req.body);
      return success(res, result, result.message);
    } catch (err) {
      return next(err);
    }
  }
}

module.exports = new SchemaEngineController();
