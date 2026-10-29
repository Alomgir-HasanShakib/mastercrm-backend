/**
 * Pre-defined Schema Templates for Master CRM
 * Includes exact client schemas for Rajasthan Bypoll Audit, Andhra Pradesh Feedback Calling, and Assam AC Audit.
 */

const fs = require('fs');
const path = require('path');
const { TVC_INPUT_COLUMNS, TVC_OUTPUT_COLUMNS } = require('../super-audit/superAuditTables.service');

let dumped = {};
try {
  const dumpedPath = path.join(__dirname, '../../../scripts/dumped_client_schemas.json');
  if (fs.existsSync(dumpedPath)) {
    dumped = JSON.parse(fs.readFileSync(dumpedPath, 'utf8'));
  }
} catch (_) {}

function buildCols(tableName) {
  if (dumped[tableName] && Array.isArray(dumped[tableName].columns)) {
    return dumped[tableName].columns.map((c) => ({
      name: c.Field,
      rawType: c.Type,
      pgType: c.Type.toLowerCase().startsWith('varchar')
        ? c.Type.toUpperCase()
        : c.Type === 'text'
        ? 'TEXT'
        : c.Type === 'datetime' || c.Type === 'timestamp'
        ? 'TIMESTAMP'
        : c.Type === 'date'
        ? 'DATE'
        : c.Type === 'time'
        ? 'TIME'
        : c.Type === 'double'
        ? 'DOUBLE PRECISION'
        : c.Type.startsWith('tinyint(1)')
        ? 'BOOLEAN'
        : 'TEXT',
      nullable: c.Null === 'YES',
      isPrimary: c.Key === 'PRI' || c.Field === 'submission_id',
    }));
  }
  return [];
}

const PREDEFINED_TEMPLATES = [
  {
    id: 'tvc_verification_2table',
    name: 'TVC Telephonic Verification (2-Table Model)',
    category: 'Telephonic Verification (TVC)',
    state: 'National / All States',
    tableModel: '2-TABLE',
    description: 'Exact 2-table model for TVC campaigns: 14 Input columns (tvc_input.csv) and 49 Output columns (tvc.csv). Output 2 is omitted.',
    inputTableName: 'tvc_input',
    output1TableName: 'tvc_output',
    output2TableName: '',
    inputColumns: TVC_INPUT_COLUMNS,
    output1Columns: TVC_OUTPUT_COLUMNS,
    output2Columns: [],
  },
  {
    id: 'rj_bypoll_audit_triplet',
    name: 'Rajasthan Bypoll Super Audit Triplet',
    category: 'Super Quality Audit',
    state: 'Rajasthan (RJ)',
    description: 'Exact client schema for Rajasthan Bypoll Election survey & dual-audit pipeline (38 Input, 40 Output-1, 111 Output-2 columns).',
    inputTableName: 'audit_input_rj_ae_bypoll_2025_r2',
    output1TableName: 'audit_output_rj_ae_bypoll_2025_r2_1',
    output2TableName: 'audit_output_rj_ae_bypoll_2025_r2_2',
    inputColumns: buildCols('audit_input_rj_ae_bypoll_2025_r2'),
    output1Columns: buildCols('audit_output_rj_ae_bypoll_2025_r2_1'),
    output2Columns: buildCols('audit_output_rj_ae_bypoll_2025_r2_2'),
  },
  {
    id: 'ap_feedback_calling_pair',
    name: 'Andhra Pradesh Feedback Calling Pair',
    category: 'Telephony / Feedback Calling',
    state: 'Andhra Pradesh (AP)',
    description: 'Exact client schema for Field Agent / Enumerator Feedback verification calling with 16 feedback metrics (31 Input, 54 Output columns).',
    inputTableName: 'feedback_call_input_ap_ac_r1',
    output1TableName: 'feedback_call_output_ap_ac_r1',
    output2TableName: 'feedback_call_output_ap_ac_r1_archive',
    inputColumns: buildCols('feedback_call_input_ap_ac_r1'),
    output1Columns: buildCols('feedback_call_output_ap_ac_r1'),
    output2Columns: buildCols('feedback_call_output_ap_ac_r1'),
  },
  {
    id: 'as_ac_audit_triplet',
    name: 'Assam AC R3 Super Audit Triplet',
    category: 'Super Quality Audit',
    state: 'Assam (AS)',
    description: 'Standard 3-table audit pipeline for Assam Assembly Constituency rounds (31 Input, 35 Output-1, 66 Output-2 columns).',
    inputTableName: 'as_audit_input_ac_r3_sup',
    output1TableName: 'as_audit_output_ac_r3_1_sup',
    output2TableName: 'as_audit_output_ac_r3_2_sup',
    inputColumns: [
      { name: 'submission_id', pgType: 'VARCHAR(255)', isPrimary: true, nullable: false },
      { name: 'audio_link', pgType: 'TEXT', isPrimary: false, nullable: true },
      { name: 'ac_num', pgType: 'TEXT', isPrimary: false, nullable: true },
      { name: 'ac_name', pgType: 'TEXT', isPrimary: false, nullable: true },
      { name: 'full_name', pgType: 'TEXT', isPrimary: false, nullable: true },
      { name: 'phone_no', pgType: 'TEXT', isPrimary: false, nullable: true },
      { name: 'fa', pgType: 'TEXT', isPrimary: false, nullable: true },
      { name: 'collector_emailid', pgType: 'TEXT', isPrimary: false, nullable: true },
      { name: 'tl_id', pgType: 'TEXT', isPrimary: false, nullable: true },
      { name: 'duration', pgType: 'DOUBLE PRECISION', isPrimary: false, nullable: true },
      { name: 'religion', pgType: 'TEXT', isPrimary: false, nullable: true },
      { name: 'caste', pgType: 'TEXT', isPrimary: false, nullable: true },
      { name: 'state_govt_change', pgType: 'TEXT', isPrimary: false, nullable: true },
      { name: 'mla_choice', pgType: 'TEXT', isPrimary: false, nullable: true },
      { name: 'voting_intention_vs_party', pgType: 'TEXT', isPrimary: false, nullable: true },
      { name: 'cm_choice', pgType: 'TEXT', isPrimary: false, nullable: true },
    ],
    output1Columns: [
      { name: 'submission_id', pgType: 'VARCHAR(255)', isPrimary: true, nullable: false },
      { name: 'audio_link', pgType: 'TEXT', isPrimary: false, nullable: true },
      { name: 'audio_disposition', pgType: 'TEXT', isPrimary: false, nullable: true },
      { name: 'mla_choice_validation', pgType: 'TEXT', isPrimary: false, nullable: true },
      { name: 'mla_choice_actual', pgType: 'TEXT', isPrimary: false, nullable: true },
      { name: 'audit_status', pgType: 'VARCHAR(32)', isPrimary: false, nullable: true },
      { name: 'remarks', pgType: 'TEXT', isPrimary: false, nullable: true },
    ],
    output2Columns: [
      { name: 'submission_id', pgType: 'VARCHAR(255)', isPrimary: true, nullable: false },
      { name: 'final_score', pgType: 'DOUBLE PRECISION', isPrimary: false, nullable: true },
      { name: 'fraud_flags', pgType: 'TEXT', isPrimary: false, nullable: true },
      { name: 'verdict', pgType: 'TEXT', isPrimary: false, nullable: true },
    ],
  },
  {
    id: 'universal_survey_triplet',
    name: 'Universal Customizable Survey Pipeline',
    category: 'Universal Field / Telephony Survey',
    state: 'All States',
    description: 'Clean standard survey pipeline with dynamic JSON questions payload and audio metadata.',
    inputTableName: 'survey_input_leads',
    output1TableName: 'survey_output_audits_1',
    output2TableName: 'survey_output_audits_2',
    inputColumns: [
      { name: 'submission_id', pgType: 'VARCHAR(255)', isPrimary: true, nullable: false },
      { name: 'respondent_name', pgType: 'TEXT', isPrimary: false, nullable: true },
      { name: 'phone_no', pgType: 'VARCHAR(32)', isPrimary: false, nullable: true },
      { name: 'audio_link', pgType: 'TEXT', isPrimary: false, nullable: true },
      { name: 'assembly_constituency', pgType: 'TEXT', isPrimary: false, nullable: true },
      { name: 'enumerator_id', pgType: 'TEXT', isPrimary: false, nullable: true },
      { name: 'survey_responses', pgType: 'JSONB', isPrimary: false, nullable: true },
      { name: 'status', pgType: 'VARCHAR(32)', isPrimary: false, nullable: true },
    ],
    output1Columns: [
      { name: 'submission_id', pgType: 'VARCHAR(255)', isPrimary: true, nullable: false },
      { name: 'audit_disposition', pgType: 'TEXT', isPrimary: false, nullable: true },
      { name: 'qc_score', pgType: 'DOUBLE PRECISION', isPrimary: false, nullable: true },
      { name: 'qc_remarks', pgType: 'TEXT', isPrimary: false, nullable: true },
    ],
    output2Columns: [
      { name: 'submission_id', pgType: 'VARCHAR(255)', isPrimary: true, nullable: false },
      { name: 'super_verdict', pgType: 'TEXT', isPrimary: false, nullable: true },
      { name: 'ai_fraud_signals', pgType: 'JSONB', isPrimary: false, nullable: true },
    ],
  },
];

module.exports = {
  PREDEFINED_TEMPLATES,
};
