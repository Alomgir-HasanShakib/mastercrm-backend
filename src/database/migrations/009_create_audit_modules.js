/**
 * @file 009_create_audit_modules.js
 * @description Knex migration to create capi_audits, capi_audit_items, super_audits, and super_audit_items tables.
 */

/**
 * Run migrations.
 *
 * @param {import('knex').Knex} knex
 * @returns {Promise<void>}
 */
exports.up = async function (knex) {
  // 1. CAPI Audits
  await knex.schema.createTable('capi_audits', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('submission_id').notNullable().references('id').inTable('submissions').onDelete('CASCADE');
    table.uuid('auditor_id').nullable().references('id').inTable('users').onDelete('SET NULL');
    table.uuid('questionnaire_version_id').nullable().references('id').inTable('questionnaire_versions').onDelete('SET NULL');
    table.enu('audit_mode', ['HUMAN', 'AI', 'HYBRID'], {
      useNative: true,
      enumName: 'audit_mode_enum',
    }).notNullable().defaultTo('HUMAN');
    table.enu('overall_status', ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'REVIEW_REQUIRED'], {
      useNative: true,
      enumName: 'audit_status_enum',
    }).notNullable().defaultTo('PENDING');
    table.enu('overall_result', ['PASSED', 'FAILED', 'REVIEW'], {
      useNative: true,
      enumName: 'audit_result_enum',
    }).nullable();
    table.decimal('score', 5, 2).nullable();
    table.text('remarks').nullable();
    table.jsonb('evidence').defaultTo('{}');
    table.timestamp('started_at', { useTz: true }).nullable();
    table.timestamp('completed_at', { useTz: true }).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(['submission_id']);
    table.index(['auditor_id']);
    table.index(['overall_status']);
    table.index(['overall_result']);
  });

  // 2. CAPI Audit Items
  await knex.schema.createTable('capi_audit_items', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('capi_audit_id').notNullable().references('id').inTable('capi_audits').onDelete('CASCADE');
    table.uuid('question_id').nullable().references('id').inTable('questions').onDelete('SET NULL');
    table.string('question_tag', 100).notNullable();
    table.text('original_value').nullable();
    table.string('question_validation', 100).nullable();
    table.string('answer_validation', 100).nullable();
    table.text('actual_value').nullable();
    table.boolean('prompting_flag').notNullable().defaultTo(false);
    table.text('remarks').nullable();
    table.jsonb('ai_suggestion').defaultTo('{}');
    table.jsonb('evidence').defaultTo('{}');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(['capi_audit_id']);
    table.index(['question_id']);
    table.index(['question_tag']);
  });

  // 3. Super Audits
  await knex.schema.createTable('super_audits', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('submission_id').notNullable().references('id').inTable('submissions').onDelete('CASCADE');
    table.uuid('capi_audit_id').nullable().references('id').inTable('capi_audits').onDelete('SET NULL');
    table.uuid('auditor_id').nullable().references('id').inTable('users').onDelete('SET NULL');
    table.enu('route_source', [
      'MANUAL',
      'CAPI_FLAG',
      'AI_RISK',
      'RANDOM_QC',
      'THRESHOLD',
      'CLIENT_RULE',
      'ESCALATION',
    ], {
      useNative: true,
      enumName: 'super_audit_route_source_enum',
    }).notNullable().defaultTo('MANUAL');
    table.enu('overall_status', ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'REVIEW_REQUIRED'], {
      useNative: true,
      enumName: 'super_audit_status_enum',
    }).notNullable().defaultTo('PENDING');
    table.enu('overall_result', ['PASSED', 'FAILED', 'REVIEW'], {
      useNative: true,
      enumName: 'super_audit_result_enum',
    }).nullable();
    table.boolean('capi_confirmed').nullable();
    table.text('remarks').nullable();
    table.jsonb('evidence').defaultTo('{}');
    table.timestamp('started_at', { useTz: true }).nullable();
    table.timestamp('completed_at', { useTz: true }).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(['submission_id']);
    table.index(['capi_audit_id']);
    table.index(['auditor_id']);
    table.index(['overall_status']);
  });

  // 4. Super Audit Items
  await knex.schema.createTable('super_audit_items', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('super_audit_id').notNullable().references('id').inTable('super_audits').onDelete('CASCADE');
    table.uuid('question_id').nullable().references('id').inTable('questions').onDelete('SET NULL');
    table.string('question_tag', 100).notNullable();
    table.string('capi_decision', 100).nullable();
    table.string('super_audit_decision', 100).nullable();
    table.text('actual_value').nullable();
    table.text('remarks').nullable();
    table.jsonb('evidence').defaultTo('{}');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(['super_audit_id']);
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
  await knex.schema.dropTableIfExists('super_audit_items');
  await knex.schema.dropTableIfExists('super_audits');
  await knex.schema.dropTableIfExists('capi_audit_items');
  await knex.schema.dropTableIfExists('capi_audits');
  await knex.raw('DROP TYPE IF EXISTS super_audit_result_enum CASCADE;');
  await knex.raw('DROP TYPE IF EXISTS super_audit_status_enum CASCADE;');
  await knex.raw('DROP TYPE IF EXISTS super_audit_route_source_enum CASCADE;');
  await knex.raw('DROP TYPE IF EXISTS audit_result_enum CASCADE;');
  await knex.raw('DROP TYPE IF EXISTS audit_status_enum CASCADE;');
  await knex.raw('DROP TYPE IF EXISTS audit_mode_enum CASCADE;');
};
