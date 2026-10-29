/**
 * @file 20261023170000_add_organization_admin_role.js
 * @description Adds the dedicated 'Organization Administrator' (slug: ORGANIZATION_ADMIN) role to the roles table.
 */

const { v4: uuidv4 } = require('uuid');

exports.up = async function (knex) {
  const existingRole = await knex('roles').where('slug', 'ORGANIZATION_ADMIN').first();
  const orgPermissions = [
    'tenancy:*',
    'organizations:read',
    'clients:*',
    'vendors:*',
    'projects:*',
    'users:*',
    'questionnaires:*',
    'submissions:*',
    'capi:*',
    'super_audit:*',
    'tvc:*',
    'fa:*',
    'reports:*',
    'audit_logs:read',
  ];

  if (!existingRole) {
    await knex('roles').insert({
      id: uuidv4(),
      name: 'Organization Administrator',
      slug: 'ORGANIZATION_ADMIN',
      description: 'Tenant Organization Administrator managing organization vendors, users, campaigns, and operations.',
      is_system: true,
      permissions: JSON.stringify(orgPermissions),
      created_at: new Date(),
      updated_at: new Date(),
    });
  } else {
    await knex('roles')
      .where('id', existingRole.id)
      .update({
        permissions: JSON.stringify(orgPermissions),
        updated_at: new Date(),
      });
  }
};

exports.down = async function (knex) {
  await knex('roles').where('slug', 'ORGANIZATION_ADMIN').andWhere('is_system', true).del();
};
