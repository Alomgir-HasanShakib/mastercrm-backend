/**
 * @file 20261027010000_create_agent_voice_profiles_and_fraud_records.js
 * @description Creates agent_voice_profiles and voice_fraud_records tables for AI Voice Fraud Detection & Biometric Speaker Verification.
 */

exports.up = async function (knex) {
  // 1. Table: agent_voice_profiles
  const hasProfilesTable = await knex.schema.hasTable('agent_voice_profiles');
  if (!hasProfilesTable) {
    await knex.schema.createTable('agent_voice_profiles', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.string('agent_id').notNullable().index();
      table.string('agent_name').notNullable();
      table.string('role').nullable().defaultTo('CATI_AGENT');
      table.string('audio_url', 1024).notNullable();
      table.string('storage_path', 1024).nullable();
      table.text('embedding').nullable(); // JSON representation of acoustic/MFCC/formants vector
      table.float('sample_duration_sec').nullable().defaultTo(0);
      table.float('snr_db').nullable().defaultTo(30.0);
      table.float('pitch_f0').nullable();
      table.string('enrolled_by').nullable();
      table.string('status', 50).defaultTo('ACTIVE').index();
      table.jsonb('metadata').nullable();
      table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
    });
  }

  // 2. Table: voice_fraud_records
  const hasRecordsTable = await knex.schema.hasTable('voice_fraud_records');
  if (!hasRecordsTable) {
    await knex.schema.createTable('voice_fraud_records', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.string('lead_id').notNullable().index();
      table.string('project_id').nullable().index();
      table.string('agent_id').notNullable().index();
      table.string('agent_name').notNullable();
      table.string('fraud_type', 100).notNullable().index(); // VOICE_MISMATCH, SELF_INTERVIEW_MIMICRY, BASELINE_VOICE_MISSING
      table.float('confidence_score').notNullable().defaultTo(0);
      table.float('similarity_score').nullable();
      table.string('status', 50).notNullable().defaultTo('UNDER_REVIEW').index(); // CONFIRMED_FRAUD, UNDER_REVIEW, DISMISSED
      table.string('recording_url', 1024).nullable();
      table.string('baseline_audio_url', 1024).nullable();
      table.jsonb('details').nullable();
      table.text('notes').nullable();
      table.string('resolved_by').nullable();
      table.timestamp('resolved_at', { useTz: true }).nullable();
      table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
    });
  }
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('voice_fraud_records');
  await knex.schema.dropTableIfExists('agent_voice_profiles');
};
