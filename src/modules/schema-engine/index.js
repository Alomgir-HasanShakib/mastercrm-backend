const routes = require('./schema-engine.routes');
const service = require('./schema-engine.service');
const controller = require('./schema-engine.controller');
const { PREDEFINED_TEMPLATES } = require('./schemaTemplates');

module.exports = {
  routes,
  service,
  controller,
  PREDEFINED_TEMPLATES,
};
