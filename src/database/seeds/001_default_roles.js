/**
 * @file 001_default_roles.js
 * @description Knex seed script to insert core system permissions and default role mappings.
 */

const { v4: uuidv4 } = require('uuid');

/**
 * Seed database with default permissions and roles.
 *
 * @param {import('knex').Knex} knex
 * @returns {Promise<void>}
 */
exports.seed = async function (knex) {
  // Clear existing role permissions, permissions, and system roles
  await knex('role_permissions').del();
  await knex('permissions').del();
  await knex('roles').where('is_system', true).del();

  // Define comprehensive granular system permissions
  const permissionDefinitions = [
    // Organizations
    { slug: 'organizations:read', name: 'View Organizations', module: 'organizations', action: 'read' },
    { slug: 'organizations:write', name: 'Manage Organizations', module: 'organizations', action: 'write' },

    // Clients
    { slug: 'clients:read', name: 'View Clients', module: 'clients', action: 'read' },
    { slug: 'clients:write', name: 'Manage Clients', module: 'clients', action: 'write' },

    // Vendors
    { slug: 'vendors:read', name: 'View Vendors', module: 'vendors', action: 'read' },
    { slug: 'vendors:write', name: 'Manage Vendors', module: 'vendors', action: 'write' },

    // Projects
    { slug: 'projects:read', name: 'View Projects', module: 'projects', action: 'read' },
    { slug: 'projects:write', name: 'Manage Projects', module: 'projects', action: 'write' },
    { slug: 'projects:assign', name: 'Assign Vendors/Users to Projects', module: 'projects', action: 'assign' },

    // Users & Roles
    { slug: 'users:read', name: 'View Users', module: 'users', action: 'read' },
    { slug: 'users:write', name: 'Manage Users', module: 'users', action: 'write' },
    { slug: 'roles:read', name: 'View Roles', module: 'roles', action: 'read' },
    { slug: 'roles:write', name: 'Manage Roles', module: 'roles', action: 'write' },

    // Questionnaires
    { slug: 'questionnaires:read', name: 'View Questionnaires', module: 'questionnaires', action: 'read' },
    { slug: 'questionnaires:write', name: 'Manage Questionnaires', module: 'questionnaires', action: 'write' },
    { slug: 'questionnaires:publish', name: 'Publish Questionnaires', module: 'questionnaires', action: 'publish' },

    // Submissions
    { slug: 'submissions:read', name: 'View Submissions', module: 'submissions', action: 'read' },
    { slug: 'submissions:create', name: 'Create Submissions', module: 'submissions', action: 'create' },
    { slug: 'submissions:update', name: 'Update Submissions', module: 'submissions', action: 'update' },
    { slug: 'submissions:export', name: 'Export Submissions', module: 'submissions', action: 'export' },

    // CAPI Audit
    { slug: 'capi_audit:read', name: 'View CAPI Audits', module: 'capi_audit', action: 'read' },
    { slug: 'capi_audit:perform', name: 'Perform CAPI Audit', module: 'capi_audit', action: 'perform' },
    { slug: 'capi_audit:review', name: 'Review CAPI Audits', module: 'capi_audit', action: 'review' },

    // Super Audit
    { slug: 'super_audit:read', name: 'View Super Audits', module: 'super_audit', action: 'read' },
    { slug: 'super_audit:perform', name: 'Perform Super Audit', module: 'super_audit', action: 'perform' },
    { slug: 'super_audit:review', name: 'Review Super Audits', module: 'super_audit', action: 'review' },

    // TVC Call Module
    { slug: 'tvc:read', name: 'View TVC Leads', module: 'tvc', action: 'read' },
    { slug: 'tvc:dial', name: 'Make TVC Calls', module: 'tvc', action: 'dial' },
    { slug: 'tvc:manage', name: 'Manage TVC Module', module: 'tvc', action: 'manage' },

    // Feedback Analysis (FA)
    { slug: 'fa:read', name: 'View FA Leads', module: 'fa', action: 'read' },
    { slug: 'fa:dial', name: 'Make FA Calls', module: 'fa', action: 'dial' },
    { slug: 'fa:manage', name: 'Manage FA Module', module: 'fa', action: 'manage' },

    // Examination Module
    { slug: 'exam:read', name: 'View Exam Modules', module: 'exam', action: 'read' },
    { slug: 'exam:submit', name: 'Submit Exam Responses', module: 'exam', action: 'submit' },
    { slug: 'exam:manage', name: 'Manage Examinations', module: 'exam', action: 'manage' },

    // Audit Logs & Reports
    { slug: 'audit_logs:read', name: 'View Audit Logs', module: 'audit_logs', action: 'read' },
    { slug: 'reports:read', name: 'View Analytics & Reports', module: 'reports', action: 'read' },
    { slug: 'reports:export', name: 'Export Reports', module: 'reports', action: 'export' },
  ];

  // Insert permissions
  const permissionsToInsert = permissionDefinitions.map((perm) => ({
    id: uuidv4(),
    slug: perm.slug,
    name: perm.name,
    module: perm.module,
    action: perm.action,
    description: perm.name,
  }));

  await knex('permissions').insert(permissionsToInsert);

  // Map slug -> id
  const permMap = new Map();
  permissionsToInsert.forEach((p) => {
    permMap.set(p.slug, p.id);
  });

  // Helper to resolve slugs to ids
  const getPermIds = (slugs) => slugs.map((slug) => permMap.get(slug)).filter(Boolean);

  // Define Roles with their allowed permissions
  const rolesDefinitions = [
    {
      name: 'Master Administrator',
      slug: 'MASTER_ADMIN',
      description: 'Super user with unrestricted access across the entire multi-tenant CRM.',
      permissions: ['*:*'],
      permissionSlugs: permissionsToInsert.map((p) => p.slug),
    },
    {
      name: 'Organization Administrator',
      slug: 'ORGANIZATION_ADMIN',
      display_name: 'Organization Admin',
      description: 'Tenant Organization Administrator managing organization vendors, users, campaigns, and operations.',
      permissions: [
        'organizations:read',
        'clients:read',
        'clients:write',
        'vendors:read',
        'vendors:write',
        'projects:read',
        'projects:write',
        'projects:assign',
        'users:read',
        'users:write',
        'roles:read',
        'questionnaires:read',
        'questionnaires:write',
        'questionnaires:publish',
        'submissions:read',
        'submissions:create',
        'submissions:update',
        'submissions:export',
        'capi_audit:read',
        'capi_audit:perform',
        'capi_audit:review',
        'super_audit:read',
        'super_audit:perform',
        'super_audit:review',
        'tvc:read',
        'tvc:dial',
        'tvc:manage',
        'fa:read',
        'fa:dial',
        'fa:manage',
        'exam:read',
        'exam:submit',
        'exam:manage',
        'audit_logs:read',
        'reports:read',
        'reports:export',
      ],
      permissionSlugs: [
        'organizations:read',
        'clients:read',
        'clients:write',
        'vendors:read',
        'vendors:write',
        'projects:read',
        'projects:write',
        'projects:assign',
        'users:read',
        'users:write',
        'roles:read',
        'questionnaires:read',
        'questionnaires:write',
        'questionnaires:publish',
        'submissions:read',
        'submissions:create',
        'submissions:update',
        'submissions:export',
        'capi_audit:read',
        'capi_audit:perform',
        'capi_audit:review',
        'super_audit:read',
        'super_audit:perform',
        'super_audit:review',
        'tvc:read',
        'tvc:dial',
        'tvc:manage',
        'fa:read',
        'fa:dial',
        'fa:manage',
        'exam:read',
        'exam:submit',
        'exam:manage',
        'audit_logs:read',
        'reports:read',
        'reports:export',
      ],
    },
    {
      name: 'Client Administrator',
      slug: 'CLIENT_ADMIN',
      description: 'Organization/Client administrator managing projects, questionnaires, and reports.',
      permissions: [
        'clients:read',
        'vendors:read',
        'projects:read',
        'projects:write',
        'projects:assign',
        'questionnaires:read',
        'questionnaires:write',
        'questionnaires:publish',
        'submissions:read',
        'submissions:export',
        'capi_audit:read',
        'super_audit:read',
        'tvc:read',
        'fa:read',
        'reports:read',
        'reports:export',
        'audit_logs:read',
      ],
      permissionSlugs: [
        'clients:read',
        'vendors:read',
        'projects:read',
        'projects:write',
        'projects:assign',
        'questionnaires:read',
        'questionnaires:write',
        'questionnaires:publish',
        'submissions:read',
        'submissions:export',
        'capi_audit:read',
        'super_audit:read',
        'tvc:read',
        'fa:read',
        'reports:read',
        'reports:export',
        'audit_logs:read',
      ],
    },
    {
      name: 'Vendor Administrator',
      slug: 'VENDOR_ADMIN',
      description: 'Vendor organization administrator managing assigned projects, enumerators, and submissions.',
      permissions: [
        'vendors:read',
        'projects:read',
        'users:read',
        'users:write',
        'questionnaires:read',
        'submissions:read',
        'submissions:create',
        'submissions:update',
        'tvc:read',
        'reports:read',
      ],
      permissionSlugs: [
        'vendors:read',
        'projects:read',
        'users:read',
        'users:write',
        'questionnaires:read',
        'submissions:read',
        'submissions:create',
        'submissions:update',
        'tvc:read',
        'reports:read',
      ],
    },
    {
      name: 'Project Manager',
      slug: 'PROJECT_MANAGER',
      description: 'Manages operations, daily surveys, QA pipelines, and agent assignments.',
      permissions: [
        'projects:read',
        'questionnaires:read',
        'submissions:read',
        'submissions:export',
        'capi_audit:read',
        'capi_audit:review',
        'super_audit:read',
        'super_audit:review',
        'tvc:read',
        'tvc:manage',
        'fa:read',
        'fa:manage',
        'reports:read',
      ],
      permissionSlugs: [
        'projects:read',
        'questionnaires:read',
        'submissions:read',
        'submissions:export',
        'capi_audit:read',
        'capi_audit:review',
        'super_audit:read',
        'super_audit:review',
        'tvc:read',
        'tvc:manage',
        'fa:read',
        'fa:manage',
        'reports:read',
      ],
    },
    {
      name: 'CATI Agent',
      slug: 'CATI_AGENT',
      description: 'Computer Assisted Telephone Interviewing field enumerator.',
      permissions: [
        'projects:read',
        'questionnaires:read',
        'submissions:read',
        'submissions:create',
        'submissions:update',
      ],
      permissionSlugs: [
        'projects:read',
        'questionnaires:read',
        'submissions:read',
        'submissions:create',
        'submissions:update',
      ],
    },
    {
      name: 'CAPI Auditor',
      slug: 'CAPI_AUDITOR',
      description: 'Quality audit operator verifying CATI/CAPI field surveys and audio recordings.',
      permissions: [
        'projects:read',
        'questionnaires:read',
        'submissions:read',
        'capi_audit:read',
        'capi_audit:perform',
      ],
      permissionSlugs: [
        'projects:read',
        'questionnaires:read',
        'submissions:read',
        'capi_audit:read',
        'capi_audit:perform',
      ],
    },
    {
      name: 'Super Auditor',
      slug: 'SUPER_AUDITOR',
      description: 'Senior audit specialist auditing CAPI flags, escalations, and spot-checks.',
      permissions: [
        'projects:read',
        'questionnaires:read',
        'submissions:read',
        'capi_audit:read',
        'super_audit:read',
        'super_audit:perform',
      ],
      permissionSlugs: [
        'projects:read',
        'questionnaires:read',
        'submissions:read',
        'capi_audit:read',
        'super_audit:read',
        'super_audit:perform',
      ],
    },
    {
      name: 'TVC Agent',
      slug: 'TVC_AGENT',
      description: 'Telephonic Verification Calling agent dialing respondent leads.',
      permissions: [
        'projects:read',
        'submissions:read',
        'tvc:read',
        'tvc:dial',
      ],
      permissionSlugs: [
        'projects:read',
        'submissions:read',
        'tvc:read',
        'tvc:dial',
      ],
    },
    {
      name: 'Feedback Agent (FA)',
      slug: 'FA_AGENT',
      description: 'Field Audit and feedback follow-up calling representative.',
      permissions: [
        'projects:read',
        'submissions:read',
        'fa:read',
        'fa:dial',
      ],
      permissionSlugs: [
        'projects:read',
        'submissions:read',
        'fa:read',
        'fa:dial',
      ],
    },
    {
      name: 'Examination Agent',
      slug: 'EXAM_AGENT',
      description: 'Candidate or trainee taking testing modules.',
      permissions: [
        'exam:read',
        'exam:submit',
      ],
      permissionSlugs: [
        'exam:read',
        'exam:submit',
      ],
    },
    {
      name: 'Viewer',
      slug: 'VIEWER',
      description: 'Read-only observer access to dashboards and reports.',
      permissions: [
        'projects:read',
        'submissions:read',
        'reports:read',
      ],
      permissionSlugs: [
        'projects:read',
        'submissions:read',
        'reports:read',
      ],
    },
  ];

  // Insert roles and role_permissions
  for (const roleDef of rolesDefinitions) {
    const roleId = uuidv4();
    await knex('roles').insert({
      id: roleId,
      name: roleDef.name,
      slug: roleDef.slug,
      description: roleDef.description,
      is_system: true,
      permissions: JSON.stringify(roleDef.permissions),
      created_at: new Date(),
      updated_at: new Date(),
    });

    const permIds = getPermIds(roleDef.permissionSlugs);
    if (permIds.length > 0) {
      const rolePermRows = permIds.map((pId) => ({
        role_id: roleId,
        permission_id: pId,
      }));
      await knex('role_permissions').insert(rolePermRows);
    }
  }
};
