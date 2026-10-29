/**
 * @file logger.js
 * @description Winston logger configuration with structured logging, console and file transports.
 */

const fs = require('fs');
const path = require('path');
const winston = require('winston');
const config = require('../config');

// Ensure log directory exists if file logging is enabled
const logDir = path.resolve(config.logger.dir);
if (config.logger.fileEnabled && !fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const { combine, timestamp, printf, colorize, json, errors } = winston.format;

// Custom console format
const consoleFormat = printf(({ level, message, timestamp: time, correlationId, ...meta }) => {
  const reqId = correlationId ? ` [${correlationId}]` : '';
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `[${time}]${reqId} ${level}: ${message}${metaStr}`;
});

const transports = [
  new winston.transports.Console({
    format: combine(
      colorize({ all: true }),
      timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      errors({ stack: true }),
      consoleFormat
    ),
  }),
];

if (config.logger.fileEnabled) {
  transports.push(
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      format: combine(timestamp(), errors({ stack: true }), json()),
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      format: combine(timestamp(), errors({ stack: true }), json()),
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
    })
  );
}

/**
 * Master Winston Logger instance
 */
const logger = winston.createLogger({
  level: config.logger.level,
  defaultMeta: { service: 'master-crm-api' },
  transports,
  exitOnError: false,
});

module.exports = logger;
