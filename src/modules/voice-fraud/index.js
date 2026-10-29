/**
 * @file index.js
 * @description Voice Fraud Module export entry point.
 */

const routes = require('./voice-fraud.routes');
const service = require('./voice-fraud.service');
const model = require('./voice-fraud.model');
const controller = require('./voice-fraud.controller');
const biometrics = require('./voiceBiometrics.util');

module.exports = {
  routes,
  service,
  model,
  controller,
  biometrics,
};
