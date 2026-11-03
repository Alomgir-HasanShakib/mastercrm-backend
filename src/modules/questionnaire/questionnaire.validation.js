/**
 * @file questionnaire.validation.js
 * @description Joi validation schemas for questionnaire versions, sections, questions, options, translations, and reordering.
 */

const Joi = require('joi');

const idParamSchema = Joi.object({
  id: Joi.string().uuid().required(),
});

const questionnaireIdParamSchema = Joi.object({
  questionnaireId: Joi.string().uuid().required(),
});

const sectionParamsSchema = Joi.object({
  questionnaireId: Joi.string().uuid().required(),
  sectionId: Joi.string().uuid().required(),
});

const questionParamsSchema = Joi.object({
  questionnaireId: Joi.string().uuid().required(),
  questionId: Joi.string().uuid().required(),
});

const optionParamsSchema = Joi.object({
  questionnaireId: Joi.string().uuid().required(),
  questionId: Joi.string().uuid().required(),
  optionId: Joi.string().uuid().required(),
});

const translationEntityParamsSchema = Joi.object({
  entityType: Joi.string().valid('QUESTION', 'SECTION', 'OPTION').required(),
  entityId: Joi.string().uuid().required(),
});

const listVersionsQuerySchema = Joi.object({
  projectId: Joi.string().uuid().allow('', null).optional(),
  module: Joi.string().valid('CAPI', 'CATI', 'SUPER_AUDIT', 'AI_AUDIT', 'TVC', 'FA', 'AUDIT', 'CAPI_CATI').optional(),
  status: Joi.string().valid('DRAFT', 'PUBLISHED', 'RETIRED').optional(),
}).unknown(true);

const createVersionSchema = Joi.object({
  projectId: Joi.string().max(100).allow('', null).optional(),
  project_id: Joi.string().max(100).allow('', null).optional(),
  campaign_id: Joi.string().max(100).allow('', null).optional(),
  module: Joi.string().trim().uppercase().valid('CAPI', 'CATI', 'SUPER_AUDIT', 'AI_AUDIT', 'TVC', 'FA', 'AUDIT', 'CAPI_CATI').required(),
  name: Joi.string().max(255).allow('', null).optional().default('Untitled Questionnaire'),
  title: Joi.string().max(255).allow('', null).optional(),
  questions: Joi.array().optional(),
  sections: Joi.array().optional(),
  openingScript: Joi.string().allow('', null).optional(),
  closingScript: Joi.string().allow('', null).optional(),
  closureScript: Joi.string().allow('', null).optional(),
  checkpoints: Joi.array().optional(),
  status: Joi.string().valid('DRAFT', 'PUBLISHED', 'RETIRED').optional(),
  updatedAt: Joi.any().optional(),
}).unknown(true);

const updateVersionSchema = Joi.object({
  name: Joi.string().max(255).allow('', null).optional(),
  title: Joi.string().max(255).allow('', null).optional(),
  module: Joi.string().trim().uppercase().valid('CAPI', 'CATI', 'SUPER_AUDIT', 'AI_AUDIT', 'TVC', 'FA', 'AUDIT', 'CAPI_CATI').optional(),
  projectId: Joi.string().max(100).allow('', null).optional(),
  project_id: Joi.string().max(100).allow('', null).optional(),
  sections: Joi.array().optional(),
  questions: Joi.array().optional(),
  openingScript: Joi.string().allow('', null).optional(),
  closingScript: Joi.string().allow('', null).optional(),
  closureScript: Joi.string().allow('', null).optional(),
  checkpoints: Joi.array().optional(),
  status: Joi.string().valid('DRAFT', 'PUBLISHED', 'RETIRED').optional(),
  updatedAt: Joi.any().optional(),
}).unknown(true);

const createSectionSchema = Joi.object({
  code: Joi.string().max(50).required(),
  title: Joi.string().max(255).required(),
  displayOrder: Joi.number().integer().min(0).default(0),
  visibilityRuleId: Joi.string().uuid().allow(null).optional(),
});

const updateSectionSchema = Joi.object({
  code: Joi.string().max(50).optional(),
  title: Joi.string().max(255).optional(),
  displayOrder: Joi.number().integer().min(0).optional(),
  visibilityRuleId: Joi.string().uuid().allow(null).optional(),
}).min(1);

const reorderSectionsSchema = Joi.object({
  items: Joi.array().items(
    Joi.object({
      id: Joi.string().uuid().required(),
      displayOrder: Joi.number().integer().min(0).required(),
    })
  ).min(1).required(),
});

const createQuestionSchema = Joi.object({
  sectionId: Joi.string().uuid().allow(null).optional(),
  questionNo: Joi.string().max(100).allow('', null).optional(),
  questionTag: Joi.string().max(100).allow('', null).optional(),
  questionCode: Joi.string().max(100).allow('', null).optional(),
  questionType: Joi.string().valid(
    'SINGLE_SELECT',
    'MULTI_SELECT',
    'TEXT',
    'TEXTAREA',
    'NUMBER',
    'DATE',
    'DROPDOWN',
    'SEARCHABLE_SELECT',
    'RATING',
    'CONSENT',
    'INFO_BLOCK',
    'HIDDEN'
  ).optional().default('SINGLE_SELECT'),
  questionText: Joi.string().allow('', null).optional(),
  helpText: Joi.string().allow('', null).optional(),
  isRequired: Joi.boolean().default(false),
  displayOrder: Joi.number().integer().min(0).default(0),
  inputTag: Joi.string().max(100).allow('', null).optional(),
  outputTag: Joi.string().max(100).allow('', null).optional(),
  validationTag: Joi.string().max(100).allow('', null).optional(),
  actualTag: Joi.string().max(100).allow('', null).optional(),
  optionSource: Joi.string().valid('STATIC', 'LOOKUP', 'DB', 'API', 'GEOGRAPHY').default('STATIC'),
  evidencePolicy: Joi.string().max(100).allow('', null).optional(),
  validationRules: Joi.object().default({}),
  metadata: Joi.object().default({}),
  isEnabled: Joi.boolean().default(true),
  options: Joi.array().items(
    Joi.object({
      optionCode: Joi.string().max(100).required(),
      label: Joi.string().max(255).required(),
      value: Joi.string().max(255).required(),
      displayOrder: Joi.number().integer().min(0).default(0),
      metadata: Joi.object().default({}),
    })
  ).optional(),
}).unknown(true);

const updateQuestionSchema = Joi.object({
  sectionId: Joi.string().uuid().allow(null).optional(),
  questionNo: Joi.string().max(100).allow('', null).optional(),
  questionTag: Joi.string().max(100).allow('', null).optional(),
  questionCode: Joi.string().max(100).allow('', null).optional(),
  questionType: Joi.string().valid(
    'SINGLE_SELECT',
    'MULTI_SELECT',
    'TEXT',
    'TEXTAREA',
    'NUMBER',
    'DATE',
    'DROPDOWN',
    'SEARCHABLE_SELECT',
    'RATING',
    'CONSENT',
    'INFO_BLOCK',
    'HIDDEN'
  ).optional(),
  questionText: Joi.string().allow('', null).optional(),
  helpText: Joi.string().allow('', null).optional(),
  isRequired: Joi.boolean().optional(),
  displayOrder: Joi.number().integer().min(0).optional(),
  inputTag: Joi.string().max(100).allow('', null).optional(),
  outputTag: Joi.string().max(100).allow('', null).optional(),
  validationTag: Joi.string().max(100).allow('', null).optional(),
  actualTag: Joi.string().max(100).allow('', null).optional(),
  optionSource: Joi.string().valid('STATIC', 'LOOKUP', 'DB', 'API', 'GEOGRAPHY').optional(),
  evidencePolicy: Joi.string().max(100).allow('', null).optional(),
  validationRules: Joi.object().optional(),
  metadata: Joi.object().optional(),
  isEnabled: Joi.boolean().optional(),
}).unknown(true);

const reorderQuestionsSchema = Joi.object({
  items: Joi.array().items(
    Joi.object({
      id: Joi.string().uuid().required(),
      displayOrder: Joi.number().integer().min(0).required(),
      sectionId: Joi.string().uuid().optional(),
    })
  ).min(1).required(),
});

const createOptionSchema = Joi.object({
  optionCode: Joi.string().max(100).required(),
  label: Joi.string().max(255).required(),
  value: Joi.string().max(255).required(),
  displayOrder: Joi.number().integer().min(0).default(0),
  metadata: Joi.object().default({}),
  isActive: Joi.boolean().default(true),
});

const updateOptionSchema = Joi.object({
  optionCode: Joi.string().max(100).optional(),
  label: Joi.string().max(255).optional(),
  value: Joi.string().max(255).optional(),
  displayOrder: Joi.number().integer().min(0).optional(),
  metadata: Joi.object().optional(),
  isActive: Joi.boolean().optional(),
}).min(1);

const reorderOptionsSchema = Joi.object({
  items: Joi.array().items(
    Joi.object({
      id: Joi.string().uuid().required(),
      displayOrder: Joi.number().integer().min(0).required(),
    })
  ).min(1).required(),
});

const saveTranslationSchema = Joi.object({
  entityType: Joi.string().valid('QUESTION', 'SECTION', 'OPTION').required(),
  entityId: Joi.string().uuid().required(),
  languageCode: Joi.string().max(20).required(),
  fieldName: Joi.string().max(100).required(),
  localizedText: Joi.string().required(),
});

module.exports = {
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
};
