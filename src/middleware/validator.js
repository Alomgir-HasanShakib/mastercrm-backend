/**
 * @file validator.js
 * @description Centralized request validation middleware using Joi schemas.
 */

const { ValidationError } = require('../utils/errors');

/**
 * Express middleware to validate request payload against a Joi schema.
 *
 * @param {import('joi').ObjectSchema} schema - Joi validation schema
 * @param {'body'|'query'|'params'} [source='body'] - Request property to validate
 * @returns {import('express').RequestHandler}
 */
const validate = (schema, source = 'body') => {
  return (req, res, next) => {
    if (!schema) {
      return next();
    }

    const { error, value } = schema.validate(req[source], {
      abortEarly: false,
      stripUnknown: true,
      allowUnknown: false,
    });

    if (error) {
      const details = error.details.map((detail) => ({
        field: detail.path.join('.'),
        message: detail.message.replace(/['"]/g, ''),
      }));

      return next(new ValidationError('Validation failed for ' + source, details));
    }

    // Assign sanitized and validated values back to request
    req[source] = value;
    return next();
  };
};

module.exports = {
  validate,
};
