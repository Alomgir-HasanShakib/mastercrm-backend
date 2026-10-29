/**
 * @file 20261023150000_add_deleted_at_to_users.js
 * @description Adds soft-delete column deleted_at to users table if not already present.
 */

exports.up = async function (knex) {
  const hasColumn = await knex.schema.hasColumn('users', 'deleted_at');
  if (!hasColumn) {
    await knex.schema.alterTable('users', (table) => {
      table.timestamp('deleted_at', { useTz: true }).nullable();
    });
  }
};

exports.down = async function (knex) {
  const hasColumn = await knex.schema.hasColumn('users', 'deleted_at');
  if (hasColumn) {
    await knex.schema.alterTable('users', (table) => {
      table.dropColumn('deleted_at');
    });
  }
};
