/**
 * @file 002_default_admin.js
 * @description Knex seed script to insert default root organization and super-admin user.
 */

const { hashPassword } = require('../../utils/crypto');

/**
 * Seed database with master organization and master administrator.
 *
 * @param {import('knex').Knex} knex
 * @returns {Promise<void>}
 */
exports.seed = async function (knex) {
  // 1. Ensure master organization exists
  let masterOrg = await knex('organizations').where('slug', 'master-crm').first();
  if (!masterOrg) {
    const [insertedOrg] = await knex('organizations')
      .insert({
        name: 'Master CRM Global Corp',
        slug: 'master-crm',
        is_active: true,
        max_users: 100,
        enable_ai_audit: true,
        settings: JSON.stringify({ isRoot: true }),
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning('*');
    masterOrg = insertedOrg;
  }

  // 2. Find MASTER_ADMIN role
  const masterRole = await knex('roles').where('slug', 'MASTER_ADMIN').first();

  // 3. Ensure master admin user exists
  const existingAdmin = await knex('users').where('email', 'admin@mastercrm.com').first();
  const passwordHash = await hashPassword('Password123!');

  if (!existingAdmin) {
    await knex('users').insert({
      organization_id: masterOrg.id,
      email: 'admin@mastercrm.com',
      password_hash: passwordHash,
      first_name: 'Master',
      last_name: 'Admin',
      phone: '+18001234567',
      role_id: masterRole ? masterRole.id : null,
      vendor_id: null,
      status: 'ACTIVE',
      created_at: new Date(),
      updated_at: new Date(),
    });
    console.log('Seeded Master Admin user: admin@mastercrm.com / Password123!');
  }
};
