/**
 * @file 20261012120000_create_operational_modules.js
 * @description Knex migration creating tables for CAPI, Super Audit, TVC, Feedback, and Dialer Hub.
 */

/**
 * @param {import('knex').Knex} knex
 * @returns {Promise<void>}
 */
exports.up = async function (knex) {
  // 1. CAPI Audits
  const hasCapiAudits = await knex.schema.hasTable('capi_audits');
  if (!hasCapiAudits) {
    await knex.schema.createTable('capi_audits', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('submission_id').notNullable().index();
      table.uuid('project_id').notNullable().index();
      table.uuid('vendor_id').nullable().index();
      table.uuid('auditor_id').nullable().index();
      table.string('audit_type', 50).defaultTo('AUDIO_FIRST');
      table.string('status', 50).defaultTo('PENDING').index();
      table.string('audio_url', 1000).nullable();
      table.integer('audio_duration').defaultTo(0);
      table.decimal('audio_quality_score', 5, 2).defaultTo(0);
      table.string('audio_status', 50).defaultTo('PRESENT');
      table.decimal('gps_lat', 10, 7).nullable();
      table.decimal('gps_lng', 10, 7).nullable();
      table.decimal('gps_accuracy', 8, 2).nullable();
      table.string('gps_status', 50).defaultTo('MATCH');
      table.decimal('score', 5, 2).defaultTo(0);
      table.string('decision', 50).defaultTo('PENDING');
      table.text('feedback').nullable();
      table.jsonb('flags').defaultTo('[]');
      table.timestamp('started_at').nullable();
      table.timestamp('completed_at').nullable();
      table.integer('duration_seconds').defaultTo(0);
      table.jsonb('metadata').defaultTo('{}');
      table.timestamps(true, true);
    });
  }

  // 2. CAPI Audit Items
  const hasCapiAuditItems = await knex.schema.hasTable('capi_audit_items');
  if (!hasCapiAuditItems) {
    await knex.schema.createTable('capi_audit_items', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('capi_audit_id').notNullable().index();
      table.uuid('question_id').nullable();
      table.string('question_tag', 100).notNullable();
      table.text('original_value').nullable();
      table.text('audited_value').nullable();
      table.string('status', 50).defaultTo('PASS');
      table.boolean('is_mismatch').defaultTo(false);
      table.integer('audio_timestamp_start').nullable();
      table.integer('audio_timestamp_end').nullable();
      table.text('notes').nullable();
      table.timestamps(true, true);
    });
  }

  // 3. Super Audits
  const hasSuperAudits = await knex.schema.hasTable('super_audits');
  if (!hasSuperAudits) {
    await knex.schema.createTable('super_audits', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('submission_id').notNullable().index();
      table.uuid('project_id').notNullable().index();
      table.uuid('vendor_id').nullable().index();
      table.uuid('capi_audit_id').nullable().index();
      table.uuid('super_auditor_id').nullable().index();
      table.string('routing_reason', 100).defaultTo('RANDOM_SAMPLING');
      table.string('status', 50).defaultTo('PENDING').index();
      table.string('decision', 50).defaultTo('PENDING');
      table.string('original_decision', 50).nullable();
      table.string('final_decision', 50).nullable();
      table.decimal('capi_score', 5, 2).defaultTo(0);
      table.decimal('super_audit_score', 5, 2).defaultTo(0);
      table.decimal('variance_score', 5, 2).defaultTo(0);
      table.text('notes').nullable();
      table.jsonb('metadata').defaultTo('{}');
      table.timestamp('started_at').nullable();
      table.timestamp('completed_at').nullable();
      table.timestamps(true, true);
    });
  }

  // 4. Super Audit Items
  const hasSuperAuditItems = await knex.schema.hasTable('super_audit_items');
  if (!hasSuperAuditItems) {
    await knex.schema.createTable('super_audit_items', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('super_audit_id').notNullable().index();
      table.uuid('question_id').nullable();
      table.string('question_tag', 100).notNullable();
      table.text('original_response').nullable();
      table.string('capi_eval_status', 50).nullable();
      table.string('super_eval_status', 50).defaultTo('AGREE');
      table.text('overrule_reason').nullable();
      table.timestamps(true, true);
    });
  }

  // 5. TVC Leads
  const hasTvcLeads = await knex.schema.hasTable('tvc_leads');
  if (!hasTvcLeads) {
    await knex.schema.createTable('tvc_leads', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('submission_id').notNullable().index();
      table.uuid('project_id').notNullable().index();
      table.uuid('vendor_id').nullable().index();
      table.uuid('agent_id').nullable().index();
      table.string('respondent_name', 255).nullable();
      table.string('phone_number', 50).notNullable().index();
      table.string('status', 50).defaultTo('QUEUED').index();
      table.integer('priority').defaultTo(50);
      table.integer('total_attempts').defaultTo(0);
      table.integer('max_attempts').defaultTo(3);
      table.timestamp('last_attempt_at').nullable();
      table.timestamp('next_callback_at').nullable();
      table.string('last_disposition', 100).nullable();
      table.string('verification_status', 50).defaultTo('PENDING');
      table.decimal('verification_score', 5, 2).defaultTo(0);
      table.jsonb('metadata').defaultTo('{}');
      table.timestamps(true, true);
    });
  }

  // 6. TVC Attempts
  const hasTvcAttempts = await knex.schema.hasTable('tvc_attempts');
  if (!hasTvcAttempts) {
    await knex.schema.createTable('tvc_attempts', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('tvc_lead_id').notNullable().index();
      table.uuid('agent_id').notNullable().index();
      table.integer('attempt_number').notNullable();
      table.string('dialer_call_id', 100).nullable();
      table.string('call_status', 50).defaultTo('INITIATED');
      table.string('disposition', 100).notNullable();
      table.integer('call_duration').defaultTo(0);
      table.string('recording_url', 1000).nullable();
      table.jsonb('verification_answers').defaultTo('{}');
      table.text('notes').nullable();
      table.timestamp('callback_time').nullable();
      table.timestamp('attempted_at').defaultTo(knex.fn.now());
      table.timestamps(true, true);
    });
  }

  // 7. Feedback Leads
  const hasFeedbackLeads = await knex.schema.hasTable('feedback_leads');
  if (!hasFeedbackLeads) {
    await knex.schema.createTable('feedback_leads', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('submission_id').notNullable().index();
      table.uuid('project_id').notNullable().index();
      table.uuid('vendor_id').nullable().index();
      table.uuid('field_agent_id').nullable().index();
      table.uuid('feedback_caller_id').nullable().index();
      table.string('origin_module', 50).defaultTo('CAPI');
      table.text('reason_for_feedback').nullable();
      table.string('status', 50).defaultTo('PENDING').index();
      table.string('resolution', 50).defaultTo('PENDING');
      table.integer('total_attempts').defaultTo(0);
      table.integer('max_attempts').defaultTo(3);
      table.timestamp('last_attempt_at').nullable();
      table.timestamp('next_callback_at').nullable();
      table.jsonb('discrepancy_summary').defaultTo('{}');
      table.jsonb('metadata').defaultTo('{}');
      table.timestamps(true, true);
    });
  }

  // 8. Feedback Attempts
  const hasFeedbackAttempts = await knex.schema.hasTable('feedback_attempts');
  if (!hasFeedbackAttempts) {
    await knex.schema.createTable('feedback_attempts', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('feedback_lead_id').notNullable().index();
      table.uuid('caller_id').notNullable().index();
      table.integer('attempt_number').notNullable();
      table.string('dialer_call_id', 100).nullable();
      table.string('call_status', 50).defaultTo('CONNECTED');
      table.string('disposition', 100).notNullable();
      table.boolean('mistake_admitted').nullable();
      table.text('mistake_reason').nullable();
      table.text('dispute_notes').nullable();
      table.jsonb('evidence_urls').defaultTo('[]');
      table.string('corrective_action', 100).nullable();
      table.text('notes').nullable();
      table.integer('call_duration').defaultTo(0);
      table.string('recording_url', 1000).nullable();
      table.timestamp('attempted_at').defaultTo(knex.fn.now());
      table.timestamps(true, true);
    });
  }

  // 9. Dialer CDRs (Call Detail Records)
  const hasDialerCdr = await knex.schema.hasTable('dialer_cdr');
  if (!hasDialerCdr) {
    await knex.schema.createTable('dialer_cdr', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.string('call_id', 100).notNullable().unique();
      table.string('provider', 50).defaultTo('GENERIC_REST');
      table.string('direction', 20).defaultTo('OUTBOUND');
      table.string('caller_number', 50).nullable();
      table.string('destination_number', 50).notNullable();
      table.uuid('agent_id').nullable().index();
      table.uuid('project_id').nullable().index();
      table.string('module', 50).nullable().index();
      table.uuid('reference_id').nullable().index();
      table.string('status', 50).defaultTo('INITIATED');
      table.integer('duration_seconds').defaultTo(0);
      table.integer('billable_seconds').defaultTo(0);
      table.string('recording_url', 1000).nullable();
      table.string('hangup_cause', 100).nullable();
      table.jsonb('raw_payload').defaultTo('{}');
      table.timestamp('started_at').nullable();
      table.timestamp('answered_at').nullable();
      table.timestamp('ended_at').nullable();
      table.timestamps(true, true);
    });
  }
};

/**
 * @param {import('knex').Knex} knex
 * @returns {Promise<void>}
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('dialer_cdr');
  await knex.schema.dropTableIfExists('feedback_attempts');
  await knex.schema.dropTableIfExists('feedback_leads');
  await knex.schema.dropTableIfExists('tvc_attempts');
  await knex.schema.dropTableIfExists('tvc_leads');
  await knex.schema.dropTableIfExists('super_audit_items');
  await knex.schema.dropTableIfExists('super_audits');
  await knex.schema.dropTableIfExists('capi_audit_items');
  await knex.schema.dropTableIfExists('capi_audits');
};
