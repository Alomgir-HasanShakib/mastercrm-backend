/**
 * @file app.js
 * @description Express application setup, global middleware stack, route mounting, and error handling.
 */

const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const config = require('./config');
const requestLogger = require('./middleware/requestLogger');
const { generalLimiter } = require('./middleware/rateLimiter');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { checkDatabaseHealth } = require('./database/connection');
const { checkRedisHealth } = require('./config/redisClient');
const { success } = require('./utils/response');
const apiRoutes = require('./routes');

const app = express();

// Security HTTP headers
app.use(helmet());

// Enable CORS
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, postman)
      if (!origin) return callback(null, true);
      if (
        config.cors.origin.includes('*') ||
        config.cors.origin.indexOf(origin) !== -1 ||
        config.app.env === 'development'
      ) {
        return callback(null, true);
      }
      return callback(new Error('Blocked by CORS policy'));
    },
    credentials: config.cors.credentials,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-correlation-id', 'x-organization-id', 'x-client-id', 'x-vendor-id', 'x-project-id'],
  })
);

// Gzip response compression
app.use(compression());

// Request parsing
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Secured static audio uploads stream & storage playback
const { verifyToken } = require('./utils/crypto');
app.use(
  '/uploads',
  (req, res, next) => {
    // 1. Check Bearer token in header or token in query param (?token=)
    const authHeader = req.headers.authorization;
    const token = (authHeader && authHeader.startsWith('Bearer '))
      ? authHeader.split(' ')[1]
      : req.query.token;

    if (token) {
      try {
        const decoded = verifyToken(token);
        if (decoded && decoded.userId) {
          req.user = decoded;
          return next();
        }
      } catch (_) {}
    }

    // 2. Allow in local development; strictly require valid authentication in production
    if (config.app.env === 'development' || !config.app.env) {
      return next();
    }

    return res.status(401).json({
      success: false,
      message: 'Access denied: Valid authentication token is required to access uploaded media recordings.',
    });
  },
  express.static(path.resolve(config.storage.uploadDir || 'uploads'))
);

// Custom request logger with correlation ID
app.use(requestLogger);

// Global rate limiting
app.use(generalLimiter);

// Universal Operational Audit Logging Engine (captures all mutating operations across CRM)
const { autoAuditLogMiddleware } = require('./middlewares/auditLog.middleware');
app.use(autoAuditLogMiddleware());

// Root level health check endpoint
app.get('/health', async (req, res, next) => {
  try {
    const dbHealth = await checkDatabaseHealth();
    const redisHealth = await checkRedisHealth();

    const isSystemHealthy = dbHealth.status === 'healthy';

    return success(
      res,
      {
        status: isSystemHealthy ? 'healthy' : 'degraded',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        services: {
          database: dbHealth,
          redis: redisHealth,
        },
      },
      'Service health status',
      isSystemHealthy ? 200 : 503
    );
  } catch (err) {
    return next(err);
  }
});

// Mount modular API routes under /api/v1, /api, and / for full URL compatibility
app.use(config.app.apiPrefix, apiRoutes); // /api/v1/*
app.use('/api', apiRoutes);               // /api/*
app.use('/', apiRoutes);                  // /*

// Catch-all 404 handler
app.use(notFoundHandler);

// Centralized error handler
app.use(errorHandler);

module.exports = app;
