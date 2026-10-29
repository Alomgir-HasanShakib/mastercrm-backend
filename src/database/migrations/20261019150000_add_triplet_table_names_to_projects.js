/**
 * @file 20261019150000_add_triplet_table_names_to_projects.js
 * @description Add output1_table_name and output2_table_name columns to projects table
 * so each campaign can configure completely separate, independent custom table names for all 3 tables.
 */

exports.up = async function (knex) {
  const hasOut1 = await knex.schema.hasColumn('projects', 'output1_table_name');
  if (!hasOut1) {
    await knex.schema.alterTable('projects', (table) => {
      table.string('output1_table_name', 128).nullable().defaultTo('as_audit_output_ac_r3_1_sup');
    });
  }

  const hasOut2 = await knex.schema.hasColumn('projects', 'output2_table_name');
  if (!hasOut2) {
    await knex.schema.alterTable('projects', (table) => {
      table.string('output2_table_name', 128).nullable().defaultTo('as_audit_output_ac_r3_2_sup');
    });
  }
};

exports.down = async function (knex) {
  const hasOut1 = await knex.schema.hasColumn('projects', 'output1_table_name');
  if (hasOut1) {
    await knex.schema.alterTable('projects', (table) => {
      table.dropColumn('output1_table_name');
    });
  }

  const hasOut2 = await knex.schema.hasColumn('projects', 'output2_table_name');
  if (hasOut2) {
    await knex.schema.alterTable('projects', (table) => {
      table.dropColumn('output2_table_name');
    });
  }
};
