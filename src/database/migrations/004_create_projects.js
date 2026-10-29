/**
 * @file 004_create_projects.js
 * @description Knex migration to create projects, project_vendor_assignments, and project_languages tables.
 */

/**
 * Run migrations.
 *
 * @param {import('knex').Knex} knex
 * @returns {Promise<void>}
 */
exports.up = async function (knex) {
  // Create projects table
  await knex.schema.createTable('projects', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('client_id').notNullable().references('id').inTable('clients').onDelete('RESTRICT');
    table.string('name', 255).notNullable();
    table.string('project_code', 100).notNullable().unique();
    table.text('description').nullable();
    table.jsonb('settings').defaultTo('{}');
    table.jsonb('enabled_modules').notNullable().defaultTo('["CATI","CAPI","SUPER_AUDIT","TVC","FA","EXAM"]');
    table.jsonb('states').defaultTo('[]');
    table.jsonb('languages').defaultTo('[]');
    table.date('start_date').nullable();
    table.date('end_date').nullable();
    table.enu('status', ['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED'], {
      useNative: true,
      enumName: 'project_status_enum',
    }).notNullable().defaultTo('DRAFT');
    // Foreign key to users will be added in migration 006_create_users
    table.uuid('created_by').nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(['client_id']);
    table.index(['project_code']);
    table.index(['status']);
  });

  // Create project_vendor_assignments table
  await knex.schema.createTable('project_vendor_assignments', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('project_id').notNullable().references('id').inTable('projects').onDelete('CASCADE');
    table.uuid('vendor_id').notNullable().references('id').inTable('vendors').onDelete('CASCADE');
    table.jsonb('allocated_states').defaultTo('[]');
    table.jsonb('allocated_modules').defaultTo('[]');
    table.jsonb('quota').defaultTo('{}');
    table.boolean('is_active').notNullable().defaultTo(true);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.unique(['project_id', 'vendor_id']);
    table.index(['project_id']);
    table.index(['vendor_id']);
    table.index(['is_active']);
  });

  // Create project_languages table
  await knex.schema.createTable('project_languages', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('project_id').notNullable().references('id').inTable('projects').onDelete('CASCADE');
    table.string('language_code', 20).notNullable();
    table.boolean('is_default').notNullable().defaultTo(false);
    table.boolean('is_active').notNullable().defaultTo(true);

    table.unique(['project_id', 'language_code']);
    table.index(['project_id']);
    table.index(['language_code']);
  });
};

/**
 * Rollback migrations.
 *
 * @param {import('knex').Knex} knex
 * @returns {Promise<void>}
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('project_languages');
  await knex.schema.dropTableIfExists('project_vendor_assignments');
  await knex.schema.dropTableIfExists('projects');
  await knex.raw('DROP TYPE IF EXISTS project_status_enum CASCADE;');
};
