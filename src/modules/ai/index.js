/**
 * @file index.js
 * @description AI Orchestration module entry point exporting router, controller, service, model, and validation.
 */

const aiRoutes = require('./ai.routes');
const aiController = require('./ai.controller');
const aiService = require('./ai.service');
const aiAuditService = require('./aiAudit.service');
const aiReviewQueueService = require('./aiReviewQueue.service');
const aiModel = require('./ai.model');
const aiValidation = require('./ai.validation');

module.exports = {
  routes: aiRoutes,
  router: aiRoutes,
  controller: aiController,
  service: aiService,
  aiAuditService,
  aiReviewQueueService,
  model: aiModel,
  validation: aiValidation,
};
