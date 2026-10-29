/**
 * @file 20261026190000_add_client_db_count_and_vendor_assignment_to_projects.js
 * @description Adds client_db_count, sync_status, last_synced_at, distribution_method,
 * and assigned_single_vendor_id columns to projects table for live Client DB tracking
 * and Single vs Equal vendor lead distribution.
 */

const addColumnIfNotExists = async (knex, tableName, columnName, columnCallback) => {
  const hasCol = await knex.schema.hasColumn(tableName, columnName);
  if (!hasCol) {
    await knex.schema.alterTable(tableName, (table) => {
      columnCallback(table);
    });
  }
};

exports.up = async function (knex) {
  const hasProjectsTable = await knex.schema.hasTable('projects');
  if (!hasProjectsTable) return;

  await addColumnIfNotExists(knex, 'projects', 'client_db_count', (table) => {
    table.integer('client_db_count').nullable().defaultTo(0);
  });

  await addColumnIfNotExists(knex, 'projects', 'sync_status', (table) => {
    table.string('sync_status', 50).nullable().defaultTo('IDLE');
  });

  await addColumnIfNotExists(knex, 'projects', 'last_synced_at', (table) => {
    table.timestamp('last_synced_at', { useTz: true }).nullable();
  });

  await addColumnIfNotExists(knex, 'projects', 'distribution_method', (table) => {
    table.string('distribution_method', 50).nullable().defaultTo('EQUAL');
  });

  await addColumnIfNotExists(knex, 'projects', 'assigned_single_vendor_id', (table) => {
    table.uuid('assigned_single_vendor_id').nullable();
  });
};

exports.down = async function (knex) {
  const hasProjectsTable = await knex.schema.hasTable('projects');
  if (!hasProjectsTable) return;

  const dropColumnIfExists = async (col) => {
    const hasCol = await knex.schema.hasColumn('projects', col);
    if (hasCol) {
      await knex.schema.alterTable('projects', (table) => {
        table.dropColumn(col);
      });
    }
  };

  await dropColumnIfExists('client_db_count');
  await dropColumnIfExists('sync_status');
  await dropColumnIfExists('last_synced_at');
  await dropColumnIfExists('distribution_method');
  await dropColumnIfExists('assigned_single_vendor_id');
};
