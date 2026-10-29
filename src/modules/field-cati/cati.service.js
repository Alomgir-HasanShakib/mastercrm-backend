/**
 * @file cati.service.js
 * @description Core business logic for CATI - Field Survey (FIELD_CATI) module:
 * AC assignments, questionnaire manifests, question_tag response capture,
 * audio sessions and question audio segments, GPS location events, and offline auto-sync.
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { db, isDbHealthy } = require('../../database/connection');
const mockStore = require('../../database/mockStore');
const config = require('../../config');
const logger = require('../../utils/logger');
const { ValidationError } = require('../../utils/errors');
const fieldCatiModel = require('./field-cati.model');

// Ensure upload directory exists
const RECORDINGS_DIR = path.resolve(config.storage.uploadDir || 'uploads', 'recordings');
if (!fs.existsSync(RECORDINGS_DIR)) {
  fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
}

// Default standard Assembly Constituencies
const DEFAULT_ACS = [
  { id: 'AC-216', name: '216 - Kanthi Dakshin (West Bengal)', state: 'West Bengal', district: 'Purba Medinipur', quotaTarget: 1500, quotaCompleted: 1120 },
  { id: 'AC-153', name: '153 - Gopalpur (Bihar)', state: 'Bihar', district: 'Bhagalpur', quotaTarget: 1000, quotaCompleted: 842 },
  { id: 'AC-152', name: '152 - Bihpur (Bihar)', state: 'Bihar', district: 'Bhagalpur', quotaTarget: 600, quotaCompleted: 512 },
  { id: 'AC-154', name: '154 - Pirpainti (Bihar)', state: 'Bihar', district: 'Bhagalpur', quotaTarget: 700, quotaCompleted: 489 },
  { id: 'AC-155', name: '155 - Kahalgaon (Bihar)', state: 'Bihar', district: 'Bhagalpur', quotaTarget: 800, quotaCompleted: 620 },
  { id: 'AC-101', name: '101 - Varanasi Cantt (Uttar Pradesh)', state: 'Uttar Pradesh', district: 'Varanasi', quotaTarget: 2000, quotaCompleted: 1450 },
];

// Standard Field Survey Question Manifest with tags and skip conditions
const FIELD_SURVEY_QUESTIONS = [
  {
    id: 'Q_INTRO',
    code: 'introduction',
    question_tag: 'introduction',
    text: 'नमस्कार सर/मैडम, हम रिसर्च कंपनी से आए हैं। क्या मैं चुनाव एवं विकास के विषयों पर आपसे कुछ सवाल कर सकता/सकती हूँ? (Survey Introduction & Consent)',
    type: 'SINGLE_SELECT',
    required: true,
    options: [
      { label: 'Yes - Consent Given', value: 'Consent Given' },
      { label: 'Refused - Respondent Busy', value: 'Refused Busy' },
      { label: 'Refused - Not Interested', value: 'Refused Not Interested' },
    ],
    skipLogic: {
      field: 'introduction',
      operator: '!=',
      value: 'Consent Given',
      action: 'TERMINATE',
      terminateMessage: 'Respondent did not give consent. Survey terminated.',
    },
  },
  {
    id: 'Q_VOTER',
    code: 'is_registered_voter',
    question_tag: 'is_registered_voter',
    text: 'क्या आप इस विधानसभा क्षेत्र के पंजीकृत मतदाता हैं? (Registered Voter Verification)',
    type: 'SINGLE_SELECT',
    required: true,
    options: [
      { label: 'Yes (हाँ)', value: 'Yes' },
      { label: 'No (नहीं)', value: 'No' },
    ],
    skipLogic: {
      field: 'is_registered_voter',
      operator: '===',
      value: 'No',
      action: 'TERMINATE',
      terminateMessage: 'Only registered voters of this AC are eligible. Survey terminated.',
    },
  },
  {
    id: 'Q_NAME',
    code: 'respondent_name',
    question_tag: 'respondent_name',
    text: 'उत्तरदाता का पूरा नाम दर्ज करें (Respondent Full Name)',
    type: 'TEXT',
    required: true,
  },
  {
    id: 'Q_PHONE',
    code: 'phone_no',
    question_tag: 'phone_no',
    text: 'अपना मोबाइल नंबर बताएं (Mobile Number - 10 Digits)',
    type: 'TEXT',
    required: true,
  },
  {
    id: 'Q_GENDER',
    code: 'gender',
    question_tag: 'gender',
    text: 'उत्तरदाता का लिंग (Gender)',
    type: 'SINGLE_SELECT',
    required: true,
    options: [
      { label: 'Male (पुरुष)', value: 'Male' },
      { label: 'Female (महिला)', value: 'Female' },
      { label: 'Other (अन्य)', value: 'Other' },
    ],
  },
  {
    id: 'Q_AGE',
    code: 'age',
    question_tag: 'age',
    text: 'आपकी उम्र क्या है? (Age Group - 18+)',
    type: 'SINGLE_SELECT',
    required: true,
    options: [
      { label: '18-24 years', value: '18-24' },
      { label: '25-35 years', value: '25-35' },
      { label: '36-50 years', value: '36-50' },
      { label: '50+ years', value: '50+' },
    ],
  },
  {
    id: 'Q_RELIGION',
    code: 'religion',
    question_tag: 'religion',
    text: 'आपका धर्म क्या है? (Religion)',
    type: 'SINGLE_SELECT',
    required: true,
    options: [
      { label: 'Hindu (हिन्दू)', value: 'Hindu' },
      { label: 'Muslim (मुस्लिम)', value: 'Muslim' },
      { label: 'Sikh (सिख)', value: 'Sikh' },
      { label: 'Christian (ईसाई)', value: 'Christian' },
      { label: 'Others (अन्य)', value: 'Others' },
    ],
  },
  {
    id: 'Q_CASTE',
    code: 'caste',
    question_tag: 'caste',
    text: 'आप निम्न में से किस सामाजिक वर्ग / जाति के हैं? (Caste Category)',
    type: 'SINGLE_SELECT',
    required: true,
    options: [
      { label: 'General / Forward (सामान्य)', value: 'General' },
      { label: 'OBC (अन्य पिछड़ा वर्ग)', value: 'OBC' },
      { label: 'EBC / MBC (अति पिछड़ा वर्ग)', value: 'EBC' },
      { label: 'SC (अनुसूचित जाति)', value: 'SC' },
      { label: 'ST (अनुसूचित जनजाति)', value: 'ST' },
      { label: 'Minority (अल्पसंख्यक)', value: 'Minority' },
    ],
  },
  {
    id: 'Q_PROBLEMS',
    code: 'major_problems',
    question_tag: 'major_problems',
    text: 'आपके क्षेत्र की सबसे प्रमुख समस्या क्या है? (Major Issues)',
    type: 'MULTI_SELECT',
    required: true,
    options: [
      { label: 'Unemployment / Jobs (रोजगार)', value: 'Unemployment' },
      { label: 'Inflation / Price Rise (महंगाई)', value: 'Inflation' },
      { label: 'Roads & Infrastructure (सड़क व बिजली)', value: 'Roads & Infrastructure' },
      { label: 'Health & Hospitals (स्वास्थ्य व अस्पताल)', value: 'Health' },
      { label: 'Education & Schools (शिक्षा)', value: 'Education' },
      { label: 'Drinking Water & Sanitation (पीने का पानी)', value: 'Water & Sanitation' },
      { label: 'Corruption (भ्रष्टाचार)', value: 'Corruption' },
    ],
  },
  {
    id: 'Q_STATE_GOVT',
    code: 'state_govt_change',
    question_tag: 'state_govt_change',
    text: 'क्या राज्य में सरकार बदलनी चाहिए या इसी सरकार को दोबारा मौका मिलना चाहिए? (State Government Change)',
    type: 'SINGLE_SELECT',
    required: true,
    options: [
      { label: 'Current government should continue (इसी सरकार को रहना चाहिए)', value: 'Continue Current Govt' },
      { label: 'Government should change (सरकार बदलनी चाहिए)', value: 'Change Govt' },
      { label: 'Cannot say / Undecided (कह नहीं सकते)', value: 'Undecided' },
    ],
  },
  {
    id: 'Q_MLA',
    code: 'mla_choice',
    question_tag: 'mla_choice',
    text: 'विधानसभा चुनाव में आप किस पार्टी/विधायक प्रत्याशी को वोट देंगे? (MLA Choice)',
    type: 'SINGLE_SELECT',
    required: true,
    options: [
      { label: 'Incumbent Ruling Party Candidate', value: 'Ruling Party Candidate' },
      { label: 'Main Opposition Candidate', value: 'Opposition Candidate' },
      { label: 'Independent Candidate (निर्दलीय)', value: 'Independent' },
      { label: 'NOTA / None of the above', value: 'NOTA' },
      { label: 'Undecided / Secret (गोपनीय)', value: 'Undecided' },
    ],
  },
  {
    id: 'Q_CM',
    code: 'cm_choice',
    question_tag: 'cm_choice',
    text: 'मुख्यमंत्री के रूप में आपकी पहली पसंद कौन है? (CM Choice)',
    type: 'SINGLE_SELECT',
    required: true,
    options: [
      { label: 'Current Chief Minister', value: 'Current CM' },
      { label: 'Opposition Leader', value: 'Opposition Leader' },
      { label: 'Alternative Coalition Leader', value: 'Alternative Leader' },
      { label: 'Anyone from Alliance', value: 'Anyone Alliance' },
      { label: 'No Preference / Others', value: 'Others' },
    ],
  },
  {
    id: 'Q_VOTING_PARTY',
    code: 'voting_intention_vs_party',
    question_tag: 'voting_intention_vs_party',
    text: 'विधानसभा चुनाव में आपकी पार्टी वोटिंग पसंद क्या होगी? (Voting Intention Party)',
    type: 'SINGLE_SELECT',
    required: true,
    options: [
      { label: 'BJP', value: 'BJP' },
      { label: 'INC / Congress', value: 'INC' },
      { label: 'State Regional Party A', value: 'Regional Party A' },
      { label: 'State Regional Party B', value: 'Regional Party B' },
      { label: 'Independent / Others', value: 'Others' },
      { label: 'Undecided', value: 'Undecided' },
    ],
  },
];

const catiService = {
  /**
   * Retrieves assigned ACs, active project, and dynamic questionnaire manifest for the surveyor.
   * @route GET /api/v1/cati/assignments
   *
   * @param {object} user - Authenticated user
   * @param {object} [tenantContext={}] - Tenant context
   * @returns {Promise<object>}
   */
  async getAssignments(user, tenantContext = {}) {
    await fieldCatiModel.init();

    // Fetch projects
    let project = null;
    let acList = DEFAULT_ACS;

    if (isDbHealthy()) {
      try {
        const dbProject = await db('projects')
          .where({ status: 'ACTIVE' })
          .orderBy('created_at', 'desc')
          .first();
        if (dbProject) {
          project = dbProject;
        }

        // Check if there are assignments in field_assignments for this user
        if (user && user.id) {
          const userAssignments = await db('field_assignments')
            .where({ surveyor_id: user.id })
            .select('*');
          if (userAssignments && userAssignments.length > 0) {
            acList = userAssignments.map((a) => ({
              id: a.ac_id || a.assignment_code,
              name: `${a.ac_id || a.assignment_code} - Target: ${a.target_quota || 1000}`,
              quotaTarget: a.target_quota || 1000,
              quotaCompleted: a.completed_count || 0,
              district: a.pc_id || 'Assigned District',
            }));
          }
        }
      } catch (err) {
        logger.warn('Error reading projects/assignments from db, using fallback:', { error: err.message });
      }
    }

    if (!project) {
      project = mockStore.projects ? mockStore.projects[0] : {
        id: '44444444-4444-4444-4444-444444444441',
        name: 'Field CATI General Assembly Survey 2026',
        project_code: 'FIELD_CATI_2026',
      };
    }

    return {
      surveyor: {
        id: user?.id || user?.userId || 'unknown-surveyor',
        name: `${user?.first_name || 'Field'} ${user?.last_name || 'Agent'}`.trim(),
        role: user?.role || 'CATI_AGENT',
        vendorId: user?.vendor_id || null,
        organizationId: user?.organization_id || null,
      },
      project: {
        id: project.id,
        name: project.name,
        code: project.project_code || project.code || 'FIELD_CATI',
        status: project.status || 'ACTIVE',
      },
      constituencies: acList,
      questionnaire: {
        version: 'v2.4-field-cati',
        totalQuestions: FIELD_SURVEY_QUESTIONS.length,
        questions: FIELD_SURVEY_QUESTIONS,
      },
      voiceKyc: {
        required: false,
        samplePhrase: 'I confirm my identity as surveyor for Master CRM field survey operations.',
      },
      offlineSettings: {
        autoSyncIntervalSeconds: 60,
        maxOfflineRecords: 500,
        chunkDurationSeconds: 15,
      },
    };
  },

  /**
   * Saves a completed or in-progress field survey submission with question tags and responses.
   * @route POST /api/v1/cati/submissions/:id
   *
   * @param {string} submissionId
   * @param {object} payload
   * @param {object} user
   * @returns {Promise<object>}
   */
  async saveSubmission(submissionId, payload, user) {
    await fieldCatiModel.init();

    if (!submissionId) {
      throw new ValidationError('submissionId is required');
    }

    const {
      projectId,
      vendorId,
      stateId,
      acId,
      acName,
      answers = {},
      responses = {},
      gps = null,
      questionTimestamps = [],
      startedAt,
      completedAt,
      respondentName,
      respondentPhone,
    } = payload;

    const mergedAnswers = { ...answers, ...responses };
    let resolvedProjectId = projectId;
    const resolvedVendorId = vendorId || user?.vendor_id || null;
    const resolvedAgentId = user?.id || user?.userId || null;
    const resolvedRespondentName = respondentName || mergedAnswers.respondent_name || mergedAnswers.full_name || 'Respondent';
    const resolvedRespondentPhone = respondentPhone || mergedAnswers.phone_no || mergedAnswers.phone || null;

    if (isDbHealthy()) {
      try {
        const validProj = await db('projects').where({ id: resolvedProjectId }).first();
        if (!validProj) {
          const firstProj = await db('projects').first();
          if (firstProj) resolvedProjectId = firstProj.id;
        }
      } catch (e) {}
    }

    const submissionData = {
      submission_id: submissionId,
      project_id: resolvedProjectId,
      vendor_id: resolvedVendorId,
      state_id: stateId || acId || 'AC-DEFAULT',
      source_channel: 'FIELD_CATI',
      source_agent_id: resolvedAgentId,
      source_status: 'SUBMITTED',
      capi_status: 'PENDING',
      super_audit_status: 'PENDING',
      tvc_status: 'QUEUED',
      fa_status: 'PENDING',
      respondent_name: resolvedRespondentName,
      respondent_phone: resolvedRespondentPhone,
      geography_data: JSON.stringify({
        acId: acId || 'AC-DEFAULT',
        acName: acName || 'Constituency',
        gps: gps || null,
      }),
      respondent_metadata: JSON.stringify(mergedAnswers),
      started_at: startedAt ? new Date(startedAt) : new Date(),
      completed_at: completedAt ? new Date(completedAt) : new Date(),
      created_at: new Date(),
      updated_at: new Date(),
    };

    let savedSubmissionRecord = null;

    if (isDbHealthy()) {
      try {
        // Upsert into submissions table
        const existing = await db('submissions').where({ submission_id: submissionId }).first();
        if (existing) {
          await db('submissions').where({ submission_id: submissionId }).update(submissionData);
          savedSubmissionRecord = { ...existing, ...submissionData };
        } else {
          const [inserted] = await db('submissions').insert({
            id: uuidv4(),
            ...submissionData,
          }).returning('*');
          savedSubmissionRecord = inserted;
        }

        const internalSubId = savedSubmissionRecord?.id || submissionId;

        // Save responses into both submission_responses and submission_values
        const responseEntries = Object.entries(mergedAnswers);
        for (const [tag, val] of responseEntries) {
          const stringVal = typeof val === 'object' ? JSON.stringify(val) : String(val ?? '');

          // Insert into submission_responses
          await db('submission_responses').insert({
            id: uuidv4(),
            submission_id: internalSubId,
            question_tag: tag,
            response_value: stringVal,
            response_metadata: JSON.stringify({ captured_via: 'FIELD_CATI' }),
            answered_at: new Date(),
            created_at: new Date(),
          }).onConflict(['submission_id', 'question_tag']).merge().catch(async () => {
            // fallback plain insert
            await db('submission_responses').insert({
              id: uuidv4(),
              submission_id: internalSubId,
              question_tag: tag,
              response_value: stringVal,
            }).catch(() => {});
          });

          // Insert into submission_values
          try {
            await db('submission_values').insert({
              id: uuidv4(),
              submission_id: submissionId,
              question_tag: tag,
              response_value: stringVal,
              response_metadata: JSON.stringify({}),
              answered_at: new Date(),
              created_at: new Date(),
            });
          } catch (valErr) {
            // table might be created or ignored
          }
        }

        // Save GPS event in agent_location_events
        if (gps && gps.latitude && gps.longitude) {
          try {
            await db('agent_location_events').insert({
              id: uuidv4(),
              surveyor_id: resolvedAgentId,
              submission_id: submissionId,
              project_id: resolvedProjectId,
              latitude: gps.latitude,
              longitude: gps.longitude,
              accuracy: gps.accuracy || null,
              speed: gps.speed || null,
              altitude: gps.altitude || null,
              battery_level: gps.batteryLevel || null,
              network_type: gps.networkType || '4G',
              is_mock_location: !!gps.isMock,
              recorded_at: new Date(),
              created_at: new Date(),
            });
          } catch (gpsErr) {
            logger.warn('Could not insert agent_location_events:', { error: gpsErr.message });
          }
        }

        // Save question audio segments
        if (Array.isArray(questionTimestamps) && questionTimestamps.length > 0) {
          try {
            for (const seg of questionTimestamps) {
              await db('question_audio_segments').insert({
                id: uuidv4(),
                submission_id: submissionId,
                question_tag: seg.question_tag || seg.tag || 'general',
                start_time_seconds: parseFloat(seg.start_time_seconds || seg.start || 0),
                end_time_seconds: parseFloat(seg.end_time_seconds || seg.end || 0),
                audio_url: seg.audio_url || null,
                created_at: new Date(),
              });
            }
          } catch (segErr) {
            logger.warn('Could not insert question_audio_segments:', { error: segErr.message });
          }
        }

        // Initialize pending CAPI Audit record for the CAPI Auditor
        try {
          const hasCapiAudits = await db.schema.hasTable('capi_audits');
          if (hasCapiAudits) {
            const existingAudit = await db('capi_audits').where({ submission_id: internalSubId }).first();
            if (!existingAudit) {
              const auditId = uuidv4();
              await db('capi_audits').insert({
                id: auditId,
                submission_id: internalSubId,
                project_id: resolvedProjectId,
                vendor_id: resolvedVendorId,
                status: 'PENDING',
                audio_status: 'PRESENT',
                gps_lat: gps?.latitude || null,
                gps_lng: gps?.longitude || null,
                gps_accuracy: gps?.accuracy || null,
                created_at: new Date(),
                updated_at: new Date(),
              });

              // Add audit items for each question tag
              const hasItems = await db.schema.hasTable('capi_audit_items');
              if (hasItems) {
                for (const [tag, val] of responseEntries) {
                  await db('capi_audit_items').insert({
                    id: uuidv4(),
                    capi_audit_id: auditId,
                    question_tag: tag,
                    original_value: typeof val === 'object' ? JSON.stringify(val) : String(val ?? ''),
                    status: 'PENDING',
                    created_at: new Date(),
                    updated_at: new Date(),
                  });
                }
              }
            }
          }
        } catch (auditInitErr) {
          logger.warn('Could not initialize capi_audit row:', { error: auditInitErr.message });
        }
      } catch (dbErr) {
        logger.error('DB error during saveSubmission, falling back to mockStore:', { error: dbErr.message });
      }
    }

    // In-memory fallback
    if (!savedSubmissionRecord) {
      savedSubmissionRecord = {
        id: uuidv4(),
        ...submissionData,
      };
      if (mockStore.submissions) {
        const existingIdx = mockStore.submissions.findIndex((s) => s.submission_id === submissionId);
        if (existingIdx !== -1) {
          savedSubmissionRecord.id = mockStore.submissions[existingIdx].id;
          mockStore.submissions[existingIdx] = savedSubmissionRecord;
        } else {
          mockStore.submissions.unshift(savedSubmissionRecord);
        }
      }
      if (mockStore.submission_values) {
        mockStore.submission_values = mockStore.submission_values.filter((v) => v.submission_id !== submissionId);
      }
      for (const [tag, val] of Object.entries(mergedAnswers)) {
        const item = {
          id: uuidv4(),
          submission_id: submissionId,
          question_tag: tag,
          response_value: typeof val === 'object' ? JSON.stringify(val) : String(val ?? ''),
          created_at: new Date(),
        };
        if (mockStore.submission_values) mockStore.submission_values.push(item);
      }
    }

    return {
      success: true,
      submissionId,
      status: 'SUBMITTED',
      sourceChannel: 'FIELD_CATI',
      totalAnswersCaptured: Object.keys(mergedAnswers).length,
      savedAt: new Date().toISOString(),
    };
  },

  /**
   * Uploads and stores the audio recording for a survey submission.
   * Creates audio_session, updates submissions/capi_audits audio URL, and saves segments.
   * @route POST /api/v1/cati/submissions/:id/audio
   *
   * @param {string} submissionId
   * @param {object} fileObj - Multer file object or parsed buffer
   * @param {object} meta - Audio metadata (duration, segments, etc.)
   * @param {object} user - Authenticated user
   * @returns {Promise<object>}
   */
  async uploadAudio(submissionId, fileObj, meta = {}, user) {
    await fieldCatiModel.init();

    if (!submissionId) {
      throw new ValidationError('submissionId is required');
    }

    let buffer = null;
    let originalName = 'recording.webm';
    let mimeType = 'audio/webm';

    if (fileObj && fileObj.buffer) {
      buffer = fileObj.buffer;
      originalName = fileObj.originalname || originalName;
      mimeType = fileObj.mimetype || mimeType;
    } else if (meta.audioBase64) {
      buffer = Buffer.from(meta.audioBase64, 'base64');
      mimeType = meta.mimeType || 'audio/webm';
    } else {
      throw new ValidationError('No audio file or audioBase64 provided');
    }

    // Validate audio file size
    const MAX_AUDIO_SIZE = 50 * 1024 * 1024; // 50MB limit
    if (buffer.length > MAX_AUDIO_SIZE) {
      throw new ValidationError(`Audio file size (${(buffer.length / 1024 / 1024).toFixed(1)}MB) exceeds maximum limit of 50MB.`);
    }

    // Validate MIME type
    const normalizedMime = (mimeType || '').toLowerCase().trim();
    const hasAudioExt = /\.(webm|wav|mp3|ogg|m4a|aac)$/i.test(originalName);
    const isAllowedMime = normalizedMime.startsWith('audio/') || 
      ['audio/webm', 'audio/wav', 'audio/wave', 'audio/x-wav', 'audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/mp4', 'audio/aac', 'video/webm'].includes(normalizedMime) ||
      (normalizedMime === 'application/octet-stream' && hasAudioExt);
    if (!isAllowedMime) {
      throw new ValidationError(`Security validation failed: Invalid audio file format '${mimeType}'. Only audio recordings are permitted.`);
    }

    // Determine extension
    const ext = normalizedMime.includes('wav') ? '.wav' : normalizedMime.includes('mp3') || normalizedMime.includes('mpeg') ? '.mp3' : '.webm';
    const fileName = `${submissionId.replace(/[^a-zA-Z0-9_-]/g, '_')}_${Date.now()}${ext}`;
    const filePath = path.join(RECORDINGS_DIR, fileName);

    // Save to disk
    fs.writeFileSync(filePath, buffer);

    const storageUrl = `/uploads/recordings/${fileName}`;
    const durationSeconds = parseInt(meta.duration || meta.durationSeconds || 0, 10);
    const resolvedAgentId = user?.id || user?.userId || null;
    const resolvedProjectId = meta.projectId || null;

    // Insert audio_session
    const audioSessionId = uuidv4();
    const sessionData = {
      id: audioSessionId,
      submission_id: submissionId,
      project_id: resolvedProjectId,
      surveyor_id: resolvedAgentId,
      storage_path: filePath,
      storage_url: storageUrl,
      duration_seconds: durationSeconds,
      file_size_bytes: buffer.length,
      mime_type: mimeType,
      status: 'COMPLETED',
      created_at: new Date(),
      updated_at: new Date(),
    };

    if (isDbHealthy()) {
      try {
        await db('audio_sessions').insert(sessionData).catch(() => {});

        // Update submissions table with audio_url
        await db('submissions')
          .where({ submission_id: submissionId })
          .update({
            respondent_metadata: db.raw("COALESCE(respondent_metadata, '{}'::jsonb) || ?", [
              JSON.stringify({ audio_url: storageUrl, duration_seconds: durationSeconds }),
            ]),
            updated_at: new Date(),
          })
          .catch(() => {});

        // Update capi_audits with audio_url
        const submissionRow = await db('submissions').where({ submission_id: submissionId }).first();
        if (submissionRow) {
          await db('capi_audits')
            .where({ submission_id: submissionRow.id })
            .update({
              audio_url: storageUrl,
              audio_duration: durationSeconds,
              audio_status: 'PRESENT',
              updated_at: new Date(),
            })
            .catch(() => {});
        }

        // Save question audio segments
        let segments = meta.questionTimestamps || meta.segments || [];
        if (typeof segments === 'string') {
          try { segments = JSON.parse(segments); } catch (e) {}
        }
        if (Array.isArray(segments) && segments.length > 0) {
          for (const seg of segments) {
            await db('question_audio_segments').insert({
              id: uuidv4(),
              submission_id: submissionId,
              question_tag: seg.question_tag || seg.tag || 'general',
              start_time_seconds: parseFloat(seg.start_time_seconds || seg.start || 0),
              end_time_seconds: parseFloat(seg.end_time_seconds || seg.end || 0),
              audio_url: storageUrl,
              created_at: new Date(),
            }).catch(() => {});
          }
        }
      } catch (dbErr) {
        logger.warn('DB error inserting audio_sessions, mock store fallback:', { error: dbErr.message });
      }
    }

    if (mockStore.audio_sessions) {
      mockStore.audio_sessions.push(sessionData);
    }

    // Autonomously evaluate AI fraud & quality pipeline on uploaded audio
    try {
      const aiService = require('../ai/ai.service');
      aiService.triggerAutonomousAudit({
        submissionId,
        audioUrl: storageUrl,
        agentId: resolvedAgentId,
        projectId: resolvedProjectId,
        duration: durationSeconds,
      }).catch((e) => logger.warn('Async autonomous AI audit error:', { error: e.message }));
    } catch (e) {
      // non-blocking
    }

    return {
      success: true,
      audioSessionId,
      submissionId,
      storageUrl,
      durationSeconds,
      fileSizeBytes: buffer.length,
      uploadedAt: new Date().toISOString(),
    };
  },

  /**
   * Idempotently synchronizes multiple surveys completed offline.
   * @route POST /api/v1/cati/sync
   *
   * @param {object} payload - Batch sync payload containing submissions, audio, and GPS events
   * @param {object} user - Authenticated surveyor
   * @returns {Promise<object>}
   */
  async syncOfflineSubmissions(payload, user) {
    const { submissions = [], audioChunks = [], gpsEvents = [] } = payload;
    const syncedIds = [];
    const errors = [];

    for (const sub of submissions) {
      try {
        const subId = sub.submissionId || sub.submission_id || sub.id;
        await this.saveSubmission(subId, sub, user);

        // If sub has audio data embedded
        if (sub.audioBase64 || sub.audioUrl) {
          if (sub.audioBase64) {
            await this.uploadAudio(subId, null, {
              audioBase64: sub.audioBase64,
              duration: sub.duration || sub.callDuration || 0,
              questionTimestamps: sub.questionTimestamps || [],
            }, user);
          }
        }

        syncedIds.push(subId);
      } catch (err) {
        errors.push({ id: sub.submissionId, error: err.message });
      }
    }

    // Save GPS events in batch if present
    if (Array.isArray(gpsEvents) && gpsEvents.length > 0 && isDbHealthy()) {
      try {
        for (const ev of gpsEvents) {
          await db('agent_location_events').insert({
            id: uuidv4(),
            surveyor_id: user?.id || user?.userId || null,
            submission_id: ev.submissionId || null,
            latitude: ev.latitude,
            longitude: ev.longitude,
            accuracy: ev.accuracy || null,
            speed: ev.speed || null,
            altitude: ev.altitude || null,
            battery_level: ev.batteryLevel || null,
            network_type: ev.networkType || '4G',
            recorded_at: ev.timestamp ? new Date(ev.timestamp) : new Date(),
            created_at: new Date(),
          }).catch(() => {});
        }
      } catch (gpsBatchErr) {
        logger.warn('Error saving offline gpsEvents:', { error: gpsBatchErr.message });
      }
    }

    return {
      success: true,
      totalReceived: submissions.length,
      syncedCount: syncedIds.length,
      failedCount: errors.length,
      syncedIds,
      errors,
      serverTime: new Date().toISOString(),
    };
  },
};

module.exports = catiService;
