/**
 * @file 20261019120000_create_super_audit_client_tables.js
 * @description Knex migration creating standard Super Audit Client DB tables:
 * - Input Table: as_audit_input_ac_r3_sup
 * - Output 1 Table: as_audit_output_ac_r3_1_sup
 * - Output 2 Table: as_audit_output_ac_r3_2_sup
 */

/**
 * Run migrations.
 * @param {import('knex').Knex} knex
 * @returns {Promise<void>}
 */
exports.up = async function (knex) {
  // 1. INPUT TABLE: as_audit_input_ac_r3_sup
  const hasInputTable = await knex.schema.hasTable('as_audit_input_ac_r3_sup');
  if (!hasInputTable) {
    await knex.schema.createTable('as_audit_input_ac_r3_sup', (table) => {
      table.string('submission_id', 255).primary();
      table.text('audio_link').nullable();
      table.text('ac_num').nullable();
      table.text('fa').nullable();
      table.text('collector_emailid').nullable();
      table.text('tl_id').nullable();
      table.double('duration').nullable();
      table.timestamp('submission_date', { useTz: false }).nullable();
      table.timestamp('dumping_date', { useTz: false }).nullable();
      table.timestamp('batch_slot', { useTz: false }).nullable();
      table.text('religion').nullable();
      table.text('ac_name').nullable();
      table.text('full_name').nullable();
      table.text('phone_no').nullable();
      table.text('caste').nullable();
      table.text('state_govt_change').nullable();
      table.text('state_govt_change_party_1').nullable();
      table.text('mla_choice').nullable();
      table.text('second_mla_choice').nullable();
      table.text('voting_intention_vs_party').nullable();
      table.text('candidate_party_mismatch').nullable();
      table.text('candidate_mismatch').nullable();
      table.text('vs_past_party').nullable();
      table.text('ls_past_party').nullable();
      table.text('mla_awareness').nullable();
      table.text('cm_choice').nullable();
      table.text('voting_intention_ls_party').nullable();
      table.timestamp('assignment_time', { useTz: false }).defaultTo('1970-01-01 00:00:00');
      table.string('agent_id', 255).nullable();
      table.string('sync_status', 32).defaultTo('PENDING'); // PENDING, AUDITED, ERROR
      table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    });
  }

  // 2. OUTPUT 1 TABLE: as_audit_output_ac_r3_1_sup
  const hasOutput1Table = await knex.schema.hasTable('as_audit_output_ac_r3_1_sup');
  if (!hasOutput1Table) {
    await knex.schema.createTable('as_audit_output_ac_r3_1_sup', (table) => {
      table.string('submission_id', 255).primary();
      table.text('audio_link').nullable();
      table.text('ac_num').nullable();
      table.text('fa').nullable();
      table.text('collector_emailid').nullable();
      table.text('tl_id').nullable();
      table.double('duration').nullable();
      table.timestamp('submission_date', { useTz: false }).nullable();
      table.timestamp('dumping_date', { useTz: false }).nullable();
      table.timestamp('batch_slot', { useTz: false }).nullable();
      table.text('religion').nullable();
      table.text('ac_name').nullable();
      table.text('full_name').nullable();
      table.text('phone_no').nullable();
      table.text('caste').nullable();
      table.text('state_govt_change').nullable();
      table.text('state_govt_change_party_1').nullable();
      table.text('mla_choice').nullable();
      table.text('second_mla_choice').nullable();
      table.text('voting_intention_vs_party').nullable();
      table.text('candidate_party_mismatch').nullable();
      table.text('candidate_mismatch').nullable();
      table.text('vs_past_party').nullable();
      table.text('ls_past_party').nullable();
      table.text('mla_awareness').nullable();
      table.text('cm_choice').nullable();
      table.text('voting_intention_ls_party').nullable();
      table.string('audit_status', 32).nullable();
      table.boolean('pushed').defaultTo(false);
      table.timestamp('assignment_time', { useTz: false }).defaultTo('1970-01-01 00:00:00');
      table.string('agent_id', 255).nullable();
      table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
    });
  }

  // 3. OUTPUT 2 TABLE: as_audit_output_ac_r3_2_sup
  const hasOutput2Table = await knex.schema.hasTable('as_audit_output_ac_r3_2_sup');
  if (!hasOutput2Table) {
    await knex.schema.createTable('as_audit_output_ac_r3_2_sup', (table) => {
      table.text('sn').nullable();
      table.text('id').nullable();
      table.string('submission_id', 255).primary();
      table.timestamp('submission_time', { useTz: false }).nullable();
      table.text('unique_id').nullable();
      table.text('audio_link').nullable();
      table.text('collector_emailid').nullable();
      table.text('fa').nullable();
      table.text('tl_id').nullable();
      table.string('agent_id', 255).nullable();
      table.text('disposition').nullable();
      table.timestamp('load_time', { useTz: false }).nullable();
      table.timestamp('modify_time', { useTz: false }).nullable();
      table.timestamp('dumping_date', { useTz: false }).nullable();
      table.string('completion_time', 50).nullable();
      table.double('duration').nullable();
      table.text('introduction').nullable();
      table.text('ac_name_validation').nullable();
      table.text('ac_name_actual').nullable();
      table.text('full_name_validation').nullable();
      table.text('full_name_actual').nullable();
      table.text('gender_validation').nullable();
      table.text('gender_actual').nullable();
      table.text('phone_number_validation').nullable();
      table.text('phone_no_actual').nullable();
      table.text('age_validation').nullable();
      table.text('age_actual').nullable();
      table.text('caste_validation').nullable();
      table.text('caste_actual').nullable();
      table.text('major_problems_validation').nullable();
      table.text('major_problems_actual').nullable();
      table.text('boro_leader_question_validation').nullable();
      table.text('boro_leader_validation').nullable();
      table.text('boro_leader_actual').nullable();
      table.text('state_govt_change_question_validation').nullable();
      table.text('state_govt_change_validation').nullable();
      table.text('state_govt_change_validation_1').nullable();
      table.text('state_govt_change_validation_2').nullable();
      table.text('state_govt_change_actual').nullable();
      table.text('state_govt_change_party_1_question_validation').nullable();
      table.text('state_govt_change_party_1_validation').nullable();
      table.text('state_govt_change_party_1_validation_1').nullable();
      table.text('state_govt_change_party_1_validation_2').nullable();
      table.text('state_govt_change_party_1_actual').nullable();
      table.text('vi_mismatch_question_validation').nullable();
      table.text('vi_mismatch_validation').nullable();
      table.text('vi_mismatch_actual').nullable();
      table.text('mla_choice_question_validation').nullable();
      table.text('mla_choice_validation').nullable();
      table.text('mla_choice_validation_1').nullable();
      table.text('mla_choice_validation_2').nullable();
      table.text('mla_choice_actual').nullable();
      table.text('vi_mla_choice_followup_for_koibhi_question_validation').nullable();
      table.text('vi_mla_choice_followup_for_koibhi_validation').nullable();
      table.text('vi_mla_choice_followup_for_koibhi_validation_1').nullable();
      table.text('vi_mla_choice_followup_for_koibhi_validation_2').nullable();
      table.text('vi_mla_choice_followup_for_koibhi_actual').nullable();
      table.text('second_mla_choice_question_validation').nullable();
      table.text('second_mla_choice_validation').nullable();
      table.text('second_mla_choice_validation_1').nullable();
      table.text('second_mla_choice_validation_2').nullable();
      table.text('second_mla_choice_actual').nullable();
      table.text('second_mla_choice_2_question_validation').nullable();
      table.text('second_mla_choice_2_validation').nullable();
      table.text('second_mla_choice_2_validation_1').nullable();
      table.text('second_mla_choice_2_validation_2').nullable();
      table.text('second_mla_choice_2_actual').nullable();
      table.text('voting_intention_vs_party_question_validation').nullable();
      table.text('voting_intention_vs_party_validation').nullable();
      table.text('voting_intention_vs_party_actual').nullable();
      table.text('candidate_party_mismatch_question_validation').nullable();
      table.text('candidate_party_mismatch_validation').nullable();
      table.text('candidate_party_mismatch_actual').nullable();
      table.text('candidate_mismatch_question_validation').nullable();
      table.text('candidate_mismatch_validation').nullable();
      table.text('candidate_mismatch_validation_1').nullable();
      table.text('candidate_mismatch_validation_2').nullable();
      table.text('candidate_mismatch_actual').nullable();
      table.text('vs_past_voted_question_validation').nullable();
      table.text('vs_past_voted_validation').nullable();
      table.text('vs_past_voted_actual').nullable();
      table.text('vs_past_candidate_question_validation').nullable();
      table.text('vs_past_candidate_validation').nullable();
      table.text('vs_past_candidate_actual').nullable();
      table.text('vs_past_party_question_validation').nullable();
      table.text('vs_past_party_validation').nullable();
      table.text('vs_past_party_actual').nullable();
      table.text('ls_past_voted_question_validation').nullable();
      table.text('ls_past_voted_validation').nullable();
      table.text('ls_past_voted_actual').nullable();
      table.text('ls_past_candidate_question_validation').nullable();
      table.text('ls_past_candidate_validation').nullable();
      table.text('ls_past_candidate_actual').nullable();
      table.text('ls_past_party_question_validation').nullable();
      table.text('ls_past_party_validation').nullable();
      table.text('ls_past_party_actual').nullable();
      table.text('mla_awareness_validation').nullable();
      table.text('mla_awareness_actual').nullable();
      table.text('mla_satisfaction_validation').nullable();
      table.text('mla_satisfaction_actual').nullable();
      table.text('cm_satisfaction_validation').nullable();
      table.text('cm_satisfaction_actual').nullable();
      table.text('pm_satisfaction_validation').nullable();
      table.text('pm_satisfaction_actual').nullable();
      table.text('cm_choice_question_validation').nullable();
      table.text('cm_choice_validation').nullable();
      table.text('cm_choice_validation_1').nullable();
      table.text('cm_choice_validation_2').nullable();
      table.text('cm_choice_actual').nullable();
      table.text('voting_intention_ls_party_question_validation').nullable();
      table.text('voting_intention_ls_party_validation').nullable();
      table.text('voting_intention_ls_party_actual').nullable();
      table.text('group_interview').nullable();
      table.text('rapid_questionning').nullable();
      table.text('convincing_skills').nullable();
      table.text('red_flag').nullable();
      table.text('fraud_interviews').nullable();
      table.text('respondent_type').nullable();
      table.text('audio_mute').nullable();
      table.text('candidate_managed_fraud').nullable();
      table.text('compromise_party').nullable();
      table.text('Number_of_responder').nullable();
      table.text('rating').nullable();
      table.text('Remarks').nullable();
      table.string('audit_status', 32).nullable();
      table.boolean('pushed').defaultTo(false);
      table.timestamp('audit_start_time', { useTz: false }).nullable();
      table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
    });
  }
};

/**
 * Rollback migrations.
 * @param {import('knex').Knex} knex
 * @returns {Promise<void>}
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('as_audit_output_ac_r3_2_sup');
  await knex.schema.dropTableIfExists('as_audit_output_ac_r3_1_sup');
  await knex.schema.dropTableIfExists('as_audit_input_ac_r3_sup');
};
