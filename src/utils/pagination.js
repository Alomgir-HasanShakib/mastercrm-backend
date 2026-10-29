/**
 * @file pagination.js
 * @description Pagination parsing and metadata generation utility functions.
 */

/**
 * Parses query parameters into pagination and sorting parameters with sensible bounds.
 *
 * @param {object} query - Express request query object
 * @param {object} [defaults={}] - Default pagination options
 * @param {number} [defaults.defaultPage=1] - Default page number
 * @param {number} [defaults.defaultLimit=20] - Default page limit
 * @param {number} [defaults.maxLimit=100] - Maximum allowed page limit
 * @param {string} [defaults.defaultSortBy='created_at'] - Default sort field
 * @param {string} [defaults.defaultSortOrder='desc'] - Default sort direction ('asc'|'desc')
 * @returns {{ page: number, limit: number, offset: number, sortBy: string, sortOrder: string }}
 */
const parsePagination = (query = {}, defaults = {}) => {
  const defaultPage = defaults.defaultPage || 1;
  const defaultLimit = defaults.defaultLimit || 20;
  const maxLimit = defaults.maxLimit || 100;
  const defaultSortBy = defaults.defaultSortBy || 'created_at';
  const defaultSortOrder = defaults.defaultSortOrder || 'desc';

  let page = parseInt(query.page, 10);
  if (isNaN(page) || page < 1) {
    page = defaultPage;
  }

  let limit = parseInt(query.limit, 10);
  if (isNaN(limit) || limit < 1) {
    limit = defaultLimit;
  } else if (limit > maxLimit) {
    limit = maxLimit;
  }

  const offset = (page - 1) * limit;

  const sortBy = query.sortBy && typeof query.sortBy === 'string' ? query.sortBy.trim() : defaultSortBy;

  let sortOrder = query.sortOrder && typeof query.sortOrder === 'string' ? query.sortOrder.toLowerCase() : defaultSortOrder;
  if (sortOrder !== 'asc' && sortOrder !== 'desc') {
    sortOrder = defaultSortOrder;
  }

  return {
    page,
    limit,
    offset,
    sortBy,
    sortOrder,
  };
};

/**
 * Builds pagination metadata from total count and current pagination parameters.
 *
 * @param {number} total - Total records in database matching query
 * @param {number} page - Current page
 * @param {number} limit - Items per page
 * @returns {{ total: number, page: number, limit: number, totalPages: number, hasNext: boolean, hasPrev: boolean }}
 */
const buildPaginationMeta = (total, page, limit) => {
  const totalCount = parseInt(total, 10) || 0;
  const totalPages = Math.ceil(totalCount / limit) || 1;

  return {
    total: totalCount,
    page,
    limit,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
};

module.exports = {
  parsePagination,
  buildPaginationMeta,
};
