/**
 * @file 20261019140000_add_client_table_name_to_projects.js
 * @description Add client_table_name column to projects table for per-campaign client DB table mapping.
 */

exports.up = async function (knex) {
  const hasCol = await knex.schema.hasColumn('projects', 'client_table_name');
  if (!hasCol) {
    await knex.schema.alterTable('projects', (table) => {
      table.string('client_table_name', 128).nullable().defaultTo('as_audit_input_ac_r3_sup');
    });
  }
};

exports.down = async function (knex) {
  const hasCol = await knex.schema.hasColumn('projects', 'client_table_name');
  if (hasCol) {
    await knex.schema.alterTable('projects', (table) => {
      table.dropColumn('client_table_name');
    });
  }
};
