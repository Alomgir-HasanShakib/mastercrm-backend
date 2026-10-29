/**
 * @file 010_create_call_modules.js
 * @description Knex migration to create tvc_leads, tvc_attempts, feedback_leads, and feedback_attempts tables.
 */

/**
 * Run migrations.
 *
 * @param {import('knex').Knex} knex
 * @returns {Promise<void>}
 */
exports.up = async function (knex) {
  // 1. TVC Leads
  await knex.schema.createTable('tvc_leads', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('submission_id').notNullable().references('id').inTable('submissions').onDelete('CASCADE');
    table.uuid('project_id').notNullable().references('id').inTable('projects').onDelete('CASCADE');
    table.uuid('vendor_id').nullable().references('id').inTable('vendors').onDelete('SET NULL');
    table.uuid('assigned_agent_id').nullable().references('id').inTable('users').onDelete('SET NULL');
    table.string('phone_number', 50).notNullable();
    table.enu('call_mode', ['HUMAN', 'AI', 'HYBRID'], {
      useNative: true,
      enumName: 'call_mode_enum',
    }).notNullable().defaultTo('HUMAN');
    table.enu('status', [
      'PENDING',
      'ASSIGNED',
      'IN_PROGRESS',
      'COMPLETED',
      'CALLBACK',
      'NO_ANSWER',
      'BUSY',
      'FAILED',
    ], {
      useNative: true,
      enumName: 'tvc_lead_status_enum',
    }).notNullable().defaultTo('PENDING');
    table.integer('priority').notNullable().defaultTo(50);
    table.integer('max_attempts').notNullable().defaultTo(3);
    table.integer('attempt_count').notNullable().defaultTo(0);
    table.timestamp('callback_at', { useTz: true }).nullable();
    table.string('language_code', 20).nullable();
    table.jsonb('metadata').defaultTo('{}');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(['submission_id']);
    table.index(['project_id']);
    table.index(['vendor_id']);
    table.index(['assigned_agent_id']);
    table.index(['status']);
    table.index(['phone_number']);
  });

  // 2. TVC Attempts
  await knex.schema.createTable('tvc_attempts', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('tvc_lead_id').notNullable().references('id').inTable('tvc_leads').onDelete('CASCADE');
    table.uuid('submission_id').notNullable().references('id').inTable('submissions').onDelete('CASCADE');
    table.uuid('agent_id').nullable().references('id').inTable('users').onDelete('SET NULL');
    table.integer('attempt_number').notNullable().defaultTo(1);
    table.string('crm_call_id', 100).nullable();
    table.string('provider_call_id', 100).nullable();
    table.timestamp('dial_started_at', { useTz: true }).nullable();
    table.timestamp('ringing_at', { useTz: true }).nullable();
    table.timestamp('answered_at', { useTz: true }).nullable();
    table.timestamp('ended_at', { useTz: true }).nullable();
    table.integer('ring_duration_sec').nullable();
    table.integer('talk_duration_sec').nullable();
    table.integer('total_duration_sec').nullable();
    table.string('call_status', 50).nullable();
    table.string('hangup_reason', 100).nullable();
    table.string('disposition', 100).nullable();
    table.jsonb('verification_result').defaultTo('{}');
    table.text('recording_url').nullable();
    table.text('ai_transcript').nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(['tvc_lead_id']);
    table.index(['submission_id']);
    table.index(['agent_id']);
    table.index(['crm_call_id']);
  });

  // 3. Feedback Leads
  await knex.schema.createTable('feedback_leads', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('submission_id').notNullable().references('id').inTable('submissions').onDelete('CASCADE');
    table.uuid('project_id').notNullable().references('id').inTable('projects').onDelete('CASCADE');
    table.uuid('vendor_id').nullable().references('id').inTable('vendors').onDelete('SET NULL');
    table.uuid('field_agent_id').nullable().references('id').inTable('users').onDelete('SET NULL');
    table.uuid('assigned_caller_id').nullable().references('id').inTable('users').onDelete('SET NULL');
    table.string('phone_number', 50).notNullable();
    table.string('call_mode', 50).notNullable().defaultTo('HUMAN');
    table.string('status', 50).notNullable().defaultTo('PENDING');
    table.integer('priority').notNullable().defaultTo(50);
    table.jsonb('feedback_items').notNullable().defaultTo('[]');
    table.integer('max_attempts').notNullable().defaultTo(3);
    table.integer('attempt_count').notNullable().defaultTo(0);
    table.timestamp('callback_at', { useTz: true }).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(['submission_id']);
    table.index(['project_id']);
    table.index(['vendor_id']);
    table.index(['field_agent_id']);
    table.index(['assigned_caller_id']);
    table.index(['status']);
  });

  // 4. Feedback Attempts
  await knex.schema.createTable('feedback_attempts', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('feedback_lead_id').notNullable().references('id').inTable('feedback_leads').onDelete('CASCADE');
    table.uuid('submission_id').notNullable().references('id').inTable('submissions').onDelete('CASCADE');
    table.uuid('caller_id').nullable().references('id').inTable('users').onDelete('SET NULL');
    table.integer('attempt_number').notNullable().defaultTo(1);
    table.string('crm_call_id', 100).nullable();
    table.string('provider_call_id', 100).nullable();
    table.timestamp('dial_started_at', { useTz: true }).nullable();
    table.timestamp('answered_at', { useTz: true }).nullable();
    table.timestamp('ended_at', { useTz: true }).nullable();
    table.integer('talk_duration_sec').nullable();
    table.string('disposition', 100).nullable();
    table.jsonb('feedback_validations').defaultTo('{}');
    table.text('remarks').nullable();
    table.text('recording_url').nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(['feedback_lead_id']);
    table.index(['submission_id']);
    table.index(['caller_id']);
  });
};

/**
 * Rollback migrations.
 *
 * @param {import('knex').Knex} knex
 * @returns {Promise<void>}
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('feedback_attempts');
  await knex.schema.dropTableIfExists('feedback_leads');
  await knex.schema.dropTableIfExists('tvc_attempts');
  await knex.schema.dropTableIfExists('tvc_leads');
  await knex.raw('DROP TYPE IF EXISTS tvc_lead_status_enum CASCADE;');
  await knex.raw('DROP TYPE IF EXISTS call_mode_enum CASCADE;');
};
