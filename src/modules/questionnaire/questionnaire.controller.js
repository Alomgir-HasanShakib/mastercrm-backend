/**
 * @file questionnaire.controller.js
 * @description Controller handling HTTP requests for questionnaire versions, sections, questions, options, translations, and Excel integration.
 */

const { success } = require('../../utils/response');
const { ValidationError } = require('../../utils/errors');
const questionnaireService = require('./questionnaire.service');
const { auditLog } = require('../../services/auditLog');

const questionnaireController = {
  // --- VERSION CONTROLLERS ---

  async listVersions(req, res, next) {
    try {
      const filters = {
        projectId: req.query.projectId,
        module: req.query.module,
        status: req.query.status,
      };

      const versions = await questionnaireService.listVersions(filters);
      return success(res, versions, 'Questionnaire versions retrieved successfully');
    } catch (err) {
      return next(err);
    }
  },

  async getById(req, res, next) {
    try {
      const questionnaire = await questionnaireService.getFullQuestionnaire(req.params.id);
      return success(res, questionnaire, 'Questionnaire retrieved successfully');
    } catch (err) {
      return next(err);
    }
  },

  async createVersion(req, res, next) {
    try {
      const version = await questionnaireService.createVersion(req.body, req.user?.id);

      await auditLog({
        userId: req.user?.id,
        organizationId: req.user?.organization_id,
        action: 'QUESTIONNAIRE_CREATE_VERSION',
        resource: 'questionnaire_versions',
        resourceId: version.id,
        details: { projectId: req.body.projectId, module: req.body.module, versionNumber: version.version_number },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return success(res, version, 'Questionnaire draft created successfully', 201);
    } catch (err) {
      return next(err);
    }
  },

  async updateVersion(req, res, next) {
    try {
      const updated = await questionnaireService.updateVersion(req.params.id, req.body);

      await auditLog({
        userId: req.user?.id,
        organizationId: req.user?.organization_id,
        action: 'QUESTIONNAIRE_UPDATE_VERSION',
        resource: 'questionnaire_versions',
        resourceId: req.params.id,
        details: { changes: req.body },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return success(res, updated, 'Questionnaire updated successfully');
    } catch (err) {
      return next(err);
    }
  },

  async deleteVersion(req, res, next) {
    try {
      await questionnaireService.deleteVersion(req.params.id);

      await auditLog({
        userId: req.user?.id,
        organizationId: req.user?.organization_id,
        action: 'QUESTIONNAIRE_DELETE_VERSION',
        resource: 'questionnaire_versions',
        resourceId: req.params.id,
        details: {},
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return success(res, null, 'Questionnaire draft deleted successfully');
    } catch (err) {
      return next(err);
    }
  },

  async publishVersion(req, res, next) {
    try {
      const published = await questionnaireService.publishVersion(req.params.id, req.user?.id);

      await auditLog({
        userId: req.user?.id,
        organizationId: req.user?.organization_id,
        action: 'QUESTIONNAIRE_PUBLISH_VERSION',
        resource: 'questionnaire_versions',
        resourceId: req.params.id,
        details: { checksum: published.checksum, versionNumber: published.version_number },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return success(res, published, 'Questionnaire version published successfully');
    } catch (err) {
      return next(err);
    }
  },

  async retireVersion(req, res, next) {
    try {
      const retired = await questionnaireService.retireVersion(req.params.id);

      await auditLog({
        userId: req.user?.id,
        organizationId: req.user?.organization_id,
        action: 'QUESTIONNAIRE_RETIRE_VERSION',
        resource: 'questionnaire_versions',
        resourceId: req.params.id,
        details: { status: 'RETIRED' },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return success(res, retired, 'Questionnaire version retired successfully');
    } catch (err) {
      return next(err);
    }
  },

  async cloneVersion(req, res, next) {
    try {
      const cloned = await questionnaireService.cloneVersion(req.params.id, req.user?.id);

      await auditLog({
        userId: req.user?.id,
        organizationId: req.user?.organization_id,
        action: 'QUESTIONNAIRE_CLONE_VERSION',
        resource: 'questionnaire_versions',
        resourceId: cloned.id,
        details: { sourceVersionId: req.params.id, newVersionNumber: cloned.version_number },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return success(res, cloned, 'Questionnaire cloned to new draft successfully', 201);
    } catch (err) {
      return next(err);
    }
  },

  // --- SECTIONS ---

  async listSections(req, res, next) {
    try {
      const sections = await questionnaireService.listSections(req.params.questionnaireId);
      return success(res, sections, 'Sections retrieved successfully');
    } catch (err) {
      return next(err);
    }
  },

  async createSection(req, res, next) {
    try {
      const section = await questionnaireService.createSection(req.params.questionnaireId, req.body);
      return success(res, section, 'Section created successfully', 201);
    } catch (err) {
      return next(err);
    }
  },

  async updateSection(req, res, next) {
    try {
      const section = await questionnaireService.updateSection(
        req.params.questionnaireId,
        req.params.sectionId,
        req.body
      );
      return success(res, section, 'Section updated successfully');
    } catch (err) {
      return next(err);
    }
  },

  async deleteSection(req, res, next) {
    try {
      await questionnaireService.deleteSection(
        req.params.questionnaireId,
        req.params.sectionId
      );
      return success(res, null, 'Section deleted successfully');
    } catch (err) {
      return next(err);
    }
  },

  async reorderSections(req, res, next) {
    try {
      await questionnaireService.reorderSections(req.params.questionnaireId, req.body.items);
      return success(res, null, 'Sections reordered successfully');
    } catch (err) {
      return next(err);
    }
  },

  // --- QUESTIONS ---

  async listQuestions(req, res, next) {
    try {
      const questions = await questionnaireService.listQuestions(
        req.params.questionnaireId,
        req.query.sectionId
      );
      return success(res, questions, 'Questions retrieved successfully');
    } catch (err) {
      return next(err);
    }
  },

  async getQuestion(req, res, next) {
    try {
      const question = await questionnaireService.getQuestion(
        req.params.questionnaireId,
        req.params.questionId
      );
      return success(res, question, 'Question retrieved successfully');
    } catch (err) {
      return next(err);
    }
  },

  async createQuestion(req, res, next) {
    try {
      const question = await questionnaireService.createQuestion(
        req.params.questionnaireId,
        req.body
      );
      return success(res, question, 'Question created successfully', 201);
    } catch (err) {
      return next(err);
    }
  },

  async updateQuestion(req, res, next) {
    try {
      const question = await questionnaireService.updateQuestion(
        req.params.questionnaireId,
        req.params.questionId,
        req.body
      );
      return success(res, question, 'Question updated successfully');
    } catch (err) {
      return next(err);
    }
  },

  async deleteQuestion(req, res, next) {
    try {
      await questionnaireService.deleteQuestion(
        req.params.questionnaireId,
        req.params.questionId
      );
      return success(res, null, 'Question deleted successfully');
    } catch (err) {
      return next(err);
    }
  },

  async reorderQuestions(req, res, next) {
    try {
      await questionnaireService.reorderQuestions(
        req.params.questionnaireId,
        req.body.items
      );
      return success(res, null, 'Questions reordered successfully');
    } catch (err) {
      return next(err);
    }
  },

  // --- OPTIONS ---

  async addOption(req, res, next) {
    try {
      const option = await questionnaireService.addOption(
        req.params.questionnaireId,
        req.params.questionId,
        req.body
      );
      return success(res, option, 'Option added successfully', 201);
    } catch (err) {
      return next(err);
    }
  },

  async updateOption(req, res, next) {
    try {
      const option = await questionnaireService.updateOption(
        req.params.questionnaireId,
        req.params.questionId,
        req.params.optionId,
        req.body
      );
      return success(res, option, 'Option updated successfully');
    } catch (err) {
      return next(err);
    }
  },

  async deleteOption(req, res, next) {
    try {
      await questionnaireService.deleteOption(
        req.params.questionnaireId,
        req.params.questionId,
        req.params.optionId
      );
      return success(res, null, 'Option deleted successfully');
    } catch (err) {
      return next(err);
    }
  },

  async reorderOptions(req, res, next) {
    try {
      await questionnaireService.reorderOptions(
        req.params.questionnaireId,
        req.params.questionId,
        req.body.items
      );
      return success(res, null, 'Options reordered successfully');
    } catch (err) {
      return next(err);
    }
  },

  // --- TRANSLATIONS ---

  async getTranslations(req, res, next) {
    try {
      const translations = await questionnaireService.getTranslations(
        req.params.entityType,
        req.params.entityId
      );
      return success(res, translations, 'Translations retrieved successfully');
    } catch (err) {
      return next(err);
    }
  },

  async saveTranslation(req, res, next) {
    try {
      const translation = await questionnaireService.saveTranslation(req.body);
      return success(res, translation, 'Translation saved successfully');
    } catch (err) {
      return next(err);
    }
  },

  async deleteTranslation(req, res, next) {
    try {
      await questionnaireService.deleteTranslation(req.params.id);
      return success(res, null, 'Translation deleted successfully');
    } catch (err) {
      return next(err);
    }
  },

  // --- EXCEL IMPORT / EXPORT ---

  async exportToExcel(req, res, next) {
    try {
      const { buffer, filename } = await questionnaireService.exportToExcel(req.params.id);

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.status(200).send(buffer);
    } catch (err) {
      return next(err);
    }
  },

  async importFromExcel(req, res, next) {
    try {
      if (!req.file || !req.file.buffer) {
        throw new ValidationError('File (.pdf, .csv, .xlsx, or text) is required for questionnaire import.');
      }

      const qId = req.params.id || req.body.questionnaireId || req.body.id || null;
      const extraMeta = {
        name: req.body.name || (req.file.originalname ? req.file.originalname.replace(/\.[^/.]+$/, '') : 'Imported Election Questionnaire'),
        filename: req.file.originalname || '',
        projectId: req.body.projectId,
        module: req.body.module || 'CATI',
        userId: req.user?.id,
      };

      const result = await questionnaireService.importFromExcel(qId, req.file.buffer, extraMeta);

      await auditLog({
        userId: req.user?.id,
        organizationId: req.user?.organization_id,
        action: 'QUESTIONNAIRE_FILE_IMPORT',
        resource: 'questionnaire_versions',
        resourceId: result.questionnaireId,
        details: result,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return success(res, result, 'Questionnaire imported successfully from file', 201);
    } catch (err) {
      return next(err);
    }
  },

  async seedTvcQuestionnaire(req, res, next) {
    try {
      const extraMeta = {
        name: req.body.name || 'Tele-verification Questionnaire (Official TVC)',
        projectId: req.body.projectId,
        module: 'TVC',
        userId: req.user?.id,
      };

      // Create synthetic TVC buffer
      const dummyBuffer = Buffer.from('Tele-verification Questionnaire Poll Track family_member vidhan_sabha', 'utf-8');
      const result = await questionnaireService.importFromExcel(null, dummyBuffer, extraMeta);

      await auditLog({
        userId: req.user?.id,
        organizationId: req.user?.organization_id,
        action: 'QUESTIONNAIRE_SEED_TVC',
        resource: 'questionnaire_versions',
        resourceId: result.questionnaireId,
        details: result,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return success(res, result, 'Official TVC Questionnaire seeded successfully to database', 201);
    } catch (err) {
      return next(err);
    }
  },
};

module.exports = questionnaireController;
