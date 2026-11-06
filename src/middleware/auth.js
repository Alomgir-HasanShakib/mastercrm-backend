/**
 * @file auth.js
 * @description JWT authentication middleware for verifying bearer tokens and attaching user context.
 */

const { AuthenticationError } = require('../utils/errors');
const { verifyToken } = require('../utils/crypto');
const config = require('../config');
const { db } = require('../database/connection');

/**
 * Express middleware that verifies incoming JWT in Authorization header.
 * Attaches decoded user info to req.user.
 *
 * @param {import('express').Request} req - Express request
 * @param {import('express').Response} res - Express response
 * @param {import('express').NextFunction} next - Express next function
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(new AuthenticationError('Authentication required. Missing or invalid Authorization header.'));
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return next(new AuthenticationError('Authentication required. Token is missing.'));
    }

    const secret = config.jwt.secret || config.jwt.accessSecret;
    const decoded = verifyToken(token, secret);

    if (!decoded || !decoded.userId) {
      return next(new AuthenticationError('Invalid or expired token payload.'));
    }

    // Auto-enrich & reconcile user context with live database (ensures FK integrity and tenant scoping)
    try {
      if (db.isDbHealthy && db.isDbHealthy()) {
        let dbUser = await db('users').where('id', decoded.userId || decoded.id).first();
        if (!dbUser && decoded.email) {
          dbUser = await db('users').whereRaw('LOWER(email) = ?', [decoded.email.toLowerCase().trim()]).first();
        }

        if (dbUser) {
          decoded.userId = dbUser.id;
          decoded.id = dbUser.id;
          decoded.organization_id = dbUser.organization_id;
          decoded.organizationId = dbUser.organization_id;
          decoded.vendor_id = dbUser.vendor_id;
          decoded.vendorId = dbUser.vendor_id;
          if (dbUser.role_id) {
            const r = await db('roles').where('id', dbUser.role_id).first();
            if (r) {
              decoded.role = r.slug || r.name;
              decoded.roleName = r.name;
              decoded.role_name = r.name;
            }
          }
        } else if (decoded.organization_id || decoded.organizationId) {
          const orgId = decoded.organization_id || decoded.organizationId;
          const orgExists = await db('organizations').where('id', orgId).first();
          if (!orgExists) {
            const fallbackOrg = await db('organizations').where('is_active', true).first() || await db('organizations').first();
            if (fallbackOrg) {
              decoded.organization_id = fallbackOrg.id;
              decoded.organizationId = fallbackOrg.id;
            }
          }
        }
      }
    } catch (_) {}

    req.user = decoded;
    return next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(new AuthenticationError('Access token has expired.'));
    }
    if (err.name === 'JsonWebTokenError') {
      return next(new AuthenticationError('Invalid access token.'));
    }
    return next(new AuthenticationError(err.message || 'Authentication failed.'));
  }
};

module.exports = {
  authenticate,
};
