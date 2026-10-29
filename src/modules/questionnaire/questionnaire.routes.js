/**
 * @file questionnaire.routes.js
 * @description Express routing definitions for questionnaire engine, sections, questions, options, translations, and Excel operations.
 */

const express = require('express');
const multer = require('multer');
const { authenticate } = require('../../middleware/auth');
const { setTenantContext } = require('../../middleware/tenancy');
const { checkPermission } = require('../../middleware/rbac');
const { validate } = require('../../middleware/validator');
const questionnaireController = require('./questionnaire.controller');
const {
  idParamSchema,
  questionnaireIdParamSchema,
  sectionParamsSchema,
  questionParamsSchema,
  optionParamsSchema,
  translationEntityParamsSchema,
  listVersionsQuerySchema,
  createVersionSchema,
  updateVersionSchema,
  createSectionSchema,
  updateSectionSchema,
  reorderSectionsSchema,
  createQuestionSchema,
  updateQuestionSchema,
  reorderQuestionsSchema,
  createOptionSchema,
  updateOptionSchema,
  reorderOptionsSchema,
  saveTranslationSchema,
} = require('./questionnaire.validation');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Apply auth and tenant scoping to all questionnaire routes
router.use(authenticate, setTenantContext);

// --- TRANSLATIONS (Mounted first to avoid collision with /:id) ---
router.get(
  '/translations/:entityType/:entityId',
  validate(translationEntityParamsSchema, 'params'),
  questionnaireController.getTranslations
);

router.post(
  '/translations',
  checkPermission('questionnaire', 'update'),
  validate(saveTranslationSchema, 'body'),
  questionnaireController.saveTranslation
);

router.delete(
  '/translations/:id',
  checkPermission('questionnaire', 'update'),
  validate(idParamSchema, 'params'),
  questionnaireController.deleteTranslation
);

// --- QUESTIONNAIRE VERSION ROOT ---
router.get(
  '/',
  validate(listVersionsQuerySchema, 'query'),
  questionnaireController.listVersions
);

router.get(
  '/:id',
  validate(idParamSchema, 'params'),
  questionnaireController.getById
);

router.post(
  '/',
  checkPermission('questionnaire', 'create'),
  validate(createVersionSchema, 'body'),
  questionnaireController.createVersion
);

router.put(
  '/:id',
  checkPermission('questionnaire', 'update'),
  validate(idParamSchema, 'params'),
  validate(updateVersionSchema, 'body'),
  questionnaireController.updateVersion
);

router.delete(
  '/:id',
  checkPermission('questionnaire', 'delete'),
  validate(idParamSchema, 'params'),
  questionnaireController.deleteVersion
);

router.post(
  '/:id/publish',
  checkPermission('questionnaire', 'publish'),
  validate(idParamSchema, 'params'),
  questionnaireController.publishVersion
);

router.post(
  '/:id/retire',
  checkPermission('questionnaire', 'publish'),
  validate(idParamSchema, 'params'),
  questionnaireController.retireVersion
);

router.post(
  '/:id/clone',
  checkPermission('questionnaire', 'create'),
  validate(idParamSchema, 'params'),
  questionnaireController.cloneVersion
);

// --- EXCEL IMPORT / EXPORT ---
router.post(
  '/seed-tvc',
  checkPermission('questionnaire', 'create'),
  questionnaireController.seedTvcQuestionnaire
);

router.post(
  '/import',
  checkPermission('questionnaire', 'create'),
  upload.single('file'),
  (req, res, next) => {
    // If questionnaire ID provided in body, use it, or create new questionnaire
    if (req.body?.id || req.body?.questionnaireId) {
      req.params.id = req.body.id || req.body.questionnaireId;
      return questionnaireController.importFromExcel(req, res, next);
    }
    return questionnaireController.importFromExcel(req, res, next);
  }
);

router.get(
  '/:id/export',
  validate(idParamSchema, 'params'),
  questionnaireController.exportToExcel
);

router.post(
  '/:id/import',
  checkPermission('questionnaire', 'update'),
  validate(idParamSchema, 'params'),
  upload.single('file'),
  questionnaireController.importFromExcel
);

// --- SECTIONS ---
router.patch(
  '/:questionnaireId/sections/reorder',
  checkPermission('questionnaire', 'update'),
  validate(questionnaireIdParamSchema, 'params'),
  validate(reorderSectionsSchema, 'body'),
  questionnaireController.reorderSections
);

router.get(
  '/:questionnaireId/sections',
  validate(questionnaireIdParamSchema, 'params'),
  questionnaireController.listSections
);

router.post(
  '/:questionnaireId/sections',
  checkPermission('questionnaire', 'update'),
  validate(questionnaireIdParamSchema, 'params'),
  validate(createSectionSchema, 'body'),
  questionnaireController.createSection
);

router.put(
  '/:questionnaireId/sections/:sectionId',
  checkPermission('questionnaire', 'update'),
  validate(sectionParamsSchema, 'params'),
  validate(updateSectionSchema, 'body'),
  questionnaireController.updateSection
);

router.delete(
  '/:questionnaireId/sections/:sectionId',
  checkPermission('questionnaire', 'update'),
  validate(sectionParamsSchema, 'params'),
  questionnaireController.deleteSection
);

// --- OPTIONS (Nested under questions) ---
router.patch(
  '/:questionnaireId/questions/:questionId/options/reorder',
  checkPermission('questionnaire', 'update'),
  validate(questionParamsSchema, 'params'),
  validate(reorderOptionsSchema, 'body'),
  questionnaireController.reorderOptions
);

router.post(
  '/:questionnaireId/questions/:questionId/options',
  checkPermission('questionnaire', 'update'),
  validate(questionParamsSchema, 'params'),
  validate(createOptionSchema, 'body'),
  questionnaireController.addOption
);

router.put(
  '/:questionnaireId/questions/:questionId/options',
  checkPermission('questionnaire', 'update'),
  validate(questionParamsSchema, 'params'),
  async (req, res, next) => {
    try {
      const { questionnaireId, questionId } = req.params;
      const options = req.body.options || [];
      const updated = await questionnaireService.updateQuestionOptions(questionnaireId, questionId, options);
      return res.status(200).json({
        success: true,
        data: updated,
        message: 'Question options updated successfully',
      });
    } catch (err) {
      return next(err);
    }
  }
);

router.put(
  '/:questionnaireId/questions/:questionId/options/:optionId',
  checkPermission('questionnaire', 'update'),
  validate(optionParamsSchema, 'params'),
  validate(updateOptionSchema, 'body'),
  questionnaireController.updateOption
);

router.delete(
  '/:questionnaireId/questions/:questionId/options/:optionId',
  checkPermission('questionnaire', 'update'),
  validate(optionParamsSchema, 'params'),
  questionnaireController.deleteOption
);

// --- QUESTIONS ---
router.patch(
  '/:questionnaireId/questions/reorder',
  checkPermission('questionnaire', 'update'),
  validate(questionnaireIdParamSchema, 'params'),
  validate(reorderQuestionsSchema, 'body'),
  questionnaireController.reorderQuestions
);

router.get(
  '/:questionnaireId/questions',
  validate(questionnaireIdParamSchema, 'params'),
  questionnaireController.listQuestions
);

router.get(
  '/:questionnaireId/questions/:questionId',
  validate(questionParamsSchema, 'params'),
  questionnaireController.getQuestion
);

router.post(
  '/:questionnaireId/questions',
  checkPermission('questionnaire', 'update'),
  validate(questionnaireIdParamSchema, 'params'),
  validate(createQuestionSchema, 'body'),
  questionnaireController.createQuestion
);

router.put(
  '/:questionnaireId/questions/:questionId',
  checkPermission('questionnaire', 'update'),
  validate(questionParamsSchema, 'params'),
  validate(updateQuestionSchema, 'body'),
  questionnaireController.updateQuestion
);

router.delete(
  '/:questionnaireId/questions/:questionId',
  checkPermission('questionnaire', 'update'),
  validate(questionParamsSchema, 'params'),
  questionnaireController.deleteQuestion
);

module.exports = router;
