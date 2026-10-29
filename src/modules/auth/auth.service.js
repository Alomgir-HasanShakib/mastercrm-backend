/**
 * @file auth.service.js
 * @description Business logic layer for authentication, token issuance, password updates, and profile management.
 */

const crypto = require('crypto');
const config = require('../../config');
const logger = require('../../utils/logger');
const { AuthenticationError, NotFoundError, ValidationError } = require('../../utils/errors');
const { hashPassword, comparePassword, generateToken, verifyToken } = require('../../utils/crypto');
const authModel = require('./auth.model');

/**
 * Computes a SHA-256 digest of a token for secure database storage.
 *
 * @param {string} token - Raw token string
 * @returns {string} Hex-encoded SHA-256 hash
 */
const hashTokenString = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

/**
 * Parses duration strings like '7d', '15m', '24h' into future Date instance.
 *
 * @param {string} durationStr - Duration string
 * @returns {Date} Expiry Date
 */
const calculateExpirationDate = (durationStr = '7d') => {
  const match = durationStr.match(/^(\d+)([smhd])$/);
  const now = Date.now();
  if (!match) {
    // Default 7 days
    return new Date(now + 7 * 24 * 60 * 60 * 1000);
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 's':
      return new Date(now + value * 1000);
    case 'm':
      return new Date(now + value * 60 * 1000);
    case 'h':
      return new Date(now + value * 60 * 60 * 1000);
    case 'd':
      return new Date(now + value * 24 * 60 * 60 * 1000);
    default:
      return new Date(now + 7 * 24 * 60 * 60 * 1000);
  }
};

/**
 * Sanitizes a user database record, removing sensitive password and token fields.
 *
 * @param {object} user - User record from database
 * @returns {object} Sanitized user object
 */
const sanitizeUser = (user) => {
  if (!user) return null;
  const { password_hash, password, ...safeUser } = user;
  return safeUser;
};

const enrichUserWithOrgDetails = async (user) => {
  if (!user) return user;
  const orgId = user.organization_id || user.organizationId;
  let org = null;
  let hasActiveSubscription = true;
  let subscriptionStatus = 'ACTIVE';

  if (orgId) {
    try {
      const tenancyModel = require('../tenancy/tenancy.model');
      org = await tenancyModel.findOrganizationById(orgId);
    } catch (_) {}

    try {
      const subscriptionService = require('../subscriptions/subscription.service');
      const subDetails = await subscriptionService.getSubscriptionByOrg(orgId, { isMasterAdmin: true });
      hasActiveSubscription = subDetails?.hasActiveSubscription ?? (org ? org.is_active !== false : true);
      subscriptionStatus = subDetails?.status || (hasActiveSubscription ? 'ACTIVE' : 'NO_SUBSCRIPTION');
    } catch (_) {}
  }

  const defaultModules = ['CAPI', 'CATI', 'TVC', 'FA', 'SUPER_AUDIT'];
  const enabledModules = org?.enabled_modules || defaultModules;
  return {
    ...user,
    organization_name: org?.name || user.organization_name || null,
    organizationName: org?.name || user.organizationName || null,
    organization_code: org?.code || user.organization_code || null,
    organizationCode: org?.code || user.organizationCode || null,
    organization: org ? {
      id: org.id,
      name: org.name,
      code: org.code,
      enabled_modules: enabledModules,
      has_active_subscription: hasActiveSubscription,
      hasActiveSubscription: hasActiveSubscription,
    } : null,
    has_active_subscription: hasActiveSubscription,
    hasActiveSubscription: hasActiveSubscription,
    subscription_status: subscriptionStatus,
    enabled_modules: enabledModules,
    enabledModules: enabledModules,
  };
};

const DEMO_ACCOUNTS = {
  'admin@mastercrm.com': {
    id: '66666666-6666-6666-6666-666666666601',
    email: 'admin@mastercrm.com',
    first_name: 'Master',
    last_name: 'Administrator',
    role: 'MASTER_ADMIN',
    role_name: 'MASTER_ADMIN',
    organization_id: '11111111-1111-1111-1111-111111111111',
    vendor_id: null,
    status: 'ACTIVE',
    permissions: ['*'],
  },
  'admin@crm.local': {
    id: '66666666-6666-6666-6666-666666666601',
    email: 'admin@crm.local',
    first_name: 'Raj',
    last_name: 'Singhania',
    role: 'MASTER_ADMIN',
    role_name: 'MASTER_ADMIN',
    organization_id: '11111111-1111-1111-1111-111111111111',
    vendor_id: null,
    status: 'ACTIVE',
    permissions: ['*'],
  },
  'orgadmin@mastercrm.com': {
    id: '66666666-6666-6666-6666-666666666602',
    email: 'orgadmin@mastercrm.com',
    first_name: 'Vikram',
    last_name: 'Malhotra',
    role: 'ORG_ADMIN',
    role_name: 'ORG_ADMIN',
    organization_id: '11111111-1111-1111-1111-111111111111',
    vendor_id: null,
    status: 'ACTIVE',
    permissions: ['*'],
  },
  'client@crm.local': {
    id: '66666666-6666-6666-6666-666666666602',
    email: 'client@crm.local',
    first_name: 'Amit',
    last_name: 'Desai',
    role: 'ORG_ADMIN',
    role_name: 'ORG_ADMIN',
    organization_id: '11111111-1111-1111-1111-111111111111',
    vendor_id: null,
    status: 'ACTIVE',
    permissions: ['*'],
  },
  'tvc@mastercrm.com': {
    id: '66666666-6666-6666-6666-666666666608',
    email: 'tvc@mastercrm.com',
    first_name: 'Neha',
    last_name: 'Sharma',
    role: 'TVC_AGENT',
    role_name: 'TVC_AGENT',
    organization_id: '11111111-1111-1111-1111-111111111111',
    vendor_id: '33333333-3333-3333-3333-333333333331',
    status: 'ACTIVE',
    permissions: ['tvc:*', 'dialer:*', 'submissions:read'],
  },
  'tvc@crm.local': {
    id: '66666666-6666-6666-6666-666666666608',
    email: 'tvc@crm.local',
    first_name: 'Neha',
    last_name: 'Sharma',
    role: 'TVC_AGENT',
    role_name: 'TVC_AGENT',
    organization_id: '11111111-1111-1111-1111-111111111111',
    vendor_id: '33333333-3333-3333-3333-333333333331',
    status: 'ACTIVE',
    permissions: ['tvc:*', 'dialer:*', 'submissions:read'],
  },
  'capi@mastercrm.com': {
    id: '66666666-6666-6666-6666-666666666606',
    email: 'capi@mastercrm.com',
    first_name: 'Anjali',
    last_name: 'Mehta',
    role: 'CAPI_AUDITOR',
    role_name: 'CAPI_AUDITOR',
    organization_id: '11111111-1111-1111-1111-111111111111',
    vendor_id: '33333333-3333-3333-3333-333333333331',
    status: 'ACTIVE',
    permissions: ['capi:*', 'exam:*', 'submissions:read'],
  },
  'capi@crm.local': {
    id: '66666666-6666-6666-6666-666666666606',
    email: 'capi@crm.local',
    first_name: 'Anjali',
    last_name: 'Mehta',
    role: 'CAPI_AUDITOR',
    role_name: 'CAPI_AUDITOR',
    organization_id: '11111111-1111-1111-1111-111111111111',
    vendor_id: '33333333-3333-3333-3333-333333333331',
    status: 'ACTIVE',
    permissions: ['capi:*', 'exam:*', 'submissions:read'],
  },
  'cati@mastercrm.com': {
    id: '66666666-6666-6666-6666-666666666605',
    email: 'cati@mastercrm.com',
    first_name: 'Rahul',
    last_name: 'Verma',
    role: 'CATI_AGENT',
    role_name: 'CATI_AGENT',
    organization_id: '11111111-1111-1111-1111-111111111111',
    vendor_id: '33333333-3333-3333-3333-333333333331',
    status: 'ACTIVE',
    permissions: ['field_cati:*', 'field-cati:*', 'submissions:*', 'dialer:*', 'exam:*'],
  },
  'cati@crm.local': {
    id: '66666666-6666-6666-6666-666666666605',
    email: 'cati@crm.local',
    first_name: 'Rahul',
    last_name: 'Verma',
    role: 'CATI_AGENT',
    role_name: 'CATI_AGENT',
    organization_id: '11111111-1111-1111-1111-111111111111',
    vendor_id: '33333333-3333-3333-3333-333333333331',
    status: 'ACTIVE',
    permissions: ['field_cati:*', 'field-cati:*', 'submissions:*', 'dialer:*', 'exam:*'],
  },
  'superaudit@mastercrm.com': {
    id: '66666666-6666-6666-6666-666666666607',
    email: 'superaudit@mastercrm.com',
    first_name: 'Vikram',
    last_name: 'Saxena',
    role: 'SUPER_AUDITOR',
    role_name: 'SUPER_AUDITOR',
    organization_id: '11111111-1111-1111-1111-111111111111',
    vendor_id: null,
    status: 'ACTIVE',
    permissions: ['super_audit:*', 'super-audit:*', 'capi:read', 'submissions:read', 'reports:read'],
  },
  'superauditor@crm.local': {
    id: '66666666-6666-6666-6666-666666666607',
    email: 'superauditor@crm.local',
    first_name: 'Vikram',
    last_name: 'Saxena',
    role: 'SUPER_AUDITOR',
    role_name: 'SUPER_AUDITOR',
    organization_id: '11111111-1111-1111-1111-111111111111',
    vendor_id: null,
    status: 'ACTIVE',
    permissions: ['super_audit:*', 'super-audit:*', 'capi:read', 'submissions:read', 'reports:read'],
  },
  'fa@mastercrm.com': {
    id: '66666666-6666-6666-6666-666666666609',
    email: 'fa@mastercrm.com',
    first_name: 'Karan',
    last_name: 'Joshi',
    role: 'FA_AGENT',
    role_name: 'FA_AGENT',
    organization_id: '11111111-1111-1111-1111-111111111111',
    vendor_id: '33333333-3333-3333-3333-333333333331',
    status: 'ACTIVE',
    permissions: ['feedback:*', 'fa:*', 'dialer:*', 'submissions:read'],
  },
  'fa@crm.local': {
    id: '66666666-6666-6666-6666-666666666609',
    email: 'fa@crm.local',
    first_name: 'Karan',
    last_name: 'Joshi',
    role: 'FA_AGENT',
    role_name: 'FA_AGENT',
    organization_id: '11111111-1111-1111-1111-111111111111',
    vendor_id: '33333333-3333-3333-3333-333333333331',
    status: 'ACTIVE',
    permissions: ['feedback:*', 'fa:*', 'dialer:*', 'submissions:read'],
  },
};

/**
 * Authenticates user credentials and checks active account status.
 *
 * @param {string} email - User email
 * @param {string} password - User plaintext password
 * @returns {Promise<object>} Authenticated user record
 */
const authenticateUser = async (email, password) => {
  const normEmail = (email || '').toLowerCase().trim();

  let user = null;
  try {
    user = await authModel.findUserByEmail(normEmail);
  } catch (dbErr) {
    logger.warn('Database user query failed or DB offline, evaluating development fallback:', { error: dbErr.message });
  }

  // If user found in database, check status and password
  if (user) {
    if (user.status && user.status.toUpperCase() !== 'ACTIVE') {
      throw new AuthenticationError(`Account is ${user.status.toLowerCase()}. Please contact administrator.`);
    }

    const storedHash = user.password_hash || user.password;
    const isPasswordValid = await comparePassword(password, storedHash);
    if (!isPasswordValid) {
      throw new AuthenticationError('Invalid email or password.');
    }

    // Update last login timestamp
    try {
      await authModel.updateLastLogin(user.id);
    } catch (_) {}

    return enrichUserWithOrgDetails(user);
  }

  // 2. Demo fallback ONLY in non-production development environments if user not found in database
  if (config.app.env !== 'production') {
    const demoUser = DEMO_ACCOUNTS[normEmail];
    if (demoUser && (password === 'password123' || password === 'Password123!' || password === 'admin123')) {
      return enrichUserWithOrgDetails({ ...demoUser });
    }
  }

  throw new AuthenticationError('Invalid email or password.');
};

/**
 * Generates an access token and a refresh token, persisting the refresh token in DB.
 *
 * @param {object} user - Sanitized user object
 * @returns {Promise<{ accessToken: string, refreshToken: string, expiresIn: string }>}
 */
const generateTokenPair = async (user) => {
  const normalizedRole = (user.role || user.role_name || user.roleName || 'VIEWER').toUpperCase().replace(/\s+/g, '_');
  const payload = {
    userId: user.id,
    id: user.id,
    email: user.email,
    role: normalizedRole,
    roleName: normalizedRole,
    role_name: normalizedRole,
    roleId: user.role_id,
    organizationId: user.organization_id || user.organizationId,
    organization_id: user.organization_id || user.organizationId,
    vendorId: user.vendor_id || user.vendorId,
    vendor_id: user.vendor_id || user.vendorId,
    permissions: user.permissions || [],
  };

  const accessSecret = config.jwt.secret || config.jwt.accessSecret;
  const accessExpiresIn = config.jwt.expiresIn || config.jwt.accessExpiration || '15m';

  const refreshSecret = config.jwt.refreshSecret || accessSecret;
  const refreshExpiresIn = config.jwt.refreshExpiresIn || config.jwt.refreshExpiration || '7d';

  const accessToken = generateToken(payload, accessSecret, accessExpiresIn);
  const refreshToken = generateToken({ userId: user.id, tokenType: 'refresh' }, refreshSecret, refreshExpiresIn);

  const tokenHash = hashTokenString(refreshToken);
  const expiresAt = calculateExpirationDate(refreshExpiresIn);

  try {
    await authModel.createRefreshToken(user.id, tokenHash, expiresAt);
  } catch (dbErr) {
    logger.warn('Failed to persist refresh token to database (operating in ephemeral session mode):', { error: dbErr.message });
  }

  return {
    accessToken,
    refreshToken,
    expiresIn: accessExpiresIn,
  };
};

/**
 * Validates a refresh token, rotates it, and generates a new access+refresh token pair.
 *
 * @param {string} refreshToken - Raw refresh token string
 * @returns {Promise<{ accessToken: string, refreshToken: string, expiresIn: string, user: object }>}
 */
const refreshTokens = async (refreshToken) => {
  if (!refreshToken) {
    throw new AuthenticationError('Refresh token is required.');
  }

  const refreshSecret = config.jwt.refreshSecret || config.jwt.secret || config.jwt.accessSecret;
  let decoded;

  try {
    decoded = verifyToken(refreshToken, refreshSecret);
  } catch (err) {
    throw new AuthenticationError('Invalid or expired refresh token.');
  }

  const userId = decoded?.userId || decoded?.id;
  if (!userId) {
    throw new AuthenticationError('Invalid refresh token payload.');
  }

  const tokenHash = hashTokenString(refreshToken);
  let storedToken = null;
  try {
    storedToken = await authModel.findRefreshToken(tokenHash);
  } catch (err) {
    logger.warn('Error querying refresh token from database:', { error: err.message });
  }

  // If stored in database, check expiration and rotate
  if (storedToken) {
    if (storedToken.expires_at && new Date(storedToken.expires_at) < new Date()) {
      try {
        await authModel.deleteRefreshToken(storedToken.id);
      } catch (_) {}
      throw new AuthenticationError('Refresh token has expired. Please log in again.');
    }
    // Token rotation: delete old refresh token record
    try {
      await authModel.deleteRefreshToken(storedToken.id);
    } catch (_) {}
  }

  // Resolve user either by DB or demo accounts
  let user = null;
  try {
    user = await authModel.findUserById(storedToken?.user_id || userId);
  } catch (err) {
    logger.warn('Failed to query user by id:', { error: err.message });
  }

  if (!user) {
    user = Object.values(DEMO_ACCOUNTS).find((u) => u.id === (storedToken?.user_id || userId));
  }

  if (!user || (user.status && user.status.toUpperCase() !== 'ACTIVE')) {
    throw new AuthenticationError('User account not found or is inactive.');
  }

  // Generate new pair
  const tokenPair = await generateTokenPair(user);

  return {
    ...tokenPair,
    user: sanitizeUser(user),
  };
};

/**
 * Invalidates a single refresh token upon user logout.
 *
 * @param {string} token - Raw refresh token to invalidate
 * @returns {Promise<boolean>} True if invalidated
 */
const invalidateRefreshToken = async (token) => {
  if (!token) return false;
  const tokenHash = hashTokenString(token);
  const storedToken = await authModel.findRefreshToken(tokenHash);
  if (storedToken) {
    await authModel.deleteRefreshToken(storedToken.id);
    return true;
  }
  return false;
};

/**
 * Invalidates all refresh tokens for a user (e.g., security reset).
 *
 * @param {string|number} userId - User primary ID
 * @returns {Promise<number>} Number of invalidated tokens
 */
const invalidateAllUserTokens = async (userId) => {
  return authModel.deleteAllUserRefreshTokens(userId);
};

/**
 * Updates a user's password after validating current password.
 * Invalidates all existing refresh tokens for security.
 *
 * @param {string|number} userId - User primary ID
 * @param {string} currentPassword - Current plaintext password
 * @param {string} newPassword - New plaintext password
 * @returns {Promise<boolean>} True if password changed successfully
 */
const changePassword = async (userId, currentPassword, newPassword) => {
  const user = await authModel.findUserById(userId);

  if (!user) {
    throw new NotFoundError('User not found.');
  }

  const storedHash = user.password_hash || user.password;
  const isMatch = await comparePassword(currentPassword, storedHash);

  if (!isMatch) {
    throw new ValidationError('Current password does not match.');
  }

  const isSamePassword = await comparePassword(newPassword, storedHash);
  if (isSamePassword) {
    throw new ValidationError('New password cannot be the same as the current password.');
  }

  const newHash = await hashPassword(newPassword);
  await authModel.updatePassword(userId, newHash);

  // Invalidate all active refresh tokens
  await authModel.deleteAllUserRefreshTokens(userId);

  return true;
};

/**
 * Retrieves multi-campaign assignments directly from PostgreSQL DB.
 * For Organization Admin: Returns campaigns belonging to their organization in DB.
 * For Master Admin: Returns platform campaigns from DB.
 * For Operational Agents: Returns direct user_project_assignments joined with projects.
 *
 * @param {string|number} userId
 * @param {object} user
 * @returns {Promise<Array>}
 */
const getUserCampaignAssignments = async (userId, user = {}) => {
  try {
    const { db } = require('../../database/connection');
    const roleSlug = (user.role || user.role_name || user.roleName || user.role_slug || '').toUpperCase();
    const orgId = user.organization_id || user.organizationId;

    // Organization Admin: strictly projects belonging to their organization in DB
    if (['ORGANIZATION_ADMIN', 'CLIENT_ADMIN', 'ORG_ADMIN'].includes(roleSlug)) {
      if (!orgId) return [];
      const orgProjects = await db('projects')
        .where('organization_id', orgId)
        .select('id as campaign_id', 'name as campaign_name', db.raw('COALESCE(code, project_code) as campaign_code'))
        .orderBy('created_at', 'desc');

      return (orgProjects || []).map((p) => ({
        id: p.campaign_id,
        campaign_id: p.campaign_id,
        campaign_name: p.campaign_name,
        campaign_code: p.campaign_code,
        role_slug: roleSlug,
        role_name: 'Organization Admin',
      }));
    }

    // Master Admin: platform projects
    if (roleSlug === 'MASTER_ADMIN' || roleSlug === 'SUPER_ADMIN') {
      const allProjects = await db('projects')
        .select('id as campaign_id', 'name as campaign_name', db.raw('COALESCE(code, project_code) as campaign_code'))
        .orderBy('created_at', 'desc')
        .limit(20);

      return (allProjects || []).map((p) => ({
        id: p.campaign_id,
        campaign_id: p.campaign_id,
        campaign_name: p.campaign_name,
        campaign_code: p.campaign_code,
        role_slug: 'MASTER_ADMIN',
        role_name: 'Super Admin',
      }));
    }

    // Operational Agents / Callers / Auditors:
    const assignments = await db('user_project_assignments')
      .join('projects', 'projects.id', 'user_project_assignments.project_id')
      .leftJoin('roles', 'roles.id', 'user_project_assignments.role_id')
      .where('user_project_assignments.user_id', userId)
      .select(
        'user_project_assignments.id',
        'projects.id as campaign_id',
        'projects.name as campaign_name',
        db.raw('COALESCE(projects.code, projects.project_code) as campaign_code'),
        'roles.slug as role_slug',
        'roles.name as role_name'
      );

    return assignments || [];
  } catch (err) {
    logger.warn('Failed to query user campaign assignments from DB:', { error: err.message });
    return [];
  }
};

/**
 * Retrieves the full profile of a user with role, permissions, and project assignments.
 *
 * @param {string|number} userId - User primary ID
 * @returns {Promise<object>} User profile with roles and assignments
 */
const getUserProfile = async (userId) => {
  let user = null;
  try {
    user = await authModel.findUserById(userId);
  } catch (err) {
    logger.warn('Failed to fetch user from DB:', { error: err.message });
  }

  if (!user) {
    const matchedDemo = Object.values(DEMO_ACCOUNTS).find((u) => u.id === userId);
    if (matchedDemo) {
      return {
        ...matchedDemo,
        assignments: [],
        assignedCampaigns: [],
        leaseStats: null,
      };
    }
    throw new NotFoundError('User profile not found.');
  }

  let assignments = [];
  try {
    assignments = await authModel.findUserAssignments(userId);
  } catch (err) {
    // Non-blocking
  }

  // Parse permissions if stored as string/JSON
  let permissions = user.role_permissions;
  if (typeof permissions === 'string') {
    try {
      permissions = JSON.parse(permissions);
    } catch {
      permissions = [permissions];
    }
  }

  const safeUser = sanitizeUser(user);
  const enrichedUser = await enrichUserWithOrgDetails(safeUser);
  const campaignAssignments = await getUserCampaignAssignments(userId, user);

  return {
    ...enrichedUser,
    permissions: permissions || [],
    assignments: assignments || [],
    assignedCampaigns: campaignAssignments,
    leaseStats: null,
  };
};

/**
 * Reserves a concurrent seat lease for an authenticated human user.
 * Re-uses existing lease if user already active in another tab.
 */
const reserveUserSeat = (user, metadata = {}) => {
  const role = (user.role || user.role_name || '').toUpperCase();
  if (role === 'MASTER_ADMIN' || !user.organization_id) {
    return { isExempt: true, seatType: 'PLATFORM_SUPER_ADMIN' };
  }
  const mockStore = require('../../database/mockStore');
  return mockStore.reserveSeatLease(user.organization_id, user.id, metadata);
};

/**
 * Releases a user's concurrent seat lease upon logout or session termination.
 */
const releaseUserSeat = (userId) => {
  const mockStore = require('../../database/mockStore');
  return mockStore.releaseSeatLease(userId);
};

/**
 * Switches a user's active campaign without allocating extra concurrent seat licenses.
 * Dynamically resolves campaign-scoped role and permissions.
 */
const switchCampaign = async (userId, campaignId) => {
  const mockStore = require('../../database/mockStore');
  const assignments = mockStore.getUserCampaignAssignments(userId);
  const target = assignments.find((a) => a.campaign_id === campaignId);

  if (!target) {
    throw new NotFoundError(`User is not assigned to campaign '${campaignId}'.`);
  }

  // Derive campaign-scoped role and permissions
  const roleSlug = (target.role_slug || '').toUpperCase();
  let permissions = [];
  switch (roleSlug) {
    case 'CATI_AGENT':
      permissions = ['field_cati:*', 'remote_cati:*', 'submissions:*', 'dialer:*', 'exam:*'];
      break;
    case 'CAPI_AUDITOR':
      permissions = ['capi:*', 'exam:*', 'submissions:read'];
      break;
    case 'SUPER_AUDITOR':
      permissions = ['super_audit:*', 'super-audit:*', 'capi:read', 'submissions:read', 'reports:read'];
      break;
    case 'TVC_AGENT':
      permissions = ['tvc:*', 'dialer:*', 'submissions:read'];
      break;
    case 'FA_AGENT':
      permissions = ['feedback:*', 'fa:*', 'dialer:*', 'submissions:read'];
      break;
    case 'VENDOR_ADMIN':
      permissions = ['vendor:*', 'users:read', 'submissions:read'];
      break;
    case 'ORG_ADMIN':
    case 'MASTER_ADMIN':
      permissions = ['*'];
      break;
    default:
      permissions = ['submissions:read'];
  }

  const user = await authModel.findUserById(userId);
  const updatedUserContext = {
    ...sanitizeUser(user),
    role: roleSlug,
    role_name: target.role_name,
    role_id: target.role_id,
    activeCampaign: {
      id: target.campaign_id,
      name: target.campaign_name,
      code: target.campaign_code,
      team_id: target.team_id,
      module_setup: target.module_setup,
      role: roleSlug,
    },
    permissions,
  };

  const tokens = await generateTokenPair(updatedUserContext);

  return {
    tokens,
    user: updatedUserContext,
    activeCampaign: updatedUserContext.activeCampaign,
    role: roleSlug,
    permissions,
  };
};

module.exports = {
  authenticateUser,
  generateTokenPair,
  refreshTokens,
  invalidateRefreshToken,
  invalidateAllUserTokens,
  changePassword,
  getUserProfile,
  getUserCampaignAssignments,
  reserveUserSeat,
  releaseUserSeat,
  switchCampaign,
  sanitizeUser,
};
