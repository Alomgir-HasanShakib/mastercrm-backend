/**
 * @file 008_create_submissions.js
 * @description Knex migration to create submissions and submission_responses tables.
 */

/**
 * Run migrations.
 *
 * @param {import('knex').Knex} knex
 * @returns {Promise<void>}
 */
exports.up = async function (knex) {
  // Submissions table
  await knex.schema.createTable('submissions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('submission_id', 100).notNullable().unique();
    table.uuid('project_id').notNullable().references('id').inTable('projects').onDelete('CASCADE');
    table.uuid('vendor_id').nullable().references('id').inTable('vendors').onDelete('SET NULL');
    table.string('state_id', 50).nullable();
    table.enu('source_channel', ['FIELD_CATI', 'REMOTE_CATI', 'IMPORT'], {
      useNative: true,
      enumName: 'submission_source_channel_enum',
    }).notNullable().defaultTo('REMOTE_CATI');
    table.uuid('source_agent_id').nullable().references('id').inTable('users').onDelete('SET NULL');
    table.string('source_device_id', 100).nullable();
    table.string('source_call_id', 100).nullable();
    table.uuid('questionnaire_version_id').nullable().references('id').inTable('questionnaire_versions').onDelete('SET NULL');
    table.string('respondent_name', 255).nullable();
    table.string('respondent_phone', 50).nullable();
    table.jsonb('respondent_metadata').defaultTo('{}');
    table.jsonb('geography_data').defaultTo('{}');
    table.enu('source_status', ['STARTED', 'SUBMITTED', 'COMPLETED', 'INCOMPLETE', 'INVALID', 'SYNC_PENDING'], {
      useNative: true,
      enumName: 'submission_source_status_enum',
    }).notNullable().defaultTo('SUBMITTED');
    table.enu('capi_status', ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'PASSED', 'NOT_REQUIRED'], {
      useNative: true,
      enumName: 'submission_capi_status_enum',
    }).notNullable().defaultTo('PENDING');
    table.string('super_audit_status', 50).nullable().defaultTo('PENDING');
    table.string('tvc_status', 50).nullable().defaultTo('PENDING');
    table.string('fa_status', 50).nullable().defaultTo('PENDING');
    table.integer('priority').notNullable().defaultTo(50);
    table.decimal('risk_score', 5, 2).nullable().defaultTo(0.00);
    table.jsonb('labels').notNullable().defaultTo('[]');
    table.timestamp('started_at', { useTz: true }).nullable();
    table.timestamp('completed_at', { useTz: true }).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(['project_id']);
    table.index(['vendor_id']);
    table.index(['submission_id']);
    table.index(['source_agent_id']);
    table.index(['source_status']);
    table.index(['capi_status']);
    table.index(['priority']);
    table.index(['created_at']);
  });

  // Submission Responses table
  await knex.schema.createTable('submission_responses', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('submission_id').notNullable().references('id').inTable('submissions').onDelete('CASCADE');
    table.uuid('question_id').nullable().references('id').inTable('questions').onDelete('SET NULL');
    table.string('question_tag', 100).notNullable();
    table.text('response_value').nullable();
    table.jsonb('response_metadata').defaultTo('{}');
    table.timestamp('answered_at', { useTz: true }).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(['submission_id']);
    table.index(['question_id']);
    table.index(['question_tag']);
  });
};

/**
 * Rollback migrations.
 *
 * @param {import('knex').Knex} knex
 * @returns {Promise<void>}
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('submission_responses');
  await knex.schema.dropTableIfExists('submissions');
  await knex.raw('DROP TYPE IF EXISTS submission_capi_status_enum CASCADE;');
  await knex.raw('DROP TYPE IF EXISTS submission_source_status_enum CASCADE;');
  await knex.raw('DROP TYPE IF EXISTS submission_source_channel_enum CASCADE;');
};
