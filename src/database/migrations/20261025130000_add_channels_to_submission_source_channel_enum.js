/**
 * @file 20261025130000_add_channels_to_submission_source_channel_enum.js
 * @description Extend submission_source_channel_enum to include FIELD_CAPI, CAPI, TVC, FA, SUPER_AUDIT
 */
exports.up = async function (knex) {
  const isPg = knex.client.config.client === 'pg' || knex.client.config.client === 'postgresql';
  if (isPg) {
    const values = ['FIELD_CAPI', 'CAPI', 'TVC', 'FA', 'SUPER_AUDIT'];
    for (const val of values) {
      await knex.raw(`ALTER TYPE submission_source_channel_enum ADD VALUE IF NOT EXISTS '${val}';`).catch(() => null);
    }
  }
};

exports.down = async function (knex) {
  // Postgres does not support removing values from an enum without recreating it
};
