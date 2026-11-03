/**
 * @file 20261103000000_create_error_logs_table.js
 * @description Migration to create error_logs table for centralized system error telemetry.
 */

exports.up = async function(knex) {
  const exists = await knex.schema.hasTable('error_logs');
  if (!exists) {
    await knex.schema.createTable('error_logs', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.string('correlation_id').nullable();
      table.uuid('organization_id').nullable();
      table.uuid('user_id').nullable();
      table.string('user_email').nullable();
      table.string('user_role').nullable();
      table.string('source', 32).defaultTo('BACKEND');
      table.string('path', 1024).notNullable();
      table.string('method', 16).defaultTo('GET');
      table.integer('status_code').defaultTo(500);
      table.string('error_code', 128).defaultTo('ERROR');
      table.text('message').notNullable();
      table.text('stack').nullable();
      table.text('details').nullable();
      table.string('ip_address', 64).nullable();
      table.text('user_agent').nullable();
      table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());

      table.index(['created_at']);
      table.index(['status_code']);
      table.index(['source']);
      table.index(['error_code']);
      table.index(['organization_id']);
    });
  }
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('error_logs');
};
