/**
 * @file 006_create_users.js
 * @description Knex migration to create users, user_project_assignments, refresh_tokens, and devices tables.
 */

/**
 * Run migrations.
 *
 * @param {import('knex').Knex} knex
 * @returns {Promise<void>}
 */
exports.up = async function (knex) {
  // Users table
  await knex.schema.createTable('users', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('organization_id').nullable().references('id').inTable('organizations').onDelete('CASCADE');
    table.string('email', 255).notNullable().unique();
    table.string('password_hash', 255).notNullable();
    table.string('first_name', 100).notNullable();
    table.string('last_name', 100).nullable();
    table.string('phone', 50).nullable();
    table.uuid('role_id').nullable().references('id').inTable('roles').onDelete('SET NULL');
    table.uuid('vendor_id').nullable().references('id').inTable('vendors').onDelete('SET NULL');
    table.enu('status', ['ACTIVE', 'INACTIVE', 'SUSPENDED'], {
      useNative: true,
      enumName: 'user_status_enum',
    }).notNullable().defaultTo('ACTIVE');
    table.timestamp('last_login_at', { useTz: true }).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(['organization_id']);
    table.index(['vendor_id']);
    table.index(['role_id']);
    table.index(['status']);
    table.index(['email']);
  });

  // Link projects.created_by to users.id
  await knex.schema.alterTable('projects', (table) => {
    table.foreign('created_by').references('id').inTable('users').onDelete('SET NULL');
  });

  // User Project Assignments table
  await knex.schema.createTable('user_project_assignments', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.uuid('project_id').notNullable().references('id').inTable('projects').onDelete('CASCADE');
    table.jsonb('assigned_modules').defaultTo('[]');
    table.jsonb('assigned_states').defaultTo('[]');
    table.boolean('is_active').notNullable().defaultTo(true);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.unique(['user_id', 'project_id']);
    table.index(['user_id']);
    table.index(['project_id']);
    table.index(['is_active']);
  });

  // Refresh tokens table
  await knex.schema.createTable('refresh_tokens', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('token_hash', 255).notNullable().unique();
    table.timestamp('expires_at', { useTz: true }).notNullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(['user_id']);
    table.index(['token_hash']);
    table.index(['expires_at']);
  });

  // Devices table
  await knex.schema.createTable('devices', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('device_id', 255).notNullable();
    table.string('device_type', 50).nullable();
    table.jsonb('device_info').defaultTo('{}');
    table.boolean('is_trusted').notNullable().defaultTo(false);
    table.timestamp('last_seen_at', { useTz: true }).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.unique(['user_id', 'device_id']);
    table.index(['user_id']);
    table.index(['device_id']);
  });
};

/**
 * Rollback migrations.
 *
 * @param {import('knex').Knex} knex
 * @returns {Promise<void>}
 */
exports.down = async function (knex) {
  await knex.schema.alterTable('projects', (table) => {
    table.dropForeign(['created_by']);
  });
  await knex.schema.dropTableIfExists('devices');
  await knex.schema.dropTableIfExists('refresh_tokens');
  await knex.schema.dropTableIfExists('user_project_assignments');
  await knex.schema.dropTableIfExists('users');
  await knex.raw('DROP TYPE IF EXISTS user_status_enum CASCADE;');
};
