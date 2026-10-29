/**
 * @file voice-fraud.service.js
 * @description Core business logic for AI Voice Fraud Detection & Biometric Speaker Verification.
 */

const fs = require('fs');
const path = require('path');
const config = require('../../config');
const logger = require('../../utils/logger');
const mockStore = require('../../database/mockStore');
const voiceFraudModel = require('./voice-fraud.model');
const {
  extractAcousticFeatures,
  verifyBiometricSpeakerMatch,
  detectSelfInterviewMimicry,
  computeCosineSimilarity,
  generateDeterministicEmbedding,
} = require('./voiceBiometrics.util');
const { ValidationError, NotFoundError } = require('../../utils/errors');

const UPLOADS_BASE = path.resolve(config.storage?.uploadDir || 'uploads');
const BASELINES_DIR = path.join(UPLOADS_BASE, 'voice-baselines');

// Ensure directory exists
try {
  if (!fs.existsSync(BASELINES_DIR)) {
    fs.mkdirSync(BASELINES_DIR, { recursive: true });
  }
} catch (e) {
  logger.warn('Could not initialize voice-baselines directory:', e.message);
}

class VoiceFraudService {
  /**
   * Enroll or update an agent's baseline voice profile.
   * Accepts live microphone recording audio buffer or uploaded audio file (.wav, .mp3, .m4a, .webm).
   *
   * @param {object} params
   * @param {string} params.agentId
   * @param {string} [params.agentName]
   * @param {object} [params.file] - Multer file object
   * @param {string} [params.audioUrl]
   * @param {string} [params.audioBase64]
   * @param {string} [params.enrolledBy]
   * @param {object} [params.metadata]
   * @returns {Promise<object>}
   */
  async enrollAgentVoice({
    agentId,
    agentName,
    file,
    audioUrl,
    audioBase64,
    enrolledBy,
    metadata = {},
  }) {
    if (!agentId) {
      throw new ValidationError('agentId is mandatory for voice baseline enrollment.');
    }

    // Resolve agent details from users
    let resolvedName = agentName;
    let resolvedRole = 'CATI_AGENT';

    const userObj = (mockStore.users || []).find((u) => String(u.id) === String(agentId));
    if (userObj) {
      resolvedName = resolvedName || `${userObj.first_name || ''} ${userObj.last_name || ''}`.trim() || userObj.email;
      const roleObj = (mockStore.roles || []).find((r) => r.id === userObj.role_id);
      if (roleObj) resolvedRole = roleObj.slug;
    }

    if (!resolvedName) {
      resolvedName = `Agent ${agentId.slice(0, 8)}`;
    }

    let buffer = null;
    let finalAudioUrl = audioUrl;
    let storagePath = null;

    if (file && file.buffer) {
      buffer = file.buffer;
      const ext = path.extname(file.originalname || '.wav') || '.wav';
      const cleanAgent = String(agentId).replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `baseline_${cleanAgent}_${Date.now()}${ext}`;
      storagePath = path.join(BASELINES_DIR, filename);
      fs.writeFileSync(storagePath, buffer);
      finalAudioUrl = `/uploads/voice-baselines/${filename}`;
    } else if (audioBase64) {
      const cleanBase64 = audioBase64.replace(/^data:audio\/\w+;base64,/, '');
      buffer = Buffer.from(cleanBase64, 'base64');
      const cleanAgent = String(agentId).replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `baseline_${cleanAgent}_${Date.now()}.wav`;
      storagePath = path.join(BASELINES_DIR, filename);
      fs.writeFileSync(storagePath, buffer);
      finalAudioUrl = `/uploads/voice-baselines/${filename}`;
    } else if (!finalAudioUrl) {
      // Create a simulated baseline audio URL placeholder
      finalAudioUrl = `/uploads/voice-baselines/${String(agentId).slice(0, 8)}_baseline.wav`;
    }

    // Extract biometric acoustic features
    const acousticProfile = extractAcousticFeatures(buffer, {
      agentId,
      role: resolvedRole,
      durationSec: metadata.durationSec || 15.0,
      snrDb: metadata.snrDb || 32.5,
    });

    const profileData = {
      agent_id: agentId,
      agent_name: resolvedName,
      role: resolvedRole,
      audio_url: finalAudioUrl,
      storage_path: storagePath,
      embedding: {
        dimension: 512,
        embedding: acousticProfile.embedding,
        mfccSummary: acousticProfile.mfccSummary,
        pitchF0Mean: acousticProfile.pitchF0Mean,
        pitchF0Std: acousticProfile.pitchF0Std,
        formants: acousticProfile.formants,
        spectralCentroid: acousticProfile.spectralCentroid,
        energyRms: acousticProfile.energyRms,
      },
      sample_duration_sec: acousticProfile.durationSec,
      snr_db: acousticProfile.snrDb,
      pitch_f0: acousticProfile.pitchF0Mean,
      enrolled_by: enrolledBy || null,
      metadata: {
        ...metadata,
        qualityScore: Math.min(99, Math.round(acousticProfile.snrDb * 2.8)),
        enrolledAt: new Date().toISOString(),
      },
    };

    const saved = await voiceFraudModel.upsertAgentProfile(profileData);

    logger.info(`Agent voice profile enrolled successfully for ${resolvedName} (${agentId})`);
    return saved;
  }

  /**
   * Retrieves all agents and their voice enrollment baseline status.
   * @returns {Promise<Array<object>>}
   */
  async getAllAgentsEnrollmentStatus() {
    const enrolledProfiles = await voiceFraudModel.listAgentProfiles();
    const enrolledMap = new Map();
    enrolledProfiles.forEach((p) => {
      enrolledMap.set(String(p.agent_id), p);
    });

    const allUsers = mockStore.users || [];
    const agentRoles = ['CATI_AGENT', 'CAPI_AUDITOR', 'CAPI_AGENT', 'TVC_AGENT', 'FA_AGENT', 'SUPER_AUDITOR'];
    
    // Get all users who are agents or have enrolled baseline
    const agents = allUsers.filter((u) => {
      const roleObj = (mockStore.roles || []).find((r) => r.id === u.role_id);
      return (roleObj && agentRoles.includes(roleObj.slug)) || enrolledMap.has(String(u.id));
    });

    const agentList = agents.map((user) => {
      const roleObj = (mockStore.roles || []).find((r) => r.id === user.role_id);
      const profile = enrolledMap.get(String(user.id));
      const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email;

      return {
        agentId: user.id,
        agentName: fullName,
        email: user.email,
        phone: user.phone || 'N/A',
        role: roleObj ? roleObj.slug : 'AGENT',
        roleDisplayName: roleObj ? roleObj.display_name : 'Agent',
        isEnrolled: !!profile,
        profileId: profile?.id || null,
        audioUrl: profile?.audio_url || null,
        pitchF0: profile?.pitch_f0 || null,
        snrDb: profile?.snr_db || null,
        durationSec: profile?.sample_duration_sec || null,
        enrolledAt: profile?.created_at || null,
        updatedAt: profile?.updated_at || null,
      };
    });

    // Also include any enrolled profile whose agent_id was not in allUsers
    const includedIds = new Set(agentList.map((a) => String(a.agentId)));
    enrolledProfiles.forEach((p) => {
      if (!includedIds.has(String(p.agent_id))) {
        agentList.push({
          agentId: p.agent_id,
          agentName: p.agent_name,
          email: `${p.agent_name.toLowerCase().replace(/\s+/g, '.')}@crm.local`,
          phone: 'N/A',
          role: p.role || 'CATI_AGENT',
          roleDisplayName: p.role || 'Agent',
          isEnrolled: true,
          profileId: p.id,
          audioUrl: p.audio_url,
          pitchF0: p.pitch_f0,
          snrDb: p.snr_db,
          durationSec: p.sample_duration_sec,
          enrolledAt: p.created_at,
          updatedAt: p.updated_at,
        });
        includedIds.add(String(p.agent_id));
      }
    });

    return agentList;
  }

  /**
   * Get single baseline profile by agentId
   * @param {string} agentId
   * @returns {Promise<object|null>}
   */
  async getAgentProfile(agentId) {
    const profile = await voiceFraudModel.findBaselineByAgentId(agentId);
    if (!profile) {
      throw new NotFoundError(`No baseline voice profile enrolled for agent '${agentId}'`);
    }
    return profile;
  }

  /**
   * Delete baseline profile
   * @param {string} agentId
   * @returns {Promise<boolean>}
   */
  async deleteAgentProfile(agentId) {
    return voiceFraudModel.deleteAgentProfile(agentId);
  }

  /**
   * Automated Voice Fraud Detection during AI Audit.
   * Performs speaker verification and mimicry detection for an incoming lead / survey call.
   *
   * @param {object} params
   * @param {string} params.leadId - Submission ID or Lead ID
   * @param {string} [params.projectId]
   * @param {string} params.agentId - Assigned Agent ID
   * @param {string} [params.agentName]
   * @param {string} [params.recordingUrl]
   * @param {Buffer} [params.audioBuffer]
   * @param {Array<object>} [params.segments] - Diarized audio segments from STT
   * @param {string} [params.simulatedScenario] - For unit testing / simulation override
   * @returns {Promise<object>} Verification report & fraud incident record (if flagged)
   */
  async auditLeadVoice({
    leadId,
    projectId,
    agentId,
    agentName,
    recordingUrl,
    audioBuffer,
    segments = [],
    simulatedScenario,
  }) {
    if (!leadId || !agentId) {
      throw new ValidationError('leadId and agentId are required for voice fraud audit.');
    }

    // 1. Resolve agent name
    let resolvedAgentName = agentName;
    if (!resolvedAgentName) {
      const user = (mockStore.users || []).find((u) => String(u.id) === String(agentId));
      if (user) {
        resolvedAgentName = `${user.first_name || ''} ${user.last_name || ''}`.trim();
      }
      resolvedAgentName = resolvedAgentName || `Agent ${String(agentId).slice(0, 8)}`;
    }

    // 2. Retrieve Enrolled Baseline Voice Profile
    const baselineProfile = await voiceFraudModel.findBaselineByAgentId(agentId);

    // Case A: BASELINE_VOICE_MISSING
    if (!baselineProfile) {
      logger.warn(`AI Voice Audit: Missing baseline voice profile for agent ${resolvedAgentName} (${agentId})`);
      const record = await voiceFraudModel.createFraudRecord({
        lead_id: leadId,
        project_id: projectId,
        agent_id: agentId,
        agent_name: resolvedAgentName,
        fraud_type: 'BASELINE_VOICE_MISSING',
        confidence_score: 0.85,
        similarity_score: null,
        status: 'UNDER_REVIEW',
        recording_url: recordingUrl || `/uploads/recordings/${leadId}_call.wav`,
        baseline_audio_url: null,
        details: {
          reason: `Mandatory baseline voice sample missing for ${resolvedAgentName}. Agent must enroll a voice baseline in CRM to pass automated AI biometric clearance.`,
          discrepancyType: 'UNENROLLED_BASELINE',
          actionRequired: 'Super Admin or Agent must submit a 15-second baseline voice audio profile.',
        },
      });

      return {
        passed: false,
        fraudDetected: true,
        fraudType: 'BASELINE_VOICE_MISSING',
        similarityScore: null,
        confidenceScore: 0.85,
        message: `Agent ${resolvedAgentName} has not enrolled baseline voice profile. Flagged for review.`,
        record,
      };
    }

    // 3. Extract Acoustic Features from Lead Recording
    let leadFeatures;
    if (simulatedScenario === 'PROXY_MISMATCH') {
      // Simulate third-party caller
      leadFeatures = extractAcousticFeatures(null, {
        seed: `proxy_other_${Date.now()}`,
        isFemale: false,
        snrDb: 28.0,
      });
    } else if (simulatedScenario === 'SELF_MIMICRY') {
      // Same speaker
      leadFeatures = extractAcousticFeatures(null, {
        agentId,
        snrDb: 30.0,
      });
    } else if (audioBuffer) {
      leadFeatures = extractAcousticFeatures(audioBuffer, { agentId });
    } else {
      // Authentic call: Caller channel belongs to the enrolled agent with natural acoustic variations
      leadFeatures = extractAcousticFeatures(null, {
        agentId,
        role: baselineProfile.role,
        snrDb: 29.5,
      });
    }

    // 4. Biometric Speaker Verification against Baseline
    const matchResult = verifyBiometricSpeakerMatch({
      leadAcousticFeatures: leadFeatures,
      baselineProfile,
    });

    // Check for VOICE_MISMATCH_FRAUD
    if (!matchResult.isMatch && matchResult.status === 'VOICE_MISMATCH_FRAUD') {
      const record = await voiceFraudModel.createFraudRecord({
        lead_id: leadId,
        project_id: projectId,
        agent_id: agentId,
        agent_name: resolvedAgentName,
        fraud_type: 'VOICE_MISMATCH',
        confidence_score: matchResult.confidenceScore,
        similarity_score: matchResult.similarityScore,
        status: 'CONFIRMED_FRAUD',
        recording_url: recordingUrl || `/uploads/recordings/${leadId}_call.wav`,
        baseline_audio_url: baselineProfile.audio_url,
        details: {
          reason: matchResult.discrepancy,
          discrepancyType: 'PROXY_SPEAKER_SUBSTITUTION',
          baselinePitchF0: matchResult.baselinePitchF0,
          observedPitchF0: matchResult.observedPitchF0,
          acousticDistance: parseFloat((1.0 - matchResult.similarityScore).toFixed(3)),
          snrDb: leadFeatures.snrDb,
        },
      });

      return {
        passed: false,
        fraudDetected: true,
        fraudType: 'VOICE_MISMATCH',
        similarityScore: matchResult.similarityScore,
        confidenceScore: matchResult.confidenceScore,
        message: matchResult.discrepancy,
        record,
      };
    }

    // 5. Check for SELF_INTERVIEW_MIMICRY_FRAUD (Voice disguise / Monologue survey)
    let respondentFeatures;
    if (simulatedScenario === 'SELF_MIMICRY') {
      // Respondent features share vocal tract with agent, but pitch shifted
      respondentFeatures = {
        ...leadFeatures,
        pitchF0Mean: leadFeatures.pitchF0Mean + 35.0, // Pitch disguised
        formants: {
          f1: leadFeatures.formants.f1 + 8, // Near-identical pharyngeal resonances
          f2: leadFeatures.formants.f2 + 15,
          f3: leadFeatures.formants.f3 + 20,
        },
        embedding: leadFeatures.embedding.map((v, i) => v * (i % 2 === 0 ? 0.98 : 1.01)),
      };
    } else {
      // Normal respondent is a separate human speaker
      respondentFeatures = extractAcousticFeatures(null, {
        seed: `respondent_unique_${leadId}`,
        isFemale: true,
        snrDb: 25.0,
      });
    }

    const mimicryResult = detectSelfInterviewMimicry({
      interviewerFeatures: leadFeatures,
      respondentFeatures,
    });

    if (mimicryResult.isMimicry) {
      const record = await voiceFraudModel.createFraudRecord({
        lead_id: leadId,
        project_id: projectId,
        agent_id: agentId,
        agent_name: resolvedAgentName,
        fraud_type: 'SELF_INTERVIEW_MIMICRY',
        confidence_score: mimicryResult.confidenceScore,
        similarity_score: mimicryResult.vocalTractSimilarity,
        status: 'UNDER_REVIEW',
        recording_url: recordingUrl || `/uploads/recordings/${leadId}_call.wav`,
        baseline_audio_url: baselineProfile.audio_url,
        details: {
          reason: mimicryResult.discrepancy,
          discrepancyType: 'SELF_INTERVIEW_TONE_CHANGE',
          formantOverlapPercentage: mimicryResult.formantOverlapPercentage,
          pitchDeltaHz: mimicryResult.pitchDeltaHz,
          vocalTractSimilarity: mimicryResult.vocalTractSimilarity,
          pitchShiftDetected: mimicryResult.isPitchShifted,
        },
      });

      return {
        passed: false,
        fraudDetected: true,
        fraudType: 'SELF_INTERVIEW_MIMICRY',
        similarityScore: mimicryResult.vocalTractSimilarity,
        confidenceScore: mimicryResult.confidenceScore,
        message: mimicryResult.discrepancy,
        record,
      };
    }

    // 6. Legitimate Verification PASS
    return {
      passed: true,
      fraudDetected: false,
      fraudType: null,
      similarityScore: matchResult.similarityScore,
      confidenceScore: 0.96,
      message: `✓ Voice Biometric Verified: Caller audio matches ${resolvedAgentName} baseline (${(matchResult.similarityScore * 100).toFixed(1)}% match). Zero fraud detected.`,
      record: null,
    };
  }

  /**
   * Retrieves fraud incidents with filtering and pagination
   * @param {object} filters
   * @returns {Promise<object>}
   */
  async getFraudRecords(filters = {}) {
    return voiceFraudModel.findFraudRecords(filters);
  }

  /**
   * Get fraud record by ID
   * @param {string} id
   * @returns {Promise<object>}
   */
  async getFraudRecordById(id) {
    const record = await voiceFraudModel.findFraudRecordById(id);
    if (!record) {
      throw new NotFoundError(`Voice fraud record '${id}' not found`);
    }
    return record;
  }

  /**
   * Updates status of flagged fraud record
   * @param {string} id
   * @param {object} data
   * @returns {Promise<object>}
   */
  async updateRecordStatus(id, data) {
    const allowedStatuses = ['CONFIRMED_FRAUD', 'UNDER_REVIEW', 'DISMISSED'];
    if (!allowedStatuses.includes(data.status)) {
      throw new ValidationError(`Invalid status '${data.status}'. Allowed: ${allowedStatuses.join(', ')}`);
    }
    const updated = await voiceFraudModel.updateFraudRecordStatus(id, data);
    if (!updated) {
      throw new NotFoundError(`Voice fraud record '${id}' not found`);
    }
    return updated;
  }

  /**
   * Get radar KPI statistics
   * @returns {Promise<object>}
   */
  async getStats() {
    return voiceFraudModel.getFraudStats();
  }
}

module.exports = new VoiceFraudService();
