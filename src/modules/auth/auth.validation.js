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
 * Requires min 8 characters, at least 1 uppercase, 1 lowercase, and 1 number.
 */
const changePasswordSchema = Joi.object({
  currentPassword: Joi.string()
    .required()
    .messages({
      'any.required': 'Current password is required',
    }),
  newPassword: Joi.string()
    .min(8)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .required()
    .messages({
      'string.min': 'New password must be at least 8 characters long',
      'string.pattern.base': 'New password must contain at least one uppercase letter, one lowercase letter, and one number',
      'any.required': 'New password is required',
    }),
});

module.exports = {
  loginSchema,
  refreshSchema,
  changePasswordSchema,
};
