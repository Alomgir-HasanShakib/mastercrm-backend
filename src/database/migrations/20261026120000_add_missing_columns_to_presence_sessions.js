/**
 * @file 20261026120000_add_missing_columns_to_presence_sessions.js
 * @description Migration ensuring presence_sessions table has metadata, role, connected_at,
 * organization_id, and disconnect_reason columns for live agent radar and GPS telemetry.
 */

exports.up = async function (knex) {
  const hasTable = await knex.schema.hasTable('presence_sessions');
  if (!hasTable) {
    await knex.schema.createTable('presence_sessions', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
      table.uuid('user_id').nullable().references('id').inTable('users').onDelete('CASCADE');
      table.string('socket_id', 255).nullable();
      table.string('state', 50).defaultTo('ACTIVE');
      table.string('channel', 100).nullable();
      table.string('role', 64).nullable();
      table.uuid('vendor_id').nullable().references('id').inTable('vendors').onDelete('SET NULL');
      table.uuid('project_id').nullable().references('id').inTable('projects').onDelete('SET NULL');
      table.uuid('organization_id').nullable().references('id').inTable('organizations').onDelete('CASCADE');
      table.timestamp('connected_at', { useTz: true }).defaultTo(knex.fn.now());
      table.timestamp('last_heartbeat_at', { useTz: true }).defaultTo(knex.fn.now());
      table.timestamp('disconnected_at', { useTz: true }).nullable();
      table.text('disconnect_reason').nullable();
      table.jsonb('metadata').defaultTo('{}');
      table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());

      table.index(['user_id']);
      table.index(['last_heartbeat_at']);
      table.index(['disconnected_at']);
    });
  } else {
    // Add columns if they do not exist
    const hasRole = await knex.schema.hasColumn('presence_sessions', 'role');
    const hasConnectedAt = await knex.schema.hasColumn('presence_sessions', 'connected_at');
    const hasOrgId = await knex.schema.hasColumn('presence_sessions', 'organization_id');
    const hasDisconnectReason = await knex.schema.hasColumn('presence_sessions', 'disconnect_reason');
    const hasMetadata = await knex.schema.hasColumn('presence_sessions', 'metadata');

    await knex.schema.alterTable('presence_sessions', (table) => {
      if (!hasRole) table.string('role', 64).nullable();
      if (!hasConnectedAt) table.timestamp('connected_at', { useTz: true }).defaultTo(knex.fn.now());
      if (!hasOrgId) table.uuid('organization_id').nullable().references('id').inTable('organizations').onDelete('CASCADE');
      if (!hasDisconnectReason) table.text('disconnect_reason').nullable();
      if (!hasMetadata) table.jsonb('metadata').defaultTo('{}');
    });
  }
};

exports.down = async function (knex) {
  const hasTable = await knex.schema.hasTable('presence_sessions');
  if (hasTable) {
    const hasRole = await knex.schema.hasColumn('presence_sessions', 'role');
    const hasConnectedAt = await knex.schema.hasColumn('presence_sessions', 'connected_at');
    const hasOrgId = await knex.schema.hasColumn('presence_sessions', 'organization_id');
    const hasDisconnectReason = await knex.schema.hasColumn('presence_sessions', 'disconnect_reason');
    const hasMetadata = await knex.schema.hasColumn('presence_sessions', 'metadata');

    await knex.schema.alterTable('presence_sessions', (table) => {
      if (hasRole) table.dropColumn('role');
      if (hasConnectedAt) table.dropColumn('connected_at');
      if (hasOrgId) table.dropColumn('organization_id');
      if (hasDisconnectReason) table.dropColumn('disconnect_reason');
      if (hasMetadata) table.dropColumn('metadata');
    });
  }
};
