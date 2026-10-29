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

    // Auto-enrich user context if organization_id or vendor_id is absent from payload
    if (!decoded.organization_id || !decoded.vendor_id || !decoded.role) {
      try {
        const dbUser = await db('users').where('id', decoded.userId || decoded.id).first();
        if (dbUser) {
          decoded.organization_id = decoded.organization_id || dbUser.organization_id;
          decoded.organizationId = decoded.organizationId || dbUser.organization_id;
          decoded.vendor_id = decoded.vendor_id || dbUser.vendor_id;
          decoded.vendorId = decoded.vendorId || dbUser.vendor_id;
          if (!decoded.role && dbUser.role_id) {
            const r = await db('roles').where('id', dbUser.role_id).first();
            decoded.role = r?.slug || r?.name;
            decoded.roleName = r?.name;
            decoded.role_name = r?.name;
          }
        }
      } catch (_) {}
    }

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
