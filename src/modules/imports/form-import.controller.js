/**
 * @file form-import.controller.js
 * @description HTTP Controller handling workbook uploads, issues review, resolution, simulation, and publishing.
 */

const { success } = require('../../utils/response');
const { ValidationError } = require('../../utils/errors');
const importerService = require('./importer.service');
const { auditLog } = require('../../services/auditLog');
const { evaluateFormRules } = require('../rules/ruleEngine');
const db = require('../../database/connection');

class FormImportController {
  /**
   * Uploads and stages a multi-sheet workbook (.xlsx)
   * POST /api/projects/:projectId/form-imports
   */
  async uploadWorkbook(req, res, next) {
    try {
      let projectId = req.params.projectId;

      // Fallback: if projectId is 'default' or not provided, get first project
      if (!projectId || projectId === 'default') {
        const p = await db('projects').first();
        if (p) projectId = p.id;
      }

      const file = req.file;
      if (!file) {
        throw new ValidationError('No file provided. Please upload a valid .xlsx spreadsheet.');
      }

      const result = await importerService.createStagedImport(
        projectId,
        file.buffer,
        file.originalname,
        req.user?.id
      );

      await auditLog({
        userId: req.user?.id,
        organizationId: req.user?.organization_id,
        action: 'FORM_IMPORT_UPLOAD',
        resource: 'form_imports',
        resourceId: result.importId,
        details: { filename: file.originalname, profile: result.profile, status: result.status },
        ipAddress: req.ip,
      });

      return success(res, result, 'Workbook imported and staged for review', 201);
    } catch (err) {
      return next(err);
    }
  }

  /**
   * Retrieves import metadata and summary
   * GET /api/projects/:projectId/form-imports/:importId
   */
  async getImportDetails(req, res, next) {
    try {
      const record = await importerService.getImportById(req.params.importId);
      return success(res, record, 'Import details retrieved successfully');
    } catch (err) {
      return next(err);
    }
  }

  /**
   * Retrieves all issues detected in workbook
   * GET /api/projects/:projectId/form-imports/:importId/issues
   */
  async getIssues(req, res, next) {
    try {
      const issues = await importerService.getImportIssues(req.params.importId);
      return success(res, issues, 'Import issues retrieved');
    } catch (err) {
      return next(err);
    }
  }

  /**
   * Resolves a specific import issue with recorded policy
   * POST /api/projects/:projectId/form-imports/:importId/resolve
   */
  async resolveIssue(req, res, next) {
    try {
      const { issueId, resolution } = req.body;
      if (!issueId || !resolution) {
        throw new ValidationError('issueId and resolution are required.');
      }

      const result = await importerService.resolveIssue(
        req.params.importId,
        issueId,
        resolution,
        req.user?.id
      );

      await auditLog({
        userId: req.user?.id,
        organizationId: req.user?.organization_id,
        action: 'FORM_IMPORT_ISSUE_RESOLVED',
        resource: 'form_import_issues',
        resourceId: issueId,
        details: { resolution },
        ipAddress: req.ip,
      });

      return success(res, result, 'Issue resolution recorded');
    } catch (err) {
      return next(err);
    }
  }

  /**
   * Returns read-only canonical schema preview
   * GET /api/projects/:projectId/form-imports/:importId/preview
   */
  async getPreviewSchema(req, res, next) {
    try {
      const record = await importerService.getImportById(req.params.importId);
      const schema = typeof record.staged_schema_jsonb === 'string'
        ? JSON.parse(record.staged_schema_jsonb)
        : record.staged_schema_jsonb;
      return success(res, schema, 'Draft canonical schema preview');
    } catch (err) {
      return next(err);
    }
  }

  /**
   * Simulates branch rules against staged schema with sample answers
   * POST /api/projects/:projectId/form-imports/:importId/simulate
   */
  async simulateRules(req, res, next) {
    try {
      const record = await importerService.getImportById(req.params.importId);
      const schema = typeof record.staged_schema_jsonb === 'string'
        ? JSON.parse(record.staged_schema_jsonb)
        : record.staged_schema_jsonb;

      const { sampleAnswers = {}, inputData = {} } = req.body;
      const questions = schema.questions || [];

      const simulationResult = evaluateFormRules(questions, sampleAnswers, { input: inputData }, { clearOnHide: false });

      return success(res, simulationResult, 'Branch rule simulation completed');
    } catch (err) {
      return next(err);
    }
  }

  /**
   * Publishes staged import to immutable questionnaire_versions and activates it
   * POST /api/projects/:projectId/form-imports/:importId/publish
   */
  async publish(req, res, next) {
    try {
      const publishedVersion = await importerService.publishImport(req.params.importId, req.user?.id);

      await auditLog({
        userId: req.user?.id,
        organizationId: req.user?.organization_id,
        action: 'FORM_VERSION_PUBLISHED',
        resource: 'questionnaire_versions',
        resourceId: publishedVersion.id,
        details: { versionNumber: publishedVersion.version_number, checksum: publishedVersion.checksum },
        ipAddress: req.ip,
      });

      return success(res, publishedVersion, 'Form version published and activated successfully!', 201);
    } catch (err) {
      return next(err);
    }
  }
}

module.exports = new FormImportController();
