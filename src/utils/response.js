/**
 * @file response.js
 * @description Standard API response envelope helpers for consistent HTTP responses.
 */

/**
 * Format and send a successful HTTP response.
 *
 * @param {import('express').Response} res - Express response object
 * @param {any} [data=null] - Payload to return
 * @param {string} [message='Operation successful'] - Success message
 * @param {number} [statusCode=200] - HTTP status code
 * @param {object} [meta=null] - Optional metadata
 * @returns {import('express').Response}
 */
const success = (res, data = null, message = 'Operation successful', statusCode = 200, meta = null) => {
  const response = {
    success: true,
    message,
    data,
    error: null,
  };

  if (meta) {
    response.meta = meta;
  }

  return res.status(statusCode).json(response);
};

/**
 * Format and send a paginated successful HTTP response.
 *
 * @param {import('express').Response} res - Express response object
 * @param {Array} data - List of items for current page
 * @param {object} pagination - Pagination metadata
 * @param {number} pagination.page - Current page
 * @param {number} pagination.limit - Items per page
 * @param {number} pagination.total - Total items count
 * @param {number} pagination.totalPages - Total pages count
 * @param {boolean} pagination.hasNext - Has next page flag
 * @param {boolean} pagination.hasPrev - Has previous page flag
 * @param {string} [message='Data retrieved successfully']
 * @param {number} [statusCode=200]
 * @returns {import('express').Response}
 */
const paginated = (res, data = [], pagination = {}, message = 'Data retrieved successfully', statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
    error: null,
    meta: {
      pagination,
    },
  });
};

/**
 * Format and send an error HTTP response.
 *
 * @param {import('express').Response} res - Express response object
 * @param {object} error - Error descriptor
 * @param {string} [error.code='INTERNAL_SERVER_ERROR'] - Machine readable code
 * @param {string} [error.message='An unexpected error occurred'] - Human readable message
 * @param {any} [error.details=null] - Detailed validation or context info
 * @param {string} [error.correlationId=null] - Request correlation ID
 * @param {number} [statusCode=500] - HTTP status code
 * @returns {import('express').Response}
 */
const error = (res, errorObj = {}, statusCode = 500) => {
  const status = errorObj.statusCode || statusCode;
  const correlationId = res.req?.correlationId || errorObj.correlationId || null;

  return res.status(status).json({
    success: false,
    message: errorObj.message || 'An unexpected error occurred',
    data: null,
    error: {
      code: errorObj.code || 'INTERNAL_SERVER_ERROR',
      message: errorObj.message || 'An unexpected error occurred',
      details: errorObj.details || null,
      correlationId,
    },
  });
};

module.exports = {
  success,
  paginated,
  error,
};
