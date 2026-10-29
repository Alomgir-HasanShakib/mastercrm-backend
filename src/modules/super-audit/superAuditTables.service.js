/**
 * @file superAuditTables.service.js
 * @description Dynamic table derivation and DDL generator for Client Super Audit triplet tables:
 * 1. Input Table:  [prefix]_input_[suffix]
 * 2. Output 1 Table: [prefix]_output_[suffix]_1_sup
 * 3. Output 2 Table: [prefix]_output_[suffix]_2_sup
 */

const { db, withDbFallback } = require('../../database/connection');
const mockStore = require('../../database/mockStore');
const logger = require('../../utils/logger');

/**
 * Resolves or derives the input, output 1, and output 2 table names.
 * Supports completely separate, custom table names provided by the client,
 * or derives them automatically if outputs are omitted.
 *
 * @param {string} inputTableName e.g., 'as_audit_input_ac_r3_sup'
 * @param {string} [customOutput1] e.g., 'as_audit_output_ac_r3_1_sup' or any custom name
 * @param {string} [customOutput2] e.g., 'as_audit_output_ac_r3_2_sup' or any custom name
 * @returns {{ inputTable: string, outputTable1: string, outputTable2: string }}
 */
function deriveTripletTableNames(inputTableName = 'as_audit_input_ac_r3_sup', customOutput1, customOutput2) {
  const cleanInput = String(inputTableName || 'as_audit_input_ac_r3_sup').trim().toLowerCase();

  // If client provided custom output table names explicitly, use them directly!
  if (customOutput1 && customOutput2) {
    return {
      inputTable: cleanInput,
      outputTable1: String(customOutput1).trim().toLowerCase(),
      outputTable2: String(customOutput2).trim().toLowerCase(),
    };
  }

  // Pattern: replace '_input_' with '_output_'
  if (cleanInput.includes('_input_')) {
    const baseOutput = cleanInput.replace('_input_', '_output_');
    if (baseOutput.endsWith('_sup')) {
      const core = baseOutput.slice(0, -4);
      return {
        inputTable: cleanInput,
        outputTable1: customOutput1 ? String(customOutput1).trim().toLowerCase() : `${core}_1_sup`,
        outputTable2: customOutput2 ? String(customOutput2).trim().toLowerCase() : `${core}_2_sup`,
      };
    }
    return {
      inputTable: cleanInput,
      outputTable1: customOutput1 ? String(customOutput1).trim().toLowerCase() : `${baseOutput}_1_sup`,
      outputTable2: customOutput2 ? String(customOutput2).trim().toLowerCase() : `${baseOutput}_2_sup`,
    };
  }

  // Fallback if name does not have _input_
  return {
    inputTable: cleanInput,
    outputTable1: customOutput1 ? String(customOutput1).trim().toLowerCase() : `${cleanInput}_output_1_sup`,
    outputTable2: customOutput2 ? String(customOutput2).trim().toLowerCase() : `${cleanInput}_output_2_sup`,
  };
}

/**
 * Ensures that the dynamic triplet tables exist in the local database.
 * If they do not exist, creates them matching the exact user DDL schema.
 *
 * @param {string} inputTableName
 * @param {string} [customOutput1]
 * @param {string} [customOutput2]
 * @returns {Promise<{ inputTable: string, outputTable1: string, outputTable2: string, created: boolean }>}
 */
async function ensureDynamicTables(inputTableName = 'as_audit_input_ac_r3_sup', customOutput1, customOutput2) {
  const { inputTable, outputTable1, outputTable2 } = deriveTripletTableNames(inputTableName, customOutput1, customOutput2);

  return withDbFallback(
    async () => {
      let created = false;

      // 1. Ensure Input Table
      const hasInput = await db.schema.hasTable(inputTable);
      if (!hasInput) {
        logger.info(`Creating dynamic Super Audit input table: ${inputTable}`);
        await db.schema.createTable(inputTable, (table) => {
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
          table.string('sync_status', 32).defaultTo('PENDING');
          table.timestamp('created_at', { useTz: true }).defaultTo(db.fn.now());
        });
        created = true;
      }

      // 2. Ensure Output 1 Table
      const hasOut1 = await db.schema.hasTable(outputTable1);
      if (!hasOut1) {
        logger.info(`Creating dynamic Super Audit output 1 table: ${outputTable1}`);
        await db.schema.createTable(outputTable1, (table) => {
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
          table.timestamp('created_at', { useTz: true }).defaultTo(db.fn.now());
          table.timestamp('updated_at', { useTz: true }).defaultTo(db.fn.now());
        });
        created = true;
      }

      // 3. Ensure Output 2 Table
      const hasOut2 = await db.schema.hasTable(outputTable2);
      if (!hasOut2) {
        logger.info(`Creating dynamic Super Audit output 2 table: ${outputTable2}`);
        await db.schema.createTable(outputTable2, (table) => {
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
          table.timestamp('created_at', { useTz: true }).defaultTo(db.fn.now());
          table.timestamp('updated_at', { useTz: true }).defaultTo(db.fn.now());
        });
        created = true;
      }

      return { inputTable, outputTable1, outputTable2, created };
    },
    () => {
      // MockStore in-memory initialization
      if (!mockStore.data) mockStore.data = {};
      if (!mockStore.data[inputTable]) mockStore.data[inputTable] = [];
      if (!mockStore.data[outputTable1]) mockStore.data[outputTable1] = [];
      if (!mockStore.data[outputTable2]) mockStore.data[outputTable2] = [];

      return { inputTable, outputTable1, outputTable2, created: true };
    }
  );
}

/**
 * Exact 14 columns for TVC Input Table (matching C:/Users/alomg/OneDrive/Documents/tvc_input.csv)
 */
const TVC_INPUT_COLUMNS = [
  { name: 'submission_id_dr', pgType: 'VARCHAR(100)', isPrimary: true, nullable: false },
  { name: 'Date', pgType: 'VARCHAR(50)', isPrimary: false, nullable: true },
  { name: 'FA', pgType: 'VARCHAR(50)', isPrimary: false, nullable: true },
  { name: 'phone_no', pgType: 'VARCHAR(50)', isPrimary: false, nullable: true },
  { name: 'resp_full_name', pgType: 'VARCHAR(255)', isPrimary: false, nullable: true },
  { name: 'caste', pgType: 'VARCHAR(255)', isPrimary: false, nullable: true },
  { name: 'ac_name', pgType: 'VARCHAR(255)', isPrimary: false, nullable: true },
  { name: 'age', pgType: 'VARCHAR(50)', isPrimary: false, nullable: true },
  { name: 'ac_num', pgType: 'INTEGER', isPrimary: false, nullable: true },
  { name: 'gender', pgType: 'VARCHAR(50)', isPrimary: false, nullable: true },
  { name: 'batch_slot', pgType: 'VARCHAR(100)', isPrimary: false, nullable: true },
  { name: 'tvc_status', pgType: 'VARCHAR(50)', isPrimary: false, nullable: true },
  { name: 'agent_id', pgType: 'VARCHAR(100)', isPrimary: false, nullable: true },
  { name: 'assignment_time', pgType: 'VARCHAR(100)', isPrimary: false, nullable: true },
];

/**
 * Exact 49 columns for TVC Output Table (matching C:/Users/alomg/OneDrive/Documents/tvc.csv)
 */
const TVC_OUTPUT_COLUMNS = [
  { name: 'submission_id', pgType: 'VARCHAR(100)', isPrimary: true, nullable: false },
  { name: 'audio_link', pgType: 'TEXT', isPrimary: false, nullable: true },
  { name: 'ac_num', pgType: 'VARCHAR(50)', isPrimary: false, nullable: true },
  { name: 'fa', pgType: 'VARCHAR(50)', isPrimary: false, nullable: true },
  { name: 'collector_emailid', pgType: 'VARCHAR(255)', isPrimary: false, nullable: true },
  { name: 'tl_id', pgType: 'VARCHAR(50)', isPrimary: false, nullable: true },
  { name: 'duration', pgType: 'NUMERIC(10,2)', isPrimary: false, nullable: true },
  { name: 'submission_date', pgType: 'VARCHAR(100)', isPrimary: false, nullable: true },
  { name: 'dumping_date', pgType: 'VARCHAR(100)', isPrimary: false, nullable: true },
  { name: 'batch_slot', pgType: 'VARCHAR(100)', isPrimary: false, nullable: true },
  { name: 'religion', pgType: 'VARCHAR(100)', isPrimary: false, nullable: true },
  { name: 'introduction', pgType: 'VARCHAR(100)', isPrimary: false, nullable: true },
  { name: 'ac_name', pgType: 'VARCHAR(255)', isPrimary: false, nullable: true },
  { name: 'full_name', pgType: 'VARCHAR(255)', isPrimary: false, nullable: true },
  { name: 'gender', pgType: 'VARCHAR(50)', isPrimary: false, nullable: true },
  { name: 'phone_no', pgType: 'VARCHAR(50)', isPrimary: false, nullable: true },
  { name: 'age', pgType: 'VARCHAR(50)', isPrimary: false, nullable: true },
  { name: 'caste', pgType: 'VARCHAR(255)', isPrimary: false, nullable: true },
  { name: 'major_problems', pgType: 'TEXT', isPrimary: false, nullable: true },
  { name: 'party_led_development_state', pgType: 'VARCHAR(255)', isPrimary: false, nullable: true },
  { name: 'state_govt_change', pgType: 'VARCHAR(100)', isPrimary: false, nullable: true },
  { name: 'winner_perception_state', pgType: 'VARCHAR(255)', isPrimary: false, nullable: true },
  { name: 'mla_choice', pgType: 'VARCHAR(255)', isPrimary: false, nullable: true },
  { name: 'vi_mla_choice_followup_for_koibhi', pgType: 'VARCHAR(255)', isPrimary: false, nullable: true },
  { name: 'voting_intention_vs_party', pgType: 'VARCHAR(255)', isPrimary: false, nullable: true },
  { name: 'vi_mla_choice_swap_new', pgType: 'VARCHAR(255)', isPrimary: false, nullable: true },
  { name: 'vi_mla_choice_swap_3', pgType: 'VARCHAR(255)', isPrimary: false, nullable: true },
  { name: 'vs_past_party', pgType: 'VARCHAR(255)', isPrimary: false, nullable: true },
  { name: 'ls_past_party', pgType: 'VARCHAR(255)', isPrimary: false, nullable: true },
  { name: 'mla_awareness', pgType: 'VARCHAR(100)', isPrimary: false, nullable: true },
  { name: 'mla_satisfaction', pgType: 'VARCHAR(100)', isPrimary: false, nullable: true },
  { name: 'state_govt_satisfaction', pgType: 'VARCHAR(100)', isPrimary: false, nullable: true },
  { name: 'cm_satisfaction', pgType: 'VARCHAR(100)', isPrimary: false, nullable: true },
  { name: 'central_govt_satisfaction', pgType: 'VARCHAR(100)', isPrimary: false, nullable: true },
  { name: 'pm_satisfaction', pgType: 'VARCHAR(100)', isPrimary: false, nullable: true },
  { name: 'cm_choice', pgType: 'VARCHAR(255)', isPrimary: false, nullable: true },
  { name: 'voting_intention_ls_party', pgType: 'VARCHAR(255)', isPrimary: false, nullable: true },
  { name: 'vs_past_candidate', pgType: 'VARCHAR(255)', isPrimary: false, nullable: true },
  { name: 'nda_vote_reason', pgType: 'TEXT', isPrimary: false, nullable: true },
  { name: 'mgb_vote_reason', pgType: 'TEXT', isPrimary: false, nullable: true },
  { name: 'other_vote_reason', pgType: 'TEXT', isPrimary: false, nullable: true },
  { name: 'situation_followup', pgType: 'TEXT', isPrimary: false, nullable: true },
  { name: 'ls_past_candidate', pgType: 'VARCHAR(255)', isPrimary: false, nullable: true },
  { name: 'vs_past_voted_confirmation', pgType: 'VARCHAR(255)', isPrimary: false, nullable: true },
  { name: 'ls_past_voted_confirmation', pgType: 'VARCHAR(255)', isPrimary: false, nullable: true },
  { name: 'audit_status', pgType: 'VARCHAR(50)', isPrimary: false, nullable: true },
  { name: 'pushed', pgType: 'VARCHAR(50)', isPrimary: false, nullable: true },
  { name: 'assignment_time', pgType: 'VARCHAR(100)', isPrimary: false, nullable: true },
  { name: 'agent_id', pgType: 'VARCHAR(100)', isPrimary: false, nullable: true },
];

/**
 * Resolves or derives table names for the 2-table TVC architecture.
 * (1 Input Table, 1 Output Table - Output 2 is omitted)
 *
 * @param {string} inputTableName e.g., 'tvc_input'
 * @param {string} [customOutput] e.g., 'tvc_output'
 * @returns {{ inputTable: string, outputTable: string }}
 */
function deriveTvcTableNames(inputTableName = 'tvc_input', customOutput) {
  const cleanInput = String(inputTableName || 'tvc_input').trim().toLowerCase();
  if (customOutput) {
    return {
      inputTable: cleanInput,
      outputTable: String(customOutput).trim().toLowerCase(),
    };
  }

  if (cleanInput.endsWith('_input')) {
    return {
      inputTable: cleanInput,
      outputTable: cleanInput.replace(/_input$/, '_output'),
    };
  }
  if (cleanInput.includes('_input_')) {
    return {
      inputTable: cleanInput,
      outputTable: cleanInput.replace('_input_', '_output_'),
    };
  }

  return {
    inputTable: cleanInput,
    outputTable: `${cleanInput}_output`,
  };
}

/**
 * Ensures that the dynamic 2 tables for TVC exist in PostgreSQL or fallback mockStore.
 * Creates TVC Input Table (14 columns) and TVC Output Table (49 columns).
 *
 * @param {string} [inputTableName='tvc_input']
 * @param {string} [customOutput='tvc_output']
 * @returns {Promise<{ inputTable: string, outputTable: string, created: boolean }>}
 */
async function ensureTvcDynamicTables(inputTableName = 'tvc_input', customOutput) {
  const { inputTable, outputTable } = deriveTvcTableNames(inputTableName, customOutput);

  return withDbFallback(
    async () => {
      let created = false;

      // 1. Ensure TVC Input Table (14 columns)
      const hasInput = await db.schema.hasTable(inputTable);
      if (!hasInput) {
        logger.info(`Creating dynamic TVC 2-Table Input: ${inputTable} (14 columns)`);
        await db.schema.createTable(inputTable, (table) => {
          table.string('submission_id_dr', 100).primary();
          table.string('Date', 50).nullable();
          table.string('FA', 50).nullable();
          table.string('phone_no', 50).nullable();
          table.string('resp_full_name', 255).nullable();
          table.string('caste', 255).nullable();
          table.string('ac_name', 255).nullable();
          table.string('age', 50).nullable();
          table.integer('ac_num').nullable();
          table.string('gender', 50).nullable();
          table.string('batch_slot', 100).nullable();
          table.string('tvc_status', 50).defaultTo('PENDING');
          table.string('agent_id', 100).nullable();
          table.string('assignment_time', 100).nullable();
          table.timestamp('created_at', { useTz: true }).defaultTo(db.fn.now());
        });
        created = true;
      } else {
        // Ensure essential columns exist
        for (const col of TVC_INPUT_COLUMNS) {
          const hasCol = await db.schema.hasColumn(inputTable, col.name);
          if (!hasCol) {
            await db.raw(`ALTER TABLE "${inputTable}" ADD COLUMN IF NOT EXISTS "${col.name}" ${col.pgType};`).catch(() => {});
          }
        }
      }

      // 2. Ensure TVC Output Table (49 columns)
      const hasOutput = await db.schema.hasTable(outputTable);
      if (!hasOutput) {
        logger.info(`Creating dynamic TVC 2-Table Output: ${outputTable} (49 columns)`);
        await db.schema.createTable(outputTable, (table) => {
          table.string('submission_id', 100).primary();
          table.text('audio_link').nullable();
          table.string('ac_num', 50).nullable();
          table.string('fa', 50).nullable();
          table.string('collector_emailid', 255).nullable();
          table.string('tl_id', 50).nullable();
          table.decimal('duration', 10, 2).nullable();
          table.string('submission_date', 100).nullable();
          table.string('dumping_date', 100).nullable();
          table.string('batch_slot', 100).nullable();
          table.string('religion', 100).nullable();
          table.string('introduction', 100).nullable();
          table.string('ac_name', 255).nullable();
          table.string('full_name', 255).nullable();
          table.string('gender', 50).nullable();
          table.string('phone_no', 50).nullable();
          table.string('age', 50).nullable();
          table.string('caste', 255).nullable();
          table.text('major_problems').nullable();
          table.string('party_led_development_state', 255).nullable();
          table.string('state_govt_change', 100).nullable();
          table.string('winner_perception_state', 255).nullable();
          table.string('mla_choice', 255).nullable();
          table.string('vi_mla_choice_followup_for_koibhi', 255).nullable();
          table.string('voting_intention_vs_party', 255).nullable();
          table.string('vi_mla_choice_swap_new', 255).nullable();
          table.string('vi_mla_choice_swap_3', 255).nullable();
          table.string('vs_past_party', 255).nullable();
          table.string('ls_past_party', 255).nullable();
          table.string('mla_awareness', 100).nullable();
          table.string('mla_satisfaction', 100).nullable();
          table.string('state_govt_satisfaction', 100).nullable();
          table.string('cm_satisfaction', 100).nullable();
          table.string('central_govt_satisfaction', 100).nullable();
          table.string('pm_satisfaction', 100).nullable();
          table.string('cm_choice', 255).nullable();
          table.string('voting_intention_ls_party', 255).nullable();
          table.string('vs_past_candidate', 255).nullable();
          table.text('nda_vote_reason').nullable();
          table.text('mgb_vote_reason').nullable();
          table.text('other_vote_reason').nullable();
          table.text('situation_followup').nullable();
          table.string('ls_past_candidate', 255).nullable();
          table.string('vs_past_voted_confirmation', 255).nullable();
          table.string('ls_past_voted_confirmation', 255).nullable();
          table.string('audit_status', 50).nullable();
          table.string('pushed', 50).defaultTo('1');
          table.string('assignment_time', 100).nullable();
          table.string('agent_id', 100).nullable();
          table.timestamp('created_at', { useTz: true }).defaultTo(db.fn.now());
          table.timestamp('updated_at', { useTz: true }).defaultTo(db.fn.now());
        });
        created = true;
      } else {
        // Ensure essential columns exist
        for (const col of TVC_OUTPUT_COLUMNS) {
          const hasCol = await db.schema.hasColumn(outputTable, col.name);
          if (!hasCol) {
            await db.raw(`ALTER TABLE "${outputTable}" ADD COLUMN IF NOT EXISTS "${col.name}" ${col.pgType};`).catch(() => {});
          }
        }
      }

      return { inputTable, outputTable, created };
    },
    () => {
      // MockStore in-memory fallback
      if (!mockStore.data) mockStore.data = {};
      if (!mockStore.data[inputTable]) mockStore.data[inputTable] = [];
      if (!mockStore.data[outputTable]) mockStore.data[outputTable] = [];

      return { inputTable, outputTable, created: true };
    }
  );
}

module.exports = {
  deriveTripletTableNames,
  ensureDynamicTables,
  deriveTvcTableNames,
  ensureTvcDynamicTables,
  TVC_INPUT_COLUMNS,
  TVC_OUTPUT_COLUMNS,
};
