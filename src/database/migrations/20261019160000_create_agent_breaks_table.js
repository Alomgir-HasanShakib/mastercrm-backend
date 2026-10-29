/**
 * @file 20261019160000_create_agent_breaks_table.js
 * @description Creates agent_breaks table for tracking operational user breaks,
 * lockouts, and live productivity duration.
 */

exports.up = async function (knex) {
  const hasTable = await knex.schema.hasTable('agent_breaks');
  if (!hasTable) {
    await knex.schema.createTable('agent_breaks', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
      table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.uuid('organization_id').nullable().references('id').inTable('organizations').onDelete('SET NULL');
      table.string('break_type', 64).notNullable();
      table.string('break_type_label', 128).nullable();
      table.timestamp('start_time', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('end_time', { useTz: true }).nullable();
      table.integer('duration_seconds').notNullable().defaultTo(0);
      table.integer('duration_minutes').notNullable().defaultTo(0);
      table.string('status', 32).notNullable().defaultTo('ACTIVE'); // ACTIVE, COMPLETED, CANCELLED
      table.jsonb('metadata').nullable();
      table.timestamps(true, true);

      table.index(['user_id', 'status']);
      table.index(['start_time']);
    });
  }
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('agent_breaks');
};
