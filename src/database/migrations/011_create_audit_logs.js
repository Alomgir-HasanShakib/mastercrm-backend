/**
 * @file 011_create_audit_logs.js
 * @description Knex migration to create immutable audit_logs table with composite indexes.
 */

/**
 * Run migrations.
 *
 * @param {import('knex').Knex} knex
 * @returns {Promise<void>}
 */
exports.up = function (knex) {
  return knex.schema.createTable('audit_logs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('organization_id').nullable().references('id').inTable('organizations').onDelete('CASCADE');
    table.uuid('user_id').nullable().references('id').inTable('users').onDelete('SET NULL');
    table.string('action', 100).notNullable();
    table.string('entity_type', 100).notNullable();
    table.string('entity_id', 100).notNullable();
    table.string('module', 100).notNullable();
    table.jsonb('old_values').nullable();
    table.jsonb('new_values').nullable();
    table.string('ip_address', 50).nullable();
    table.text('user_agent').nullable();
    table.jsonb('metadata').defaultTo('{}');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    // Indexes requested:
    // (organization_id, entity_type, entity_id), (user_id, created_at), (module, action, created_at)
    table.index(['organization_id', 'entity_type', 'entity_id']);
    table.index(['user_id', 'created_at']);
    table.index(['module', 'action', 'created_at']);
  });
};

/**
 * Rollback migrations.
 *
 * @param {import('knex').Knex} knex
 * @returns {Promise<void>}
 */
exports.down = function (knex) {
  return knex.schema.dropTableIfExists('audit_logs');
};
