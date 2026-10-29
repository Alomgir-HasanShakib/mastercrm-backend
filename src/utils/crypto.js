/**
 * @file crypto.js
 * @description Cryptographic utilities for password hashing, token generation, and verification.
 */

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');

const SALT_ROUNDS = 12;

/**
 * Hashes a plaintext password using bcrypt.
 *
 * @param {string} password - Plaintext password to hash
 * @returns {Promise<string>} Hashed password
 */
const hashPassword = async (password) => {
  return bcrypt.hash(password, SALT_ROUNDS);
};

/**
 * Compares a plaintext password against a hashed password.
 *
 * @param {string} password - Plaintext password
 * @param {string} hash - Stored hash
 * @returns {Promise<boolean>} True if matching, false otherwise
 */
const comparePassword = async (password, hash) => {
  if (!password || !hash) return false;
  return bcrypt.compare(password, hash);
};

/**
 * Generates a signed JSON Web Token.
 *
 * @param {object} payload - Claims to embed in token
 * @param {string} [secret] - Signing secret (defaults to config jwt secret)
 * @param {string} [expiresIn] - Expiry string (e.g. '15m', '7d')
 * @returns {string} Signed JWT
 */
const generateToken = (payload, secret = config.jwt.secret || config.jwt.accessSecret, expiresIn = config.jwt.expiresIn || config.jwt.accessExpiration) => {
  return jwt.sign(payload, secret, { expiresIn });
};

/**
 * Verifies and decodes a JSON Web Token.
 *
 * @param {string} token - JWT token string
 * @param {string} [secret] - Verification secret
 * @returns {object} Decoded token payload
 */
const verifyToken = (token, secret = config.jwt.secret || config.jwt.accessSecret) => {
  return jwt.verify(token, secret, { algorithms: ['HS256'] });
};

/**
 * Generates a cryptographically secure random hexadecimal or alphanumeric token.
 *
 * @param {number} [bytes=32] - Number of random bytes
 * @returns {string} Hexadecimal string
 */
const generateRandomToken = (bytes = 32) => {
  return crypto.randomBytes(bytes).toString('hex');
};

module.exports = {
  hashPassword,
  comparePassword,
  generateToken,
  verifyToken,
  generateRandomToken,
};
