/**
 * @file auth.validation.js
 * @description Joi validation schemas for authentication routes.
 */

const Joi = require('joi');

/**
 * Validation schema for user login.
 */
const loginSchema = Joi.object({
  email: Joi.string()
    .email()
    .trim()
    .lowercase()
    .required()
    .messages({
      'string.email': 'A valid email address is required',
      'any.required': 'Email is required',
    }),
  password: Joi.string()
    .min(6)
    .required()
    .messages({
      'string.min': 'Password must be at least 6 characters long',
      'any.required': 'Password is required',
    }),
});

/**
 * Validation schema for refreshing tokens.
 */
const refreshSchema = Joi.object({
  refreshToken: Joi.string()
    .trim()
    .required()
    .messages({
      'string.empty': 'Refresh token cannot be empty',
      'any.required': 'Refresh token is required',
    }),
});

/**
 * Validation schema for changing user password.
 */
const changePasswordSchema = Joi.object({
  currentPassword: Joi.string()
    .required()
    .messages({
      'any.required': 'Current password is required',
    }),
  newPassword: Joi.string()
    .min(1)
    .required()
    .messages({
      'any.required': 'New password is required',
    }),
});

module.exports = {
  loginSchema,
  refreshSchema,
  changePasswordSchema,
};
