/**
 * @file 012_create_rule_definitions.js
 * @description Knex migration to create rule_definitions table for the rules-engine module.
 */

/**
 * Run migrations.
 *
 * @param {import('knex').Knex} knex
 * @returns {Promise<void>}
 */
exports.up = async function (knex) {
  await knex.schema.createTable('rule_definitions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('project_id').notNullable().references('id').inTable('projects').onDelete('CASCADE');
    table.string('module', 50).notNullable();
    table.string('scope', 50).notNullable(); // QUESTION, SECTION, SUBMISSION, ROUTING
    table.string('rule_code', 100).notNullable();
    table.jsonb('condition_ast').notNullable().defaultTo('{}');
    table.jsonb('actions').notNullable().defaultTo('[]');
    table.integer('priority').notNullable().defaultTo(0);
    table.boolean('is_enabled').notNullable().defaultTo(true);
    table.date('effective_from').nullable();
    table.date('effective_to').nullable();
    table.uuid('created_by').nullable().references('id').inTable('users').onDelete('SET NULL');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.unique(['project_id', 'rule_code']);
    table.index(['project_id', 'module', 'is_enabled']);
    table.index(['project_id']);
    table.index(['scope']);
  });
};

/**
 * Rollback migrations.
 *
 * @param {import('knex').Knex} knex
 * @returns {Promise<void>}
 */
exports.down = function (knex) {
  return knex.schema.dropTableIfExists('rule_definitions');
};
