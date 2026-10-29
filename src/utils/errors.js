/**
 * @file errors.js
 * @description Centralized custom error classes hierarchy for Master CRM application.
 */

/**
 * Base Application Error class.
 * All operational errors extend from this class.
 */
class AppError extends Error {
  /**
   * @param {string} message - Error description
   * @param {number} [statusCode=500] - HTTP status code
   * @param {string} [code='INTERNAL_SERVER_ERROR'] - Error machine-readable code
   * @param {any} [details=null] - Additional validation or context details
   * @param {boolean} [isOperational=true] - Whether the error is known/operational
   */
  constructor(message, statusCode = 500, code = 'INTERNAL_SERVER_ERROR', details = null, isOperational = true) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Validation Error - HTTP 400
 */
class ValidationError extends AppError {
  /**
   * @param {string} [message='Validation failed']
   * @param {any} [details=null]
   */
  constructor(message = 'Validation failed', details = null) {
    super(message, 400, 'VALIDATION_ERROR', details, true);
  }
}

/**
 * Authentication Error - HTTP 401
 */
class AuthenticationError extends AppError {
  /**
   * @param {string} [message='Authentication required or token invalid']
   * @param {any} [details=null]
   */
  constructor(message = 'Authentication required or token invalid', details = null) {
    super(message, 401, 'AUTHENTICATION_ERROR', details, true);
  }
}

/**
 * Authorization Error - HTTP 403
 */
class AuthorizationError extends AppError {
  /**
   * @param {string} [message='Forbidden: Insufficient permissions']
   * @param {any} [details=null]
   */
  constructor(message = 'Forbidden: Insufficient permissions', details = null) {
    super(message, 403, 'AUTHORIZATION_ERROR', details, true);
  }
}

/**
 * Not Found Error - HTTP 404
 */
class NotFoundError extends AppError {
  /**
   * @param {string} [message='Resource not found']
   * @param {any} [details=null]
   */
  constructor(message = 'Resource not found', details = null) {
    super(message, 404, 'NOT_FOUND_ERROR', details, true);
  }
}

/**
 * Conflict Error - HTTP 409
 */
class ConflictError extends AppError {
  /**
   * @param {string} [message='Resource conflict or duplicate entry']
   * @param {any} [details=null]
   */
  constructor(message = 'Resource conflict or duplicate entry', details = null) {
    super(message, 409, 'CONFLICT_ERROR', details, true);
  }
}

/**
 * Rate Limit Exceeded Error - HTTP 429
 */
class RateLimitError extends AppError {
  /**
   * @param {string} [message='Too many requests, please try again later']
   * @param {any} [details=null]
   */
  constructor(message = 'Too many requests, please try again later', details = null) {
    super(message, 429, 'RATE_LIMIT_ERROR', details, true);
  }
}

/**
 * External Service Error - HTTP 502 / 503
 */
class ExternalServiceError extends AppError {
  /**
   * @param {string} [message='Failed to communicate with external service']
   * @param {any} [details=null]
   */
  constructor(message = 'Failed to communicate with external service', details = null) {
    super(message, 502, 'EXTERNAL_SERVICE_ERROR', details, true);
  }
}

/**
 * Subscription Required Error - HTTP 402
 */
class SubscriptionRequiredError extends AppError {
  /**
   * @param {string} [message='Active subscription required to access this service']
   * @param {any} [details=null]
   */
  constructor(message = 'Active subscription required to access this service', details = null) {
    super(message, 402, 'SUBSCRIPTION_REQUIRED', details, true);
  }
}

/**
 * AI Audit Not Enabled Error - HTTP 403
 */
class AiAuditNotEnabledError extends AppError {
  /**
   * @param {string} [message='AI Audit feature is not enabled for your organization']
   * @param {any} [details=null]
   */
  constructor(message = 'AI Audit feature is not enabled for your organization', details = null) {
    super(message, 403, 'AI_AUDIT_NOT_ENABLED', details, true);
  }
}

/**
 * Module Not Enabled Error - HTTP 403
 */
class ModuleNotEnabledError extends AppError {
  /**
   * @param {string} [message='Module not enabled for your organization.']
   * @param {any} [details=null]
   */
  constructor(message = 'Module not enabled for your organization.', details = null) {
    super(message, 403, 'MODULE_NOT_ENABLED', details, true);
  }
}

module.exports = {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  ExternalServiceError,
  SubscriptionRequiredError,
  AiAuditNotEnabledError,
  ModuleNotEnabledError,
};

