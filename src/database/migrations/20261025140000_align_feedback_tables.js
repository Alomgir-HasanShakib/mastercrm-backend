/**
 * @file 20261025140000_align_feedback_tables.js
 * @description Migration to ensure feedback_leads and feedback_attempts tables match application domain and support both legacy and operational columns.
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
  // 1. feedback_leads alignment
  const hasFeedbackLeads = await knex.schema.hasTable('feedback_leads');
  if (hasFeedbackLeads) {
    await addColumnIfNotExists(knex, 'feedback_leads', 'assigned_caller_id', (t) => t.uuid('assigned_caller_id').nullable());
    await addColumnIfNotExists(knex, 'feedback_leads', 'feedback_caller_id', (t) => t.uuid('feedback_caller_id').nullable());
    await addColumnIfNotExists(knex, 'feedback_leads', 'resolution', (t) => t.string('resolution', 50).defaultTo('PENDING'));
    await addColumnIfNotExists(knex, 'feedback_leads', 'total_attempts', (t) => t.integer('total_attempts').defaultTo(0));
    await addColumnIfNotExists(knex, 'feedback_leads', 'attempt_count', (t) => t.integer('attempt_count').defaultTo(0));
    await addColumnIfNotExists(knex, 'feedback_leads', 'phone_number', (t) => t.string('phone_number', 50).nullable());
    await addColumnIfNotExists(knex, 'feedback_leads', 'feedback_items', (t) => t.jsonb('feedback_items').defaultTo('[]'));
    await addColumnIfNotExists(knex, 'feedback_leads', 'origin_module', (t) => t.string('origin_module', 50).defaultTo('CAPI'));
    await addColumnIfNotExists(knex, 'feedback_leads', 'reason_for_feedback', (t) => t.text('reason_for_feedback').nullable());
    await addColumnIfNotExists(knex, 'feedback_leads', 'discrepancy_summary', (t) => t.jsonb('discrepancy_summary').defaultTo('{}'));
  }

  // 2. feedback_attempts alignment
  const hasFeedbackAttempts = await knex.schema.hasTable('feedback_attempts');
  if (hasFeedbackAttempts) {
    await addColumnIfNotExists(knex, 'feedback_attempts', 'dialer_call_id', (t) => t.string('dialer_call_id', 100).nullable());
    await addColumnIfNotExists(knex, 'feedback_attempts', 'crm_call_id', (t) => t.string('crm_call_id', 100).nullable());
    await addColumnIfNotExists(knex, 'feedback_attempts', 'call_status', (t) => t.string('call_status', 50).defaultTo('CONNECTED'));
    await addColumnIfNotExists(knex, 'feedback_attempts', 'mistake_admitted', (t) => t.boolean('mistake_admitted').nullable());
    await addColumnIfNotExists(knex, 'feedback_attempts', 'mistake_reason', (t) => t.text('mistake_reason').nullable());
    await addColumnIfNotExists(knex, 'feedback_attempts', 'dispute_notes', (t) => t.text('dispute_notes').nullable());
    await addColumnIfNotExists(knex, 'feedback_attempts', 'evidence_urls', (t) => t.jsonb('evidence_urls').defaultTo('[]'));
    await addColumnIfNotExists(knex, 'feedback_attempts', 'corrective_action', (t) => t.string('corrective_action', 100).nullable());
    await addColumnIfNotExists(knex, 'feedback_attempts', 'notes', (t) => t.text('notes').nullable());
    await addColumnIfNotExists(knex, 'feedback_attempts', 'remarks', (t) => t.text('remarks').nullable());
    await addColumnIfNotExists(knex, 'feedback_attempts', 'talk_duration_sec', (t) => t.integer('talk_duration_sec').nullable());
    await addColumnIfNotExists(knex, 'feedback_attempts', 'call_duration', (t) => t.integer('call_duration').defaultTo(0));
    await addColumnIfNotExists(knex, 'feedback_attempts', 'attempted_at', (t) => t.timestamp('attempted_at', { useTz: true }).defaultTo(knex.fn.now()));
    await addColumnIfNotExists(knex, 'feedback_attempts', 'updated_at', (t) => t.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now()));
    await addColumnIfNotExists(knex, 'feedback_attempts', 'feedback_validations', (t) => t.jsonb('feedback_validations').defaultTo('{}'));

    // Drop not-null constraint on submission_id to support client feedback tables or external leads
    await knex.raw('ALTER TABLE feedback_attempts ALTER COLUMN submission_id DROP NOT NULL;').catch(() => {});
  }
};

exports.down = async function (knex) {};
