/**
 * @file errorHandler.js
 * @description Centralized global error handling middleware for Express.
 */

const { AppError } = require('../utils/errors');
const { error: sendErrorResponse } = require('../utils/response');
const logger = require('../utils/logger');
const config = require('../config');
const errorLogsService = require('../modules/system/errorLogs.service');

/**
 * Global Express error handling middleware.
 *
 * @param {Error} err - Captured error instance
 * @param {import('express').Request} req - Express request
 * @param {import('express').Response} res - Express response
 * @param {import('express').NextFunction} next - Express next function
 */
const errorHandler = (err, req, res, next) => { // eslint-disable-line no-unused-vars
  const correlationId = req.correlationId || null;

  // Defaults
  let statusCode = 500;
  let code = 'INTERNAL_SERVER_ERROR';
  let message = 'An unexpected internal server error occurred';
  let details = null;

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    code = err.code;
    message = err.message;
    details = err.details;
  } else if (err.name === 'ValidationError' && err.isJoi) {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = err.message;
    details = err.details ? err.details.map((d) => d.message) : null;
  } else if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    code = 'INVALID_TOKEN';
    message = 'Authentication token is invalid';
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    code = 'TOKEN_EXPIRED';
    message = 'Authentication token has expired';
  } else if (err.code === '23505') {
    // PostgreSQL Unique Violation
    statusCode = 409;
    code = 'DUPLICATE_ENTRY';
    message = 'A resource with the specified unique values already exists';
    details = err.detail || null;
  } else if (err.code === '23503') {
    // PostgreSQL Foreign Key Violation
    statusCode = 400;
    code = 'FOREIGN_KEY_VIOLATION';
    message = 'Referenced entity does not exist or cannot be deleted';
    details = err.detail || null;
  }

  // Structured logging
  const logData = {
    correlationId,
    code,
    statusCode,
    path: req.originalUrl || req.url,
    method: req.method,
    stack: err.stack,
  };

  if (statusCode >= 500) {
    logger.error(`Server Error: ${err.message}`, logData);
  } else {
    logger.warn(`Client Error: ${err.message}`, logData);
  }

  // Centralized System Error Logging Telemetry (all 4xx and 5xx errors)
  if (statusCode >= 400) {
    try {
      const user = req.user
        ? {
            id: req.user.id || req.user.userId,
            email: req.user.email,
            role: req.user.role || req.user.role_slug || req.user.role_name,
          }
        : null;

      const organization =
        req.tenantContext?.organizationId ||
        req.user?.organization_id ||
        req.headers?.['x-organization-id'] ||
        null;
      const ip = req.ip || req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress;
      const userAgent = req.headers ? req.headers['user-agent'] : null;

      errorLogsService
        .logError({
          path: req.originalUrl || req.url,
          method: req.method,
          status: statusCode,
          statusCode,
          errorCode: code,
          message: err.message || message,
          stack: err.stack,
          user,
          organization,
          ip,
          userAgent,
          details,
          correlationId,
          source: 'BACKEND',
        })
        .catch(() => {});
    } catch (_) {}
  }

  // Never expose raw internal details/stack in production if unhandled
  const safeMessage = (statusCode >= 500 && config.app.env === 'production')
    ? 'An unexpected error occurred. Please contact support.'
    : message;

  return sendErrorResponse(
    res,
    {
      code,
      message: safeMessage,
      details,
      correlationId,
      statusCode,
    },
    statusCode
  );
};

/**
 * 404 Route Not Found middleware.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const notFoundHandler = (req, res) => {
  try {
    errorLogsService
      .logError({
        path: req.originalUrl || req.url,
        method: req.method,
        status: 404,
        statusCode: 404,
        errorCode: 'ROUTE_NOT_FOUND',
        message: `Cannot ${req.method} ${req.originalUrl || req.url}`,
        user: req.user || null,
        organization: req.tenantContext?.organizationId || req.user?.organization_id || null,
        ip: req.ip || req.headers?.['x-forwarded-for'],
        userAgent: req.headers ? req.headers['user-agent'] : null,
        correlationId: req.correlationId,
        source: 'BACKEND',
      })
      .catch(() => {});
  } catch (_) {}

  return sendErrorResponse(
    res,
    {
      code: 'ROUTE_NOT_FOUND',
      message: `Cannot ${req.method} ${req.originalUrl || req.url}`,
      correlationId: req.correlationId,
      statusCode: 404,
    },
    404
  );
};

module.exports = {
  errorHandler,
  notFoundHandler,
};
