/**
 * @file voice-fraud.controller.js
 * @description Controller for AI Voice Fraud Detection & Biometric Speaker Verification API endpoints.
 */

const voiceFraudService = require('./voice-fraud.service');
const { success } = require('../../utils/response');
const auditLogService = require('../audit-log/audit-log.service');

class VoiceFraudController {
  /**
   * Enroll or update agent voice baseline profile
   * POST /api/v1/voice-fraud/enroll
   */
  async enroll(req, res, next) {
    try {
      const agentId = req.body.agentId || req.body.agent_id || req.user?.id;
      const agentName = req.body.agentName || req.body.agent_name;
      const audioUrl = req.body.audioUrl || req.body.audio_url;
      const audioBase64 = req.body.audioBase64 || req.body.audio_base64;
      const metadata = req.body.metadata ? (typeof req.body.metadata === 'string' ? JSON.parse(req.body.metadata) : req.body.metadata) : {};

      const profile = await voiceFraudService.enrollAgentVoice({
        agentId,
        agentName,
        file: req.file,
        audioUrl,
        audioBase64,
        enrolledBy: req.user?.id || req.user?.userId,
        metadata,
      });

      // Audit log
      try {
        await auditLogService.createAuditLog({
          userId: req.user?.id,
          organizationId: req.tenantContext?.organizationId,
          action: 'VOICE_BASELINE_ENROLLED',
          entityType: 'agent_voice_profiles',
          entityId: profile.id,
          module: 'voice-fraud',
          newValues: { agentId, agentName: profile.agent_name, audioUrl: profile.audio_url },
        });
      } catch (_) {}

      return success(res, profile, 'Agent baseline voice enrolled successfully', 201);
    } catch (err) {
      return next(err);
    }
  }

  /**
   * Get all agents baseline enrollment status
   * GET /api/v1/voice-fraud/profiles
   */
  async getProfiles(req, res, next) {
    try {
      const profiles = await voiceFraudService.getAllAgentsEnrollmentStatus();
      return success(res, profiles, 'Agent voice enrollment statuses retrieved successfully');
    } catch (err) {
      return next(err);
    }
  }

  /**
   * Get single agent baseline profile
   * GET /api/v1/voice-fraud/profiles/:agentId
   */
  async getProfile(req, res, next) {
    try {
      const profile = await voiceFraudService.getAgentProfile(req.params.agentId);
      return success(res, profile, 'Agent baseline voice profile retrieved successfully');
    } catch (err) {
      return next(err);
    }
  }

  /**
   * Delete agent baseline profile
   * DELETE /api/v1/voice-fraud/profiles/:agentId
   */
  async deleteProfile(req, res, next) {
    try {
      await voiceFraudService.deleteAgentProfile(req.params.agentId);
      return success(res, { deleted: true }, 'Agent baseline voice profile deleted successfully');
    } catch (err) {
      return next(err);
    }
  }

  /**
   * Automated / On-demand verification of a lead
   * POST /api/v1/voice-fraud/verify
   */
  async verifyLeadVoice(req, res, next) {
    try {
      const {
        leadId,
        lead_id,
        projectId,
        project_id,
        agentId,
        agent_id,
        agentName,
        agent_name,
        recordingUrl,
        recording_url,
        simulatedScenario,
      } = req.body;

      const result = await voiceFraudService.auditLeadVoice({
        leadId: leadId || lead_id,
        projectId: projectId || project_id,
        agentId: agentId || agent_id,
        agentName: agentName || agent_name,
        recordingUrl: recordingUrl || recording_url,
        audioBuffer: req.file ? req.file.buffer : null,
        simulatedScenario,
      });

      return success(res, result, result.message || 'Voice verification completed');
    } catch (err) {
      return next(err);
    }
  }

  /**
   * Get fraud records
   * GET /api/v1/voice-fraud/records
   */
  async getRecords(req, res, next) {
    try {
      const data = await voiceFraudService.getFraudRecords(req.query);
      return success(res, data, 'Voice fraud records retrieved successfully');
    } catch (err) {
      return next(err);
    }
  }

  /**
   * Get fraud record by ID
   * GET /api/v1/voice-fraud/records/:id
   */
  async getRecordById(req, res, next) {
    try {
      const record = await voiceFraudService.getFraudRecordById(req.params.id);
      return success(res, record, 'Voice fraud record retrieved successfully');
    } catch (err) {
      return next(err);
    }
  }

  /**
   * Update fraud record status
   * PATCH /api/v1/voice-fraud/records/:id/status
   */
  async updateRecordStatus(req, res, next) {
    try {
      const { status, notes } = req.body;
      const updated = await voiceFraudService.updateRecordStatus(req.params.id, {
        status,
        notes,
        resolved_by: req.user?.id || req.user?.userId,
      });

      // Audit log
      try {
        await auditLogService.createAuditLog({
          userId: req.user?.id,
          organizationId: req.tenantContext?.organizationId,
          action: 'VOICE_FRAUD_RECORD_UPDATED',
          entityType: 'voice_fraud_records',
          entityId: req.params.id,
          module: 'voice-fraud',
          newValues: { status, notes },
        });
      } catch (_) {}

      return success(res, updated, 'Voice fraud record status updated successfully');
    } catch (err) {
      return next(err);
    }
  }

  /**
   * Get fraud statistics
   * GET /api/v1/voice-fraud/stats
   */
  async getStats(req, res, next) {
    try {
      const stats = await voiceFraudService.getStats();
      return success(res, stats, 'Voice fraud statistics retrieved successfully');
    } catch (err) {
      return next(err);
    }
  }
}

module.exports = new VoiceFraudController();
