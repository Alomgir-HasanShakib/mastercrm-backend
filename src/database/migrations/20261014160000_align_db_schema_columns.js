/**
 * @file 20261014160000_align_db_schema_columns.js
 * @description Migration to ensure all operational columns and tables exist in PostgreSQL database with safe checks.
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
  // 1. refresh_tokens table: add updated_at
  await addColumnIfNotExists(knex, 'refresh_tokens', 'updated_at', (table) => {
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  // 2. audit_logs table: add details, resource, resource_id
  await addColumnIfNotExists(knex, 'audit_logs', 'details', (table) => {
    table.jsonb('details').defaultTo('{}');
  });
  await addColumnIfNotExists(knex, 'audit_logs', 'resource', (table) => {
    table.string('resource', 100).nullable();
  });
  await addColumnIfNotExists(knex, 'audit_logs', 'resource_id', (table) => {
    table.string('resource_id', 100).nullable();
  });

  // 3. vendors table
  await addColumnIfNotExists(knex, 'vendors', 'contact_person', (table) => {
    table.string('contact_person', 150).nullable();
  });
  await addColumnIfNotExists(knex, 'vendors', 'email', (table) => {
    table.string('email', 255).nullable();
  });
  await addColumnIfNotExists(knex, 'vendors', 'phone', (table) => {
    table.string('phone', 50).nullable();
  });
  await addColumnIfNotExists(knex, 'vendors', 'status', (table) => {
    table.string('status', 50).defaultTo('ACTIVE');
  });
  await addColumnIfNotExists(knex, 'vendors', 'enable_ai_audit', (table) => {
    table.boolean('enable_ai_audit').defaultTo(true);
  });

  // 4. clients table
  await addColumnIfNotExists(knex, 'clients', 'address', (table) => {
    table.text('address').nullable();
  });
  await addColumnIfNotExists(knex, 'clients', 'email', (table) => {
    table.string('email', 255).nullable();
  });
  await addColumnIfNotExists(knex, 'clients', 'phone', (table) => {
    table.string('phone', 50).nullable();
  });
  await addColumnIfNotExists(knex, 'clients', 'status', (table) => {
    table.string('status', 50).defaultTo('ACTIVE');
  });

  // 5. projects table
  await addColumnIfNotExists(knex, 'projects', 'code', (table) => {
    table.string('code', 100).nullable();
  });
  await addColumnIfNotExists(knex, 'projects', 'type', (table) => {
    table.string('type', 50).defaultTo('SURVEY');
  });
  await addColumnIfNotExists(knex, 'projects', 'config', (table) => {
    table.jsonb('config').defaultTo('{}');
  });
  await addColumnIfNotExists(knex, 'projects', 'organization_id', (table) => {
    table.uuid('organization_id').nullable().references('id').inTable('organizations').onDelete('CASCADE');
  });

  // 6. presence_sessions table
  const hasPresence = await knex.schema.hasTable('presence_sessions');
  if (!hasPresence) {
    await knex.schema.createTable('presence_sessions', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
      table.uuid('user_id').nullable().references('id').inTable('users').onDelete('CASCADE');
      table.string('socket_id', 255).nullable();
      table.string('state', 50).defaultTo('online');
      table.string('channel', 100).nullable();
      table.uuid('vendor_id').nullable().references('id').inTable('vendors').onDelete('SET NULL');
      table.uuid('project_id').nullable().references('id').inTable('projects').onDelete('SET NULL');
      table.timestamp('disconnected_at', { useTz: true }).nullable();
      table.timestamp('last_heartbeat_at', { useTz: true }).defaultTo(knex.fn.now());
      table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());

      table.index(['user_id']);
      table.index(['last_heartbeat_at']);
      table.index(['disconnected_at']);
    });
  }
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('presence_sessions');
};
