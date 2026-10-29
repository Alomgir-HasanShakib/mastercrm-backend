/**
 * @file 20261024120000_create_system_settings_telephony.js
 * @description Migration to create system_settings table for platform-wide configuration storage.
 */

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function up(knex) {
  const hasTable = await knex.schema.hasTable('system_settings');
  if (!hasTable) {
    await knex.schema.createTable('system_settings', (t) => {
      t.string('id', 100).primary(); // e.g. 'telephony', 'general', 'security'
      t.jsonb('value').notNullable().defaultTo('{}');
      t.uuid('updated_by').nullable();
      t.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
    });
  }
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('system_settings');
};
