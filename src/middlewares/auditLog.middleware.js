/**
 * @file auditLog.middleware.js
 * @description Enterprise-grade Operational Audit Logging Engine middleware and standalone logOperation utility.
 * Guarantees non-blocking, immutable audit logging to PostgreSQL with fallback to mockStore.
 */

const { v4: uuidv4 } = require('uuid');
const { db, isDbHealthy, checkDatabaseHealth } = require('../database/connection');
const mockStore = require('../database/mockStore');
const logger = require('../utils/logger');

// Sensitive field keys to scrub from logs
const SENSITIVE_KEYS = new Set([
  'password',
  'password_hash',
  'passwordhash',
  'pass',
  'token',
  'refreshtoken',
  'accesstoken',
  'secret',
  'apikey',
  'authorization',
  'creditcard',
  'cvv',
  'pin',
  'cookie',
]);

/**
 * Recursively deep-scrubs sensitive fields before saving to audit storage.
 * @param {any} data
 * @param {number} depth
 * @returns {any}
 */
const sanitizePayload = (data, depth = 0) => {
  if (depth > 6 || data === null || data === undefined) return data;
  if (typeof data !== 'object') return data;

  if (Array.isArray(data)) {
    return data.slice(0, 100).map((item) => sanitizePayload(item, depth + 1));
  }

  const clean = {};
  for (const [k, v] of Object.entries(data)) {
    const lowerKey = k.toLowerCase().replace(/[-_]/g, '');
    if (SENSITIVE_KEYS.has(lowerKey)) {
      clean[k] = '[REDACTED]';
    } else if (typeof v === 'object' && v !== null) {
      clean[k] = sanitizePayload(v, depth + 1);
    } else {
      clean[k] = v;
    }
  }
  return clean;
};

/**
 * Persistently records an operational audit entry.
 * Completely async and non-blocking — will never interrupt or slow down request lifecycle.
 *
 * @param {object} options
 * @param {string} [options.userId] - User ID who triggered the action
 * @param {string} [options.organizationId] - Tenant organization ID
 * @param {string} options.action - Audit action name (e.g. 'USER_LOGIN', 'CREATE_PROJECT')
 * @param {string} [options.entityType] - Type of entity affected (e.g. 'projects', 'users', 'capi_audits')
 * @param {string|number} [options.entityId] - ID of target entity
 * @param {string} [options.module] - Functional subsystem (e.g. 'AUTH', 'PROJECTS', 'CAPI', 'CATI', 'TVC', 'FA', 'USERS', 'SUBSCRIPTIONS')
 * @param {object|string} [options.oldValues] - Prior state before mutation
 * @param {object|string} [options.newValues] - Resulting state after mutation
 * @param {object|string} [options.metadata] - Additional contextual diagnostic information
 * @param {string} [options.ipAddress] - Request IP address
 * @param {string} [options.userAgent] - Request User-Agent header
 * @param {import('express').Request} [options.req] - Express request object (auto-extracts user, tenant, IP, UA)
 * @returns {Promise<object>} The recorded audit log record
 */
const logOperation = (options = {}) => {
  // Flag request as explicitly audited so autoAuditLogMiddleware doesn't duplicate it
  if (options.req) {
    options.req._auditLogged = true;
  }

  return new Promise((resolve) => {
    // Non-blocking execution via setImmediate so callers are never blocked
    setImmediate(async () => {
      try {
        const req = options.req || {};
        const reqHeaders = req.headers || {};

        // Extract and prioritize explicit options over request context
        const userId =
          options.userId ||
          req.user?.id ||
          req.user?.userId ||
          null;

        const organizationId =
          options.organizationId ||
          req.tenantContext?.organizationId ||
          req.user?.organizationId ||
          req.user?.organization_id ||
          null;

        const rawIp =
          options.ipAddress ||
          req.ip ||
          req.connection?.remoteAddress ||
          reqHeaders['x-forwarded-for'] ||
          '127.0.0.1';
        const ipAddress = typeof rawIp === 'string' ? rawIp.split(',')[0].trim().slice(0, 50) : null;

        const userAgent =
          options.userAgent ||
          reqHeaders['user-agent'] ||
          'System Process';

        const action = (options.action || 'OPERATION').toUpperCase().trim();
        const entityType = (options.entityType || options.resource || 'SYSTEM').toLowerCase().trim();
        const rawEntityId = options.entityId ?? options.resourceId ?? 'SYSTEM';
        const entityId = String(rawEntityId || 'SYSTEM').slice(0, 100);

        const rawModule = (options.module || options.resource || 'GENERAL').toUpperCase().trim();
        const moduleName = rawModule.replace(/-/g, '_');

        const serializeVal = (val) => {
          if (val === null || val === undefined) return null;
          const sanitized = sanitizePayload(val);
          if (typeof sanitized === 'string') return sanitized;
          try {
            return JSON.stringify(sanitized);
          } catch {
            return String(sanitized);
          }
        };

        const oldValues = serializeVal(options.oldValues);
        const newValues = serializeVal(options.newValues);

        const rawMeta = options.metadata || options.details || {};
        const sanitizedMeta = sanitizePayload(rawMeta);
        const metadata = typeof sanitizedMeta === 'string' ? sanitizedMeta : JSON.stringify(sanitizedMeta);

        const entryId = options.id || uuidv4();
        const createdAt = options.created_at || new Date();

        const logEntry = {
          id: entryId,
          organization_id: organizationId,
          user_id: userId,
          action,
          entity_type: entityType,
          entity_id: entityId,
          module: moduleName,
          old_values: oldValues,
          new_values: newValues,
          ip_address: ipAddress,
          user_agent: userAgent,
          metadata,
          created_at: createdAt,
          // Support legacy table column variations if present
          details: metadata,
          resource: entityType,
          resource_id: entityId,
        };

        // Ensure DB check has been attempted
        if (!isDbHealthy()) {
          try {
            await checkDatabaseHealth();
          } catch {
            // Ignore health check errors
          }
        }

        if (isDbHealthy()) {
          try {
            // Verify FK constraints safely to prevent PostgreSQL FK rejections
            let safeUserId = userId;
            let safeOrgId = organizationId;

            if (safeUserId) {
              const userExists = await db('users').where('id', safeUserId).select('id').first();
              if (!userExists) safeUserId = null;
            }

            if (safeOrgId) {
              const orgExists = await db('organizations').where('id', safeOrgId).select('id').first();
              if (!orgExists) safeOrgId = null;
            }

            // Clean record strictly for PostgreSQL columns
            const dbPayload = {
              id: entryId,
              organization_id: safeOrgId,
              user_id: safeUserId,
              action,
              entity_type: entityType,
              entity_id: entityId,
              module: moduleName,
              old_values: oldValues,
              new_values: newValues,
              ip_address: ipAddress,
              user_agent: userAgent,
              metadata,
              created_at: createdAt,
            };

            await db('audit_logs').insert(dbPayload);
          } catch (dbErr) {
            logger.warn(`[AUDIT_LOG] Database insert failed, falling back to mockStore: ${dbErr.message}`);
            mockStore.insert('audit_logs', logEntry);
          }
        } else {
          mockStore.insert('audit_logs', logEntry);
        }

        logger.info(`[AUDIT] [${moduleName}] ${action} on ${entityType}#${entityId} by user ${userId || 'anonymous'}`);
        resolve(logEntry);
      } catch (fatalErr) {
        logger.error(`[AUDIT_LOG] Critical logger exception: ${fatalErr.message}`);
        resolve(null);
      }
    });
  });
};

/**
 * Route inspector utility to extract module, entity, and action name from request.
 * @param {import('express').Request} req
 * @returns {{ moduleName: string, entityType: string, entityId: string, actionName: string }}
 */
const extractOperationDetails = (req) => {
  const method = (req.method || 'GET').toUpperCase();
  const rawUrl = req.originalUrl || req.url || '';
  const cleanPath = rawUrl.split('?')[0].replace(/^\/api\/v1|^\/api/, '');
  const segments = cleanPath.split('/').filter(Boolean);

  let moduleName = 'SYSTEM';
  let entityType = 'system';
  let entityId = req.params?.id || req.body?.id || 'SYSTEM';

  if (segments.length > 0) {
    const root = segments[0].toLowerCase();
    switch (root) {
      case 'auth':
        moduleName = 'AUTH';
        entityType = 'auth';
        break;
      case 'projects':
      case 'campaigns':
        moduleName = 'PROJECTS';
        entityType = 'project';
        break;
      case 'users':
        moduleName = 'USERS';
        entityType = 'user';
        break;
      case 'capi':
        moduleName = 'CAPI';
        entityType = 'capi_audit';
        break;
      case 'super-audit':
        moduleName = 'SUPER_AUDIT';
        entityType = 'super_audit';
        break;
      case 'tvc':
        moduleName = 'TVC';
        entityType = 'tvc_submission';
        break;
      case 'cati':
      case 'field-cati':
      case 'field-survey':
        moduleName = 'CATI';
        entityType = 'cati_survey';
        break;
      case 'feedback':
      case 'fa':
        moduleName = 'FEEDBACK';
        entityType = 'feedback';
        break;
      case 'client-db':
        moduleName = 'CLIENT_DB';
        entityType = 'client_db';
        break;
      case 'breaks':
        moduleName = 'BREAKS';
        entityType = 'agent_break';
        break;
      case 'system-settings':
      case 'settings':
        moduleName = 'SETTINGS';
        entityType = 'system_settings';
        break;
      case 'schemas':
      case 'schema-engine':
        moduleName = 'SCHEMA';
        entityType = 'schema';
        break;
      case 'questionnaire':
      case 'questionnaires':
        moduleName = 'QUESTIONNAIRE';
        entityType = 'questionnaire';
        break;
      case 'rules':
      case 'rules-engine':
        moduleName = 'RULES';
        entityType = 'rule';
        break;
      case 'submissions':
        moduleName = 'SUBMISSIONS';
        entityType = 'submission';
        break;
      case 'subscriptions':
        moduleName = 'SUBSCRIPTIONS';
        entityType = 'subscription';
        break;
      case 'tenancy':
      case 'organizations':
      case 'clients':
      case 'vendors':
        moduleName = 'TENANCY';
        entityType = root;
        break;
      case 'dialer':
        moduleName = 'DIALER';
        entityType = 'dialer_call';
        break;
      case 'exam':
      case 'exams':
        moduleName = 'EXAM';
        entityType = 'exam';
        break;
      case 'geography':
        moduleName = 'GEOGRAPHY';
        entityType = 'geography';
        break;
      case 'form-imports':
        moduleName = 'IMPORTS';
        entityType = 'form_import';
        break;
      case 'operations':
        moduleName = 'OPERATIONS';
        entityType = 'operation';
        break;
      case 'ai':
        moduleName = 'AI';
        entityType = 'ai_task';
        break;
      default:
        moduleName = root.toUpperCase().replace(/[-_]/g, '_');
        entityType = root.toLowerCase();
        break;
    }

    if (segments.length > 1 && entityId === 'SYSTEM') {
      const candidateId = segments[1];
      if (
        candidateId &&
        !['login', 'logout', 'test', 'sync', 'export', 'import', 'allocate', 'rechain', 'approve', 'reject'].includes(candidateId.toLowerCase())
      ) {
        entityId = candidateId;
      }
    }
  }

  // Derive human-readable action name
  let actionName = `${method}_${moduleName}`;
  const lastSegment = segments[segments.length - 1]?.toLowerCase() || '';

  if (method === 'POST') {
    if (lastSegment === 'login') actionName = 'USER_LOGIN';
    else if (lastSegment === 'logout') actionName = 'USER_LOGOUT';
    else if (lastSegment === 'sync') actionName = `SYNC_${moduleName}`;
    else if (lastSegment === 'allocate') actionName = `ALLOCATE_${moduleName}`;
    else if (lastSegment === 'export') actionName = `EXPORT_${moduleName}`;
    else if (lastSegment === 'import') actionName = `IMPORT_${moduleName}`;
    else if (lastSegment === 'pull') actionName = `MANUAL_PULL_${moduleName}`;
    else if (lastSegment === 'verdict' || lastSegment === 'audit') actionName = `AUDIT_VERDICT_${moduleName}`;
    else if (lastSegment === 'start' || lastSegment === 'request') actionName = `START_${moduleName}`;
    else if (lastSegment === 'stop' || lastSegment === 'end') actionName = `END_${moduleName}`;
    else if (lastSegment === 'approve') actionName = `APPROVE_${moduleName}`;
    else if (lastSegment === 'reject') actionName = `REJECT_${moduleName}`;
    else actionName = `CREATE_${moduleName}`;
  } else if (method === 'PUT' || method === 'PATCH') {
    actionName = `UPDATE_${moduleName}`;
  } else if (method === 'DELETE') {
    actionName = `DELETE_${moduleName}`;
  }

  return { moduleName, entityType, entityId, actionName };
};

/**
 * Universal automatic operational audit logging middleware.
 * Captures all mutating actions (POST, PUT, PATCH, DELETE) across every CRM endpoint
 * if not already explicitly logged, saving who, what, when, IP, user-agent, and payload.
 *
 * @returns {import('express').RequestHandler}
 */
const autoAuditLogMiddleware = () => {
  return (req, res, next) => {
    const method = req.method ? req.method.toUpperCase() : 'GET';
    // Only capture mutating HTTP methods
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      return next();
    }

    const path = req.originalUrl || req.url || '';
    // Skip static assets, health checks, or the audit-log queries itself
    if (
      path.includes('/health') ||
      path.includes('/audit-log') ||
      path.startsWith('/uploads')
    ) {
      return next();
    }

    const startTime = Date.now();

    // Hook on response completion
    res.on('finish', () => {
      // Do not duplicate if controller or service already explicitly logged via logOperation/auditLog
      if (req._auditLogged) return;
      // Only record successful operations (status < 400)
      if (res.statusCode >= 400) return;

      const { moduleName, entityType, entityId, actionName } = extractOperationDetails(req);
      const sanitizedBody = sanitizePayload(req.body);

      logOperation({
        req,
        action: actionName,
        module: moduleName,
        entityType,
        entityId,
        newValues: sanitizedBody,
        metadata: {
          path: req.originalUrl || req.url,
          method: req.method,
          statusCode: res.statusCode,
          durationMs: Date.now() - startTime,
          query: req.query || {},
        },
      });
    });

    next();
  };
};

/**
 * Express middleware for specific route configuration.
 *
 * @param {object} config
 * @returns {import('express').RequestHandler}
 */
const auditLogMiddleware = (config = {}) => {
  return (req, res, next) => {
    const startTime = Date.now();

    res.on('finish', () => {
      if (res.statusCode < 400) {
        const entityId = config.getEntityId
          ? config.getEntityId(req, res)
          : req.params.id || req.body?.id || 'SYSTEM';

        const newValues = config.getNewValues
          ? config.getNewValues(req, res)
          : req.body;

        const metadata = config.getMetadata
          ? config.getMetadata(req, res)
          : { durationMs: Date.now() - startTime, statusCode: res.statusCode };

        logOperation({
          req,
          action: config.action || `${req.method}_${config.module || 'RESOURCE'}`,
          module: config.module || 'GENERAL',
          entityType: config.entityType || config.module?.toLowerCase() || 'resource',
          entityId,
          newValues,
          metadata,
        });
      }
    });

    next();
  };
};

module.exports = {
  logOperation,
  auditLogMiddleware,
  autoAuditLogMiddleware,
  sanitizePayload,
  extractOperationDetails,
};
