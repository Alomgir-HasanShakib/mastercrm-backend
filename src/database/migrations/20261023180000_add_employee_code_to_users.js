/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
  const hasCol = await knex.schema.hasColumn('users', 'employee_code');
  if (!hasCol) {
    await knex.schema.table('users', (table) => {
      table.string('employee_code', 100).nullable();
    });
  }
  await knex.raw("UPDATE users SET employee_code = user_code WHERE employee_code IS NULL AND user_code IS NOT NULL;");
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function (knex) {
  const hasCol = await knex.schema.hasColumn('users', 'employee_code');
  if (hasCol) {
    await knex.schema.table('users', (table) => {
      table.dropColumn('employee_code');
    });
  }
};
