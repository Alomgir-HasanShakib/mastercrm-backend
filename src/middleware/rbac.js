/**
 * @file rbac.js
 * @description Role-Based Access Control (RBAC) and permission check middleware with strict data isolation.
 */

const { AuthorizationError } = require('../utils/errors');

/**
 * Default permission definitions mapped to system roles.
 */
const ROLE_PERMISSIONS_MAP = {
  MASTER_ADMIN: ['*'],
  MASTER_ADMINISTRATOR: ['*'],
  SUPER_ADMIN: ['*'],
  ORGANIZATION_ADMINISTRATOR: [
    'tenancy:*', 'organizations:*', 'clients:*', 'vendors:*', 'projects:*',
    'users:*', 'questionnaire:*', 'questionnaires:*', 'rules:*', 'rules-engine:*',
    'submissions:*', 'capi:*', 'super_audit:*', 'super-audit:*',
    'tvc:*', 'fa:*', 'feedback:*', 'dialer:*', 'reports:*',
    'geography:*', 'exam:*', 'exams:*', 'realtime:*', 'ai:*', 'audit-log:*', 'audit:*'
  ],
  ORGANIZATION_ADMIN: [
    'tenancy:*', 'organizations:*', 'clients:*', 'vendors:*', 'projects:*',
    'users:*', 'questionnaire:*', 'questionnaires:*', 'rules:*', 'rules-engine:*',
    'submissions:*', 'capi:*', 'super_audit:*', 'super-audit:*',
    'tvc:*', 'fa:*', 'feedback:*', 'dialer:*', 'reports:*',
    'geography:*', 'exam:*', 'exams:*', 'realtime:*', 'ai:*', 'audit-log:*', 'audit:*'
  ],
  ORG_ADMIN: [
    'tenancy:*', 'organizations:*', 'clients:*', 'vendors:*', 'projects:*',
    'users:*', 'questionnaire:*', 'questionnaires:*', 'rules:*', 'rules-engine:*',
    'submissions:*', 'capi:*', 'super_audit:*', 'super-audit:*',
    'tvc:*', 'fa:*', 'feedback:*', 'dialer:*', 'reports:*',
    'geography:*', 'exam:*', 'exams:*', 'realtime:*', 'ai:*', 'audit-log:*', 'audit:*'
  ],
  CLIENT_ADMIN: [
    'tenancy:*', 'organizations:*', 'clients:*', 'vendors:*', 'projects:*',
    'users:*', 'questionnaire:*', 'questionnaires:*', 'rules:*', 'rules-engine:*',
    'submissions:*', 'capi:*', 'super_audit:*', 'super-audit:*',
    'tvc:*', 'fa:*', 'feedback:*', 'dialer:*', 'reports:*',
    'geography:*', 'exam:*', 'exams:*', 'realtime:*', 'ai:*', 'audit-log:*', 'audit:*'
  ],
  PROJECT_MANAGER: [
    'projects:*', 'submissions:*', 'capi:*', 'super_audit:*', 'super-audit:*',
    'tvc:*', 'fa:*', 'feedback:*', 'reports:*', 'dialer:*', 'exam:*', 'exams:*', 'realtime:*', 'audit-log:*', 'audit:*'
  ],
  VENDOR_ADMIN: [
    'vendors:*', 'projects:read', 'projects:*', 'users:*', 'users:manage', 'users:read', 'submissions:*', 'reports:read', 'dialer:*',
    'capi:*', 'tvc:*', 'field_cati:*', 'field-cati:*', 'audit-log:read', 'audit:read', 'operations:*', 'realtime:*'
  ],
  TVC_AGENT: [
    'tvc:*', 'dialer:*', 'submissions:*', 'projects:read', 'projects:*', 'questionnaires:read', 'questionnaire:read', 'operations:*', 'realtime:*'
  ],
  TVC: [
    'tvc:*', 'dialer:*', 'submissions:*', 'projects:read', 'projects:*', 'questionnaires:read', 'questionnaire:read', 'operations:*', 'realtime:*'
  ],
  TVC_CALLER: [
    'tvc:*', 'dialer:*', 'submissions:*', 'projects:read', 'projects:*', 'questionnaires:read', 'questionnaire:read', 'operations:*', 'realtime:*'
  ],
  TELE_VERIFIER: [
    'tvc:*', 'dialer:*', 'submissions:*', 'projects:read', 'projects:*', 'questionnaires:read', 'questionnaire:read', 'operations:*', 'realtime:*'
  ],
  TELE_CALLER: [
    'tvc:*', 'dialer:*', 'submissions:*', 'projects:read', 'projects:*', 'questionnaires:read', 'questionnaire:read', 'operations:*', 'realtime:*'
  ],
  TELE_AGENT: [
    'tvc:*', 'dialer:*', 'submissions:*', 'projects:read', 'projects:*', 'questionnaires:read', 'questionnaire:read', 'operations:*', 'realtime:*'
  ],
  CALLER: [
    'tvc:*', 'dialer:*', 'submissions:*', 'projects:read', 'projects:*', 'questionnaires:read', 'questionnaire:read', 'operations:*', 'realtime:*'
  ],
  VERIFIER: [
    'tvc:*', 'dialer:*', 'submissions:*', 'projects:read', 'projects:*', 'questionnaires:read', 'questionnaire:read', 'operations:*', 'realtime:*'
  ],
  CAPI_AUDITOR: [
    'capi:*', 'exam:*', 'exams:*', 'submissions:*', 'projects:read', 'questionnaires:read', 'questionnaire:read', 'operations:*', 'realtime:*'
  ],
  CAPI_AGENT: [
    'capi:*', 'exam:*', 'exams:*', 'submissions:*', 'projects:read', 'questionnaires:read', 'questionnaire:read', 'operations:*', 'realtime:*'
  ],
  CATI_AGENT: [
    'field_cati:*', 'field-cati:*', 'submissions:*', 'dialer:*', 'exam:*', 'exams:*', 'projects:read', 'questionnaires:read', 'questionnaire:read', 'operations:*', 'realtime:*'
  ],
  SUPER_AUDITOR: [
    'super_audit:*', 'super-audit:*', 'capi:*', 'submissions:*', 'reports:read', 'audit-log:*', 'audit:*', 'projects:read', 'questionnaires:read', 'questionnaire:read', 'operations:*', 'realtime:*'
  ],
  FA_AGENT: [
    'feedback:*', 'fa:*', 'dialer:*', 'submissions:*', 'projects:read', 'questionnaires:read', 'questionnaire:read', 'operations:*', 'realtime:*'
  ],
  EXAM_AGENT: [
    'exam:*', 'exams:*', 'submissions:*', 'projects:read'
  ],
  VIEWER: [
    'reports:read', 'submissions:read', 'projects:read'
  ],
};

/**
 * Checks if the authenticated user has any of the specified roles.
 *
 * @param {...string} allowedRoles - Role codes or names allowed to access
 * @returns {import('express').RequestHandler}
 */
const checkRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AuthorizationError('Unauthorized. User not authenticated.'));
    }

    const userRole = (req.user.role || req.user.roleName || req.user.role_name || req.user.role_slug || '').toUpperCase().replace(/[\s-]+/g, '_');
    const isMaster = userRole === 'MASTER_ADMIN' || userRole === 'MASTER_ADMINISTRATOR' || userRole === 'SUPER_ADMIN';

    // MASTER_ADMIN has unrestricted platform access to govern, test, and inspect all features
    if (isMaster) {
      return next();
    }

    const normalizedAllowed = new Set(allowedRoles.map((r) => r.toUpperCase().replace(/[\s-]+/g, '_')));
    if (
      normalizedAllowed.has('CLIENT_ADMIN') ||
      normalizedAllowed.has('ORG_ADMIN') ||
      normalizedAllowed.has('ORGANIZATION_ADMIN')
    ) {
      normalizedAllowed.add('CLIENT_ADMIN');
      normalizedAllowed.add('ORG_ADMIN');
      normalizedAllowed.add('ORGANIZATION_ADMIN');
    }

    if (normalizedAllowed.has(userRole) || normalizedAllowed.has('*')) {
      return next();
    }

    return next(
      new AuthorizationError(`Forbidden: Access denied for role '${userRole}'. Required: ${allowedRoles.join(', ')}`)
    );
  };
};

/**
 * Checks if the authenticated user has permission to perform action on resource.
 *
 * @param {string} resource - Name of the resource (e.g. 'users', 'organizations', 'tvc', 'capi')
 * @param {string} action - Action being performed (e.g. 'read', 'write', 'create', 'update', 'delete', 'manage')
 * @returns {import('express').RequestHandler}
 */
const checkPermission = (resource, action) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AuthorizationError('Unauthorized. User not authenticated.'));
    }

    const userRole = (req.user.role || req.user.roleName || req.user.role_name || req.user.role_slug || '').toUpperCase().replace(/[\s-]+/g, '_');
    const isMaster = userRole === 'MASTER_ADMIN' || userRole === 'MASTER_ADMINISTRATOR' || userRole === 'SUPER_ADMIN';

    // Master Admin has unrestricted platform access
    if (isMaster) {
      return next();
    }

    const normResource = resource.toLowerCase().replace(/_/g, '-');
    const normResourceSnake = resource.toLowerCase().replace(/-/g, '_');
    const normAction = (action || 'read').toLowerCase();

    const requiredPermission = `${normResource}:${normAction}`;
    const requiredSnake = `${normResourceSnake}:${normAction}`;
    const wildcardResource = `${normResource}:*`;
    const wildcardSnake = `${normResourceSnake}:*`;
    const allPermission = '*';

    const rolePermissions = ROLE_PERMISSIONS_MAP[userRole] || [];
    const directPermissions = Array.isArray(req.user.permissions) ? req.user.permissions : [];
    const userPermissions = [...new Set([...rolePermissions, ...directPermissions])];

    const hasPermission = userPermissions.some((perm) => {
      if (typeof perm === 'string') {
        const p = perm.toLowerCase();
        return (
          p === allPermission ||
          p === '*:*' ||
          p === wildcardResource ||
          p === wildcardSnake ||
          p === requiredPermission ||
          p === requiredSnake ||
          p === `${normResource}:manage` ||
          p === `${normResourceSnake}:manage`
        );
      }
      if (typeof perm === 'object' && perm !== null) {
        if (perm.resource === '*' || perm.resource === normResource || perm.resource === normResourceSnake) {
          if (perm.action === '*' || perm.action === 'manage' || perm.action === normAction) {
            return true;
          }
        }
      }
      return false;
    });

    if (hasPermission) {
      return next();
    }

    return next(new AuthorizationError(`Forbidden: Access denied. Role '${userRole}' cannot access '${resource}:${action}'.`));
  };
};

module.exports = {
  checkRole,
  checkPermission,
  ROLE_PERMISSIONS_MAP,
};

