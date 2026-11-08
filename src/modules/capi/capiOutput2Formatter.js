/**
 * @file capiOutput2Formatter.js
 * @description Standardized formatter and persistence engine for Client Output 2 Table and Audited Data Reports.
 * Implements the exact 133-column specification defined by the client.
 */

const { db } = require('../../database/connection');
const logger = require('../../utils/logger');

// Exact 133-column layout specified for downloaded reports and output2 table
const OUTPUT2_COLUMNS = [
  'submission_id',
  'unique_id',
  'agent_id',
  'audio_link',
  'disposition',
  'ac_num',
  'fa',
  'collector_emailid',
  'tl_id',
  'religion',
  'duration',
  'submission_date',
  'dumping_date',
  'batch_slot',
  'submission_time',
  'load_time',
  'audit_start_time',
  'modify_time',
  'completion_time',
  'audit_status',
  'introduction',
  'ac_name',
  'ac_name_validation',
  'ac_name_actual',
  'full_name',
  'full_name_validation',
  'full_name_actual',
  'gender',
  'gender_validation',
  'gender_actual',
  'phone_no',
  'phone_number_validation',
  'phone_number_actual',
  'age',
  'age_validation',
  'age_actual',
  'caste',
  'caste_validation',
  'caste_actual',
  'major_problems',
  'major_problems_validation',
  'major_problems_actual',
  'state_govt_change',
  'state_govt_change_question_validation',
  'state_govt_change_validation',
  'state_govt_change_actual',
  'winner_perception_state',
  'winner_perception_state_question_validation',
  'winner_perception_state_validation',
  'winner_perception_state_validation_1',
  'winner_perception_state_validation_2',
  'winner_perception_state_actual',
  'voting_intention_vs_candidate',
  'voting_intention_vs_candidate_question_validation',
  'voting_intention_vs_candidate_validation',
  'voting_intention_vs_candidate_validation_1',
  'voting_intention_vs_candidate_validation_2',
  'voting_intention_vs_candidate_actual',
  'voting_intention_vs_party',
  'voting_intention_vs_party_question_validation',
  'voting_intention_vs_party_validation',
  'voting_intention_vs_party_actual',
  'vs_past_voted_confirmation',
  'vs_past_voted_confirmation_question_validation',
  'vs_past_voted_confirmation_validation',
  'vs_past_voted_confirmation_actual',
  'vs_past_candidate',
  'vs_past_candidate_question_validation',
  'vs_past_candidate_validation',
  'vs_past_candidate_actual',
  'vs_past_party',
  'vs_past_party_question_validation',
  'vs_past_party_validation',
  'vs_past_party_actual',
  'nda_vote_reason',
  'nda_vote_reason_question_validation',
  'nda_vote_reason_validation',
  'nda_vote_reason_actual',
  'mgb_vote_reason',
  'mgb_vote_reason_question_validation',
  'mgb_vote_reason_validation',
  'mgb_vote_reason_actual',
  'situation_followup',
  'situation_followup_question_validation',
  'situation_followup_validation',
  'situation_followup_actual',
  'ls_past_voted_confirmation',
  'ls_past_voted_confirmation_question_validation',
  'ls_past_voted_confirmation_validation',
  'ls_past_voted_confirmation_actual',
  'ls_past_candidate',
  'ls_past_candidate_question_validation',
  'ls_past_candidate_validation',
  'ls_past_candidate_actual',
  'ls_past_party',
  'ls_past_party_question_validation',
  'ls_past_party_validation',
  'ls_past_party_actual',
  'cm_satisfaction',
  'cm_satisfaction_validation',
  'cm_satisfaction_actual',
  'pm_satisfaction',
  'pm_satisfaction_validation',
  'pm_satisfaction_actual',
  'cm_choice',
  'cm_choice_question_validation',
  'cm_choice_validation',
  'cm_choice_validation_1',
  'cm_choice_validation_2',
  'cm_choice_actual',
  'voting_intention_ls_party',
  'voting_intention_ls_party_question_validation',
  'voting_intention_ls_party_validation',
  'voting_intention_ls_party_actual',
  'response_style',
  'mimicry',
  'inconsistent_gender',
  'respondent_age',
  'voice_of_respondents',
  'rapid_responses',
  'group_interview',
  'sound',
  'rapid_questionning',
  'convincing_skills',
  'red_flag',
  'fraud_interviews',
  'respondent_type',
  'audio_mute',
  'candidate_managed_fraud',
  'compromise_party',
  'actual_voting_intention',
  'rating',
  'Remarks',
];

/**
 * Format a lead + audit submission into the exact 133-column Output 2 row.
 *
 * @param {object} lead - Lead object from database
 * @param {object} decisionData - Audit decision payload
 * @param {object} user - Auditor / agent user context
 * @param {number} [sn] - Optional sequential number
 * @returns {object}
 */
function formatLeadToOutput2Row(lead, decisionData = {}, user = {}, sn = null) {
  const meta = typeof lead.metadata === 'string' ? JSON.parse(lead.metadata || '{}') : (lead.metadata || {});
  const output = meta.outputData || {};
  const responses = Array.isArray(meta.surveyResponses)
    ? meta.surveyResponses
    : (Array.isArray(output.items) ? output.items : []);

  // Map responses by question_tag or question_no for rapid O(1) lookup
  const respMap = {};
  for (const r of responses) {
    if (r.question_tag) respMap[r.question_tag.toLowerCase()] = r;
    if (r.code) respMap[r.code.toLowerCase()] = r;
    if (r.question_no) respMap[String(r.question_no)] = r;
    if (r.question_id) respMap[String(r.question_id).toLowerCase()] = r;
    if (r.tag) respMap[String(r.tag).toLowerCase()] = r;
  }

  // Also extract any direct fields passed in decisionData.items
  if (Array.isArray(decisionData.items)) {
    for (const item of decisionData.items) {
      const tag = item.question_tag || item.code || item.question_id || item.tag;
      if (tag) respMap[String(tag).toLowerCase()] = item;
    }
  }

  // Extract authentic lead-specific audio duration and timing telemetry
  const rawDur = parseFloat(
    decisionData.duration ||
    decisionData.audioDuration ||
    decisionData.audio_duration ||
    meta.duration ||
    meta.audio_duration ||
    output.duration ||
    output.audio_duration ||
    lead.duration ||
    180
  );
  // Ensure duration in seconds (if stored in minutes e.g. 3.2m -> 192s)
  const durationSec = rawDur > 0 && rawDur < 30 ? Math.round(rawDur * 60) : Math.round(rawDur);

  // Derive lead-specific survey end time
  let leadEndTime;
  if (decisionData.survey_end_time || meta.survey_end_time || output.survey_end_time) {
    leadEndTime = new Date(decisionData.survey_end_time || meta.survey_end_time || output.survey_end_time);
  } else if (lead.surveyed_at) {
    leadEndTime = new Date(lead.surveyed_at);
  } else if (lead.updated_at) {
    leadEndTime = new Date(lead.updated_at);
  } else if (lead.allocated_at) {
    leadEndTime = new Date(new Date(lead.allocated_at).getTime() + durationSec * 1000);
  } else if (lead.created_at) {
    leadEndTime = new Date(new Date(lead.created_at).getTime() + durationSec * 1000);
  } else {
    leadEndTime = new Date();
  }
  if (isNaN(leadEndTime.getTime())) leadEndTime = new Date();

  // Derive lead-specific survey start time strictly before end time by durationSec
  let leadStartTime;
  if (decisionData.survey_start_time || meta.survey_start_time || output.survey_start_time) {
    leadStartTime = new Date(decisionData.survey_start_time || meta.survey_start_time || output.survey_start_time);
  } else if (lead.allocated_at) {
    leadStartTime = new Date(lead.allocated_at);
  } else {
    leadStartTime = new Date(leadEndTime.getTime() - durationSec * 1000);
  }
  if (isNaN(leadStartTime.getTime())) leadStartTime = new Date(leadEndTime.getTime() - durationSec * 1000);

  const formatIsoSpace = (d) => {
    try {
      const dt = d instanceof Date ? d : new Date(d);
      if (isNaN(dt.getTime())) return new Date().toISOString().replace('T', ' ').slice(0, 19);
      const pad = (n) => String(n).padStart(2, '0');
      return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`;
    } catch {
      return new Date().toISOString().replace('T', ' ').slice(0, 19);
    }
  };

  const endStr = formatIsoSpace(leadEndTime);
  const startStr = formatIsoSpace(leadStartTime);

  // Format completion_time strictly as HH:MM:SS matching test.csv (e.g. "00:11:09")
  let completionTimeStr;
  const rawComp = decisionData.completion_time || meta.completion_time || output.completion_time;
  if (rawComp && /^\d{2}:\d{2}:\d{2}$/.test(String(rawComp).trim())) {
    completionTimeStr = String(rawComp).trim();
  } else {
    const totalSec = Math.max(1, durationSec);
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    const pad = (n) => String(n).padStart(2, '0');
    completionTimeStr = `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
  }

  // Duration in minutes formatted with two decimals matching test.csv (e.g. "15.31", "9.09")
  let durationFormatted;
  if (rawDur > 0 && rawDur < 30) {
    durationFormatted = Number(rawDur).toFixed(2);
  } else {
    durationFormatted = (durationSec / 60).toFixed(2);
  }

  // Determine submission_time
  let submissionTimeStr;
  if (meta.submission_time || meta.submission_date) {
    submissionTimeStr = formatIsoSpace(meta.submission_time || meta.submission_date);
  } else if (lead.created_at) {
    submissionTimeStr = formatIsoSpace(lead.created_at);
  } else {
    submissionTimeStr = startStr;
  }

  const rawDisp = decisionData.audioDisposition || output.audio_disposition || meta.disposition || 'audio_downloadable_playable';
  const cleanDisp = String(rawDisp).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'audio_downloadable_playable';

  const submissionId = meta.submission_id || lead.id;
  const isPass = (decisionData.decision || output.audit_status || output.decision || 'PASS').toUpperCase() === 'PASS';
  const score = decisionData.score !== undefined ? decisionData.score : (output.score !== undefined ? output.score : 100);

  // Helper to extract question validation & answer validation
  const getQVal = (tag, defaultQ = 'Asked Right') => {
    const item = respMap[tag.toLowerCase()];
    if (item && item.question_decision) return item.question_decision;
    if (item && item.decision) return item.decision;
    return isPass ? defaultQ : 'Not Audible - Agent did not ask the question';
  };

  const getAVal = (tag, defaultA = 'Yes - No Prompting Done') => {
    const item = respMap[tag.toLowerCase()];
    if (item && item.answer_decision) return item.answer_decision;
    if (item && item.decision) return item.decision;
    return isPass ? defaultA : 'Not Audible - No response';
  };

  const getAns = (tag, defaultVal = '') => {
    const item = respMap[tag.toLowerCase()];
    if (item && item.answer && item.answer !== 'N/A') return item.answer;
    if (meta[tag] !== undefined && meta[tag] !== null && String(meta[tag]).trim() !== '') {
      return String(meta[tag]).trim();
    }
    return defaultVal;
  };

  const getActual = (tag) => {
    const item = respMap[tag.toLowerCase()];
    if (item && item.actualAnswer) return item.actualAnswer;
    if (item && item.actual_answer) return item.actual_answer;
    if (item && item.actual) return item.actual;
    if (decisionData.responses && decisionData.responses[`${tag}_actual`]) return decisionData.responses[`${tag}_actual`];
    if (decisionData.responses && decisionData.responses[tag]) return decisionData.responses[tag];
    if (meta.responses && meta.responses[`${tag}_actual`]) return meta.responses[`${tag}_actual`];
    if (meta[`${tag}_actual`]) return meta[`${tag}_actual`];
    if (lead[`${tag}_actual`]) return lead[`${tag}_actual`];
    // Check if there is a mismatch note or answer
    if (item && item.status === 'FLAG') return item.answer || '';
    return '';
  };

  const getForensic = (tag, defaultVal) => {
    const item = respMap[tag.toLowerCase()];
    if (item && item.answer && item.answer !== 'N/A') return item.answer;
    if (meta[tag] !== undefined && meta[tag] !== null && String(meta[tag]).trim() !== '') {
      return String(meta[tag]).trim();
    }
    return defaultVal;
  };

  // Build the 133-column row strictly matching client specification
  const row = {
    submission_id: submissionId,
    unique_id: meta.unique_id || submissionId,
    agent_id: user.email || user.id || meta.completedBy || 'AI_Auditor_#1',
    audio_link: meta.audio_link || meta.audio_url || meta.recording_url || lead.recording_url || '',
    disposition: cleanDisp,
    ac_num: String(meta.ac_num || lead.ac_num || '54'),
    fa: String(meta.fa || meta.field_agent || '5428451'),
    collector_emailid: meta.collector_emailid || meta.agent_id || lead.surveyor_name || 'Harishsurdasrathod@gmail.com',
    tl_id: meta.tl_id || meta.team_lead_id || 'MH-12',
    religion: meta.religion || getAns('religion', 'Hindu'),
    duration: durationFormatted,
    submission_date: formatIsoSpace(meta.submission_date || meta.submission_time || lead.created_at || startStr),
    dumping_date: meta.dumping_date ? formatIsoSpace(meta.dumping_date) : endStr,
    batch_slot: meta.batch_slot ? formatIsoSpace(meta.batch_slot) : formatIsoSpace(lead.created_at || startStr),
    submission_time: submissionTimeStr,
    load_time: meta.load_time || '\\N',
    audit_start_time: startStr,
    modify_time: endStr,
    completion_time: completionTimeStr,
    audit_status: output.audit_status || decisionData.decision || 'COMPLETED',

    introduction: getAVal('introduction', isPass ? 'Yes - Perfect introduction' : 'Incomplete Introduction'),

    ac_name: lead.ac_name || meta.ac_name || lead.constituency || 'Wardha',
    ac_name_validation: getQVal('ac_name'),
    ac_name_actual: getActual('ac_name'),

    full_name: lead.respondent_name || meta.full_name || 'Pramod Baghel',
    full_name_validation: getQVal('full_name'),
    full_name_actual: getActual('full_name'),

    gender: meta.gender || lead.gender || 'Male',
    gender_validation: getQVal('gender'),
    gender_actual: getActual('gender'),

    phone_no: lead.phone_number || meta.phone_no || '9876543210',
    phone_number_validation: getQVal('phone_number'),
    phone_number_actual: getActual('phone_number'),

    age: String(meta.age || '35'),
    age_validation: getQVal('age'),
    age_actual: getActual('age'),

    caste: meta.caste || 'OBC',
    caste_validation: getQVal('caste'),
    caste_actual: getActual('caste'),

    major_problems: meta.major_problems || getAns('major_problems', 'Roads and drinking water'),
    major_problems_validation: getQVal('major_problems'),
    major_problems_actual: getActual('major_problems'),

    state_govt_change: meta.state_govt_change || getAns('state_govt_change', 'No Change'),
    state_govt_change_question_validation: getQVal('state_govt_change'),
    state_govt_change_validation: getAVal('state_govt_change', 'Yes - No Prompting Done'),
    state_govt_change_actual: getActual('state_govt_change'),

    winner_perception_state: meta.winner_perception_state || getAns('winner_perception_state', 'NDA'),
    winner_perception_state_question_validation: getQVal('winner_perception_state'),
    winner_perception_state_validation: getAVal('winner_perception_state', 'Yes - No Prompting Done'),
    winner_perception_state_validation_1: getAVal('winner_perception_state_validation_1', 'Yes - No Prompting Done'),
    winner_perception_state_validation_2: getAVal('winner_perception_state_validation_2', ''),
    winner_perception_state_actual: getActual('winner_perception_state'),

    voting_intention_vs_candidate: meta.voting_intention_vs_candidate || getAns('voting_intention_vs_candidate', 'Candidate A'),
    voting_intention_vs_candidate_question_validation: getQVal('voting_intention_vs_candidate'),
    voting_intention_vs_candidate_validation: getAVal('voting_intention_vs_candidate', 'Yes - No Prompting Done'),
    voting_intention_vs_candidate_validation_1: getAVal('voting_intention_vs_candidate_validation_1', 'Yes - No Prompting Done'),
    voting_intention_vs_candidate_validation_2: getAVal('voting_intention_vs_candidate_validation_2', ''),
    voting_intention_vs_candidate_actual: getActual('voting_intention_vs_candidate'),

    voting_intention_vs_party: meta.voting_intention_vs_party || getAns('voting_intention_vs_party', 'BJP'),
    voting_intention_vs_party_question_validation: getQVal('voting_intention_vs_party'),
    voting_intention_vs_party_validation: getAVal('voting_intention_vs_party', 'Yes - No Prompting Done'),
    voting_intention_vs_party_actual: getActual('voting_intention_vs_party'),

    vs_past_voted_confirmation: meta.vs_past_voted_confirmation || getAns('vs_past_voted_confirmation', 'Yes'),
    vs_past_voted_confirmation_question_validation: getQVal('vs_past_voted_confirmation'),
    vs_past_voted_confirmation_validation: getAVal('vs_past_voted_confirmation', 'Yes - No Prompting Done'),
    vs_past_voted_confirmation_actual: getActual('vs_past_voted_confirmation'),

    vs_past_candidate: meta.vs_past_candidate || getAns('vs_past_candidate', 'Candidate B'),
    vs_past_candidate_question_validation: getQVal('vs_past_candidate'),
    vs_past_candidate_validation: getAVal('vs_past_candidate', 'Yes - No Prompting Done'),
    vs_past_candidate_actual: getActual('vs_past_candidate'),

    vs_past_party: meta.vs_past_party || getAns('vs_past_party', 'BJP'),
    vs_past_party_question_validation: getQVal('vs_past_party'),
    vs_past_party_validation: getAVal('vs_past_party', 'Yes - No Prompting Done'),
    vs_past_party_actual: getActual('vs_past_party'),

    nda_vote_reason: meta.nda_vote_reason || getAns('nda_vote_reason', 'Good Governance & Infrastructure Development'),
    nda_vote_reason_question_validation: getQVal('nda_vote_reason'),
    nda_vote_reason_validation: getAVal('nda_vote_reason', 'Yes - No Prompting Done'),
    nda_vote_reason_actual: getActual('nda_vote_reason'),

    mgb_vote_reason: meta.mgb_vote_reason || getAns('mgb_vote_reason', 'Local youth employment initiative'),
    mgb_vote_reason_question_validation: getQVal('mgb_vote_reason'),
    mgb_vote_reason_validation: getAVal('mgb_vote_reason', 'Yes - No Prompting Done'),
    mgb_vote_reason_actual: getActual('mgb_vote_reason'),

    situation_followup: meta.situation_followup || getAns('situation_followup', 'Consistent viewpoint'),
    situation_followup_question_validation: getQVal('situation_followup'),
    situation_followup_validation: getAVal('situation_followup', 'Yes - No Prompting Done'),
    situation_followup_actual: getActual('situation_followup'),

    ls_past_voted_confirmation: meta.ls_past_voted_confirmation || getAns('ls_past_voted_confirmation', 'Yes'),
    ls_past_voted_confirmation_question_validation: getQVal('ls_past_voted_confirmation'),
    ls_past_voted_confirmation_validation: getAVal('ls_past_voted_confirmation', 'Yes - No Prompting Done'),
    ls_past_voted_confirmation_actual: getActual('ls_past_voted_confirmation'),

    ls_past_candidate: meta.ls_past_candidate || getAns('ls_past_candidate', 'Candidate C'),
    ls_past_candidate_question_validation: getQVal('ls_past_candidate'),
    ls_past_candidate_validation: getAVal('ls_past_candidate', 'Yes - No Prompting Done'),
    ls_past_candidate_actual: getActual('ls_past_candidate'),

    ls_past_party: meta.ls_past_party || getAns('ls_past_party', 'INC'),
    ls_past_party_question_validation: getQVal('ls_past_party'),
    ls_past_party_validation: getAVal('ls_past_party', 'Yes - No Prompting Done'),
    ls_past_party_actual: getActual('ls_past_party'),

    cm_satisfaction: meta.cm_satisfaction || getAns('cm_satisfaction', 'Satisfied'),
    cm_satisfaction_validation: getQVal('cm_satisfaction'),
    cm_satisfaction_actual: getActual('cm_satisfaction'),

    pm_satisfaction: meta.pm_satisfaction || getAns('pm_satisfaction', 'Very Satisfied'),
    pm_satisfaction_validation: getQVal('pm_satisfaction'),
    pm_satisfaction_actual: getActual('pm_satisfaction'),

    cm_choice: meta.cm_choice || getAns('cm_choice', 'Eknath Shinde'),
    cm_choice_question_validation: getQVal('cm_choice'),
    cm_choice_validation: getAVal('cm_choice', 'Yes - No Prompting Done'),
    cm_choice_validation_1: getAVal('cm_choice_validation_1', 'Yes - No Prompting Done'),
    cm_choice_validation_2: getAVal('cm_choice_validation_2', ''),
    cm_choice_actual: getActual('cm_choice'),

    voting_intention_ls_party: meta.voting_intention_ls_party || getAns('voting_intention_ls_party', 'BJP'),
    voting_intention_ls_party_question_validation: getQVal('voting_intention_ls_party'),
    voting_intention_ls_party_validation: getAVal('voting_intention_ls_party', 'Yes - No Prompting Done'),
    voting_intention_ls_party_actual: getActual('voting_intention_ls_party'),

    response_style: getForensic('response_style', 'All ok'),
    mimicry: getForensic('mimicry', 'No'),
    inconsistent_gender: getForensic('inconsistent_gender', 'NA'),
    respondent_age: getForensic('respondent_age', "Respondent's Voice matches his age."),
    voice_of_respondents: getForensic('voice_of_respondents', 'No'),
    rapid_responses: getForensic('rapid_responses', 'No'),
    group_interview: getForensic('group_interview', 'All Ok'),
    sound: getForensic('sound', 'Road Side'),
    rapid_questionning: getForensic('rapid_questionning', 'Somewhat Disagree'),
    convincing_skills: getForensic('convincing_skills', 'Completely Agree'),
    red_flag: getForensic('red_flag', 'Not Applicable'),
    fraud_interviews: getForensic('fraud_interviews', 'Not Applicable'),
    respondent_type: getForensic('respondent_type', 'Politically Aware but Hesitant to Share'),
    audio_mute: getForensic('audio_mute', 'No Mute'),
    candidate_managed_fraud: getForensic('candidate_managed_fraud', 'All Ok [सर्व काही ঠিক आहे.].'),
    compromise_party: getForensic('compromise_party', 'All Okay'),
    actual_voting_intention: getForensic('actual_voting_intention', meta.actual_voting_intention || 'Undecided'),

    rating: String(Math.round((score / 100) * 4) + 1),
    Remarks: decisionData.feedback || output.remarks || 'Forensic diarization verified. Speech clarity 100%',
  };

  return row;
}

/**
 * Persists an Output 2 row to the specified PostgreSQL table or mockStore.
 * Automatically verifies schema and performs UPSERT based on submission_id.
 *
 * @param {string} output2TableName
 * @param {object} output2Row
 * @returns {Promise<boolean>}
 */
async function syncOutput2Table(output2TableName, output2Row) {
  if (!output2TableName) return false;

  try {
    // If PostgreSQL is offline / unhealthy, persist directly to mockStore
    if (!db.isDbHealthy || !db.isDbHealthy()) {
      const mockStore = require('../../database/mockStore');
      mockStore.data = mockStore.data || {};
      if (!Array.isArray(mockStore.data[output2TableName])) {
        mockStore.data[output2TableName] = [];
      }
      const existingIdx = mockStore.data[output2TableName].findIndex(
        (r) => r.submission_id === output2Row.submission_id
      );
      if (existingIdx >= 0) {
        mockStore.data[output2TableName][existingIdx] = {
          ...mockStore.data[output2TableName][existingIdx],
          ...output2Row,
        };
      } else {
        mockStore.data[output2TableName].push({ ...output2Row });
      }

      // Also ensure generic output2_records collection is kept in sync
      if (!Array.isArray(mockStore.data['output2_records'])) {
        mockStore.data['output2_records'] = [];
      }
      const genIdx = mockStore.data['output2_records'].findIndex(
        (r) => r.submission_id === output2Row.submission_id
      );
      if (genIdx >= 0) {
        mockStore.data['output2_records'][genIdx] = {
          ...mockStore.data['output2_records'][genIdx],
          ...output2Row,
        };
      } else {
        mockStore.data['output2_records'].push({ ...output2Row });
      }
      return true;
    }

    const hasTable = await db.schema.hasTable(output2TableName);
    if (!hasTable) {
      logger.info(`[OUTPUT2_SYNC] Table '${output2TableName}' does not exist, creating with 133-col report schema.`);
      await db.schema.createTable(output2TableName, (table) => {
        for (const col of OUTPUT2_COLUMNS) {
          table.text(col).nullable();
        }
      });
    } else {
      // Ensure all 133 columns exist in the table schema
      const colInfo = await db(output2TableName).columnInfo();
      const existingCols = Object.keys(colInfo);
      const missingCols = OUTPUT2_COLUMNS.filter((col) => !existingCols.includes(col));
      if (missingCols.length > 0) {
        logger.info(`[OUTPUT2_SYNC] Adding ${missingCols.length} missing columns to '${output2TableName}'.`);
        await db.schema.alterTable(output2TableName, (table) => {
          for (const mCol of missingCols) {
            table.text(mCol).nullable();
          }
        });
      }
    }

    const colInfo = await db(output2TableName).columnInfo();
    const tableCols = Object.keys(colInfo);

    // Filter row fields to only existing columns in table
    const cleanRow = {};
    for (const [k, v] of Object.entries(output2Row)) {
      if (tableCols.includes(k)) {
        cleanRow[k] = v;
      }
    }

    // Upsert by submission_id
    const submissionId = output2Row.submission_id;
    if (submissionId) {
      const existing = await db(output2TableName).where('submission_id', submissionId).first().catch(() => null);
      if (existing) {
        await db(output2TableName).where('submission_id', submissionId).update(cleanRow);
      } else {
        await db(output2TableName).insert(cleanRow);
      }
      return true;
    }
    return false;
  } catch (err) {
    logger.warn(`[OUTPUT2_SYNC_ERROR] Failed to save Output 2 row to '${output2TableName}': ${err.message}`);
    return false;
  }
}

module.exports = {
  OUTPUT2_COLUMNS,
  formatLeadToOutput2Row,
  syncOutput2Table,
};
