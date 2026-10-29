/**
 * @file requestLogger.js
 * @description HTTP request/response logging middleware with correlation ID tracing.
 */

const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

/**
 * Express middleware to generate or propagate correlation ID and log request/response lifecycle.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const requestLogger = (req, res, next) => {
  // Extract or generate Correlation ID
  const correlationId = req.headers['x-correlation-id'] || req.headers['x-request-id'] || uuidv4();
  req.correlationId = correlationId;
  res.setHeader('x-correlation-id', correlationId);

  const startTime = Date.now();

  // Log incoming request
  logger.http(`--> ${req.method} ${req.originalUrl || req.url}`, {
    correlationId,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get('user-agent'),
  });

  // Intercept response finish
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const statusCode = res.statusCode;
    const logLevel = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';

    logger.log(logLevel, `<-- ${req.method} ${req.originalUrl || req.url} ${statusCode} - ${duration}ms`, {
      correlationId,
      statusCode,
      durationMs: duration,
    });
  });

  next();
};

module.exports = requestLogger;
