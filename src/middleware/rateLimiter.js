/**
 * @file rateLimiter.js
 * @description API rate limiting middleware using express-rate-limit.
 */

const rateLimit = require('express-rate-limit');
const config = require('../config');
const { RateLimitError } = require('../utils/errors');

/**
 * Standard rate limiter for public and general API endpoints.
 */
const generalLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next) => {
    next(new RateLimitError(`Too many requests from this IP, please try again after ${Math.ceil(config.rateLimit.windowMs / 60000)} minutes.`));
  },
});

/**
 * Stricter rate limiter for authentication routes (login, register, forgot-password).
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes window
  max: config.rateLimit.authMax,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next) => {
    next(new RateLimitError('Too many authentication attempts, please try again after 15 minutes.'));
  },
});

module.exports = {
  generalLimiter,
  authLimiter,
};
