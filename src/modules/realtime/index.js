/**
 * @file index.js
 * @description Realtime Presence, Activity & WebSocket module entry point.
 * Exports routes, controller, service, model, validation, and initSocketServer.
 */

const realtimeRoutes = require('./realtime.routes');
const realtimeController = require('./realtime.controller');
const realtimeService = require('./realtime.service');
const realtimeModel = require('./realtime.model');
const realtimeValidation = require('./realtime.validation');
const { initSocketServer, getIo, closeSocketServer } = require('./realtime.socket');

module.exports = {
  routes: realtimeRoutes,
  router: realtimeRoutes,
  controller: realtimeController,
  service: realtimeService,
  model: realtimeModel,
  validation: realtimeValidation,
  initSocketServer,
  getIo,
  closeSocketServer,
};
