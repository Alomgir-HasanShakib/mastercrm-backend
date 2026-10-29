/**
 * @file 20261026180000_add_enabled_modules_to_organizations.js
 * @description Knex migration to add enabled_modules column to organizations table.
 */

exports.up = async function (knex) {
  const hasCol = await knex.schema.hasColumn('organizations', 'enabled_modules');
  if (!hasCol) {
    await knex.schema.alterTable('organizations', (table) => {
      table.jsonb('enabled_modules').notNullable().defaultTo('["CAPI", "CATI", "TVC", "FA", "SUPER_AUDIT"]');
    });
  }

  // Ensure any existing rows have enabled_modules populated
  try {
    await knex.raw(`
      UPDATE organizations
      SET enabled_modules = '["CAPI", "CATI", "TVC", "FA", "SUPER_AUDIT"]'::jsonb
      WHERE enabled_modules IS NULL;
    `);
  } catch (_) {
    // Non-blocking in SQLite / fallback DBs
  }
};

exports.down = async function (knex) {
  const hasCol = await knex.schema.hasColumn('organizations', 'enabled_modules');
  if (hasCol) {
    await knex.schema.alterTable('organizations', (table) => {
      table.dropColumn('enabled_modules');
    });
  }
};
