/**
 * @file ai.controller.js
 * @description Request handlers for AI Orchestration: triggering AI audits, fetching evidence, voice KYC enrollment & verification, risk evaluations, and conversational turns.
 */

const { success } = require('../../utils/response');
const aiService = require('./ai.service');
const aiAuditService = require('./aiAudit.service');
const auditLogService = require('../audit-log/audit-log.service');

const aiController = {
  /**
   * Trigger AI audit on a survey submission
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async triggerAudit(req, res, next) {
    try {
      const { submissionId } = req.params;
      const options = {
        audioUrl: req.body.audioUrl,
        language: req.body.language,
        strictness: req.body.strictness,
        forceReprocess: req.body.forceReprocess,
        metadata: req.body.metadata,
      };

      const result = await aiService.triggerAudit(submissionId, options);

      // Audit trail
      await auditLogService.createAuditLog({
        userId: req.user?.id,
        organizationId: req.tenantContext?.organizationId,
        action: 'AI_AUDIT_TRIGGERED',
        entityType: 'submissions',
        entityId: submissionId,
        module: 'ai',
        newValues: {
          auditId: result.audit?.id,
          riskLevel: result.audit?.risk_level,
          routingDecision: result.audit?.routing_decision,
          overallScore: result.audit?.overall_score,
        },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return success(
        res,
        result,
        result.cached ? 'AI audit retrieved from cache' : 'AI audit executed successfully',
        result.cached ? 200 : 201
      );
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Retrieve AI audit results, audio segments, and fraud evidence for a submission
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async getAudit(req, res, next) {
    try {
      const { submissionId } = req.params;
      const data = await aiService.getAuditBySubmissionId(submissionId);
      return success(res, data, 'AI audit details and evidence retrieved successfully');
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Register or update an enumerator / user Voice KYC reference profile
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async enrollVoice(req, res, next) {
    try {
      const { userId, sampleAudioUrl, fullName, role, metadata } = req.body;
      const profile = await aiService.enrollVoiceProfile({
        userId,
        sampleAudioUrl,
        fullName,
        role,
        metadata,
      });

      await auditLogService.createAuditLog({
        userId: req.user?.id,
        organizationId: req.tenantContext?.organizationId,
        action: 'VOICE_KYC_ENROLLED',
        entityType: 'users',
        entityId: userId,
        module: 'ai',
        newValues: {
          profileId: profile.id,
          status: profile.status,
          snrDb: profile.sample_snr_db,
        },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return success(res, profile, 'Voice KYC profile enrolled successfully', 201);
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Perform voice verification against enrolled reference profile
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async verifyVoice(req, res, next) {
    try {
      const { userId, audioUrl, confidenceThreshold } = req.body;
      const verification = await aiService.verifyVoiceProfile({
        userId,
        audioUrl,
        confidenceThreshold,
      });

      await auditLogService.createAuditLog({
        userId: req.user?.id,
        organizationId: req.tenantContext?.organizationId,
        action: 'VOICE_KYC_VERIFIED',
        entityType: 'users',
        entityId: userId,
        module: 'ai',
        newValues: {
          isVerified: verification.isVerified,
          confidenceScore: verification.confidenceScore,
        },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return success(res, verification, 'Voice verification completed');
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Fetch fraud risk evaluation and signal breakdown for a submission
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async getRiskEvaluation(req, res, next) {
    try {
      const { submissionId } = req.params;
      const auditData = await aiService.getAuditBySubmissionId(submissionId);

      const responsePayload = {
        submissionId,
        riskEvaluation: auditData.riskEvaluation,
        signals: auditData.signals,
        riskLevel: auditData.audit?.risk_level,
        aggregateRiskScore: auditData.audit?.aggregate_risk_score,
        routingDecision: auditData.audit?.routing_decision,
      };

      return success(res, responsePayload, 'Fraud risk evaluation retrieved successfully');
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Execute an AI TVC conversational turn
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async handleTvcTurn(req, res, next) {
    try {
      const turnResult = await aiService.processTvcTurn({
        conversationId: req.body.conversationId,
        submissionId: req.body.submissionId,
        leadId: req.body.leadId,
        userInput: req.body.userInput,
        turnNumber: req.body.turnNumber,
        context: req.body.context,
      });

      return success(res, turnResult, 'AI TVC turn processed successfully');
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Execute an AI Field Agent (FA) feedback conversational turn
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async handleFaTurn(req, res, next) {
    try {
      const turnResult = await aiService.processFaTurn({
        conversationId: req.body.conversationId,
        submissionId: req.body.submissionId,
        leadId: req.body.leadId,
        userInput: req.body.userInput,
        turnNumber: req.body.turnNumber,
        context: req.body.context,
      });

      return success(res, turnResult, 'AI FA turn processed successfully');
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Retrieve active AI voice fraud signals
   */
  async getFraudSignals(req, res, next) {
    try {
      const signals = await aiService.getFraudSignals(req.query);
      return success(res, signals, 'AI fraud signals retrieved successfully');
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Update administrative action on a fraud signal
   */
  async updateFraudSignalAction(req, res, next) {
    try {
      const { signalId } = req.params;
      const { action } = req.body;
      const updated = await aiService.updateFraudSignalAction(signalId, action, req.user?.id);

      await auditLogService.createAuditLog({
        userId: req.user?.id,
        organizationId: req.tenantContext?.organizationId,
        action: 'VOICE_FRAUD_SIGNAL_ACTION',
        entityType: 'fraud_signals',
        entityId: signalId,
        module: 'ai',
        newValues: {
          action,
          status: updated.status,
          signalType: updated.type,
          agentId: updated.agentId,
        },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return success(res, updated, `Signal action '${action}' applied successfully`);
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Retrieve all enrolled voice KYC profiles
   */
  async getVoiceProfiles(req, res, next) {
    try {
      const profiles = await aiService.getVoiceProfiles(req.query);
      return success(res, profiles, 'Enrolled voice profiles retrieved successfully');
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Simulate Best-Case or Worst-Case AI Voice Fraud scenario
   */
  async simulateScenario(req, res, next) {
    try {
      const { scenarioType } = req.body;
      const result = await aiService.simulateScenario(scenarioType, req.user?.id);

      await auditLogService.createAuditLog({
        userId: req.user?.id,
        organizationId: req.tenantContext?.organizationId,
        action: 'AI_FRAUD_SCENARIO_SIMULATED',
        entityType: 'ai_simulation',
        entityId: result.signal?.id || 'BEST_CASE',
        module: 'ai',
        newValues: { scenarioType, message: result.message },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return success(res, result, result.message, 201);
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Activate Emergency Manual Override (7 PM IST Bypass)
   */
  async activateEmergencyOverride(req, res, next) {
    try {
      const { durationMinutes = 30, duration = null } = req.body || {};
      const chosenDuration = duration || durationMinutes;
      const status = await aiAuditService.activateEmergencyOverride({
        durationMinutes: chosenDuration,
        activatedBy: req.user?.email || req.user?.name || 'Administrator',
      });

      await auditLogService.createAuditLog({
        userId: req.user?.id,
        organizationId: req.tenantContext?.organizationId,
        action: 'AI_AUDIT_EMERGENCY_OVERRIDE_ACTIVATED',
        entityType: 'ai_audit_scheduler',
        entityId: 'emergency_override',
        module: 'ai',
        newValues: status,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return success(res, status, `Emergency Manual Override activated for ${status.durationMinutes} minutes.`);
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Cancel Emergency Manual Override
   */
  async cancelEmergencyOverride(req, res, next) {
    try {
      const status = await aiAuditService.cancelEmergencyOverride();

      await auditLogService.createAuditLog({
        userId: req.user?.id,
        organizationId: req.tenantContext?.organizationId,
        action: 'AI_AUDIT_EMERGENCY_OVERRIDE_CANCELLED',
        entityType: 'ai_audit_scheduler',
        entityId: 'emergency_override',
        module: 'ai',
        newValues: { active: false },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return success(res, status, 'Emergency Manual Override cancelled successfully.');
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Get Emergency Manual Override status
   */
  async getEmergencyOverrideStatus(req, res, next) {
    try {
      const status = aiAuditService.getEmergencyOverrideStatus();
      return success(res, status, 'Emergency Manual Override status retrieved');
    } catch (err) {
      return next(err);
    }
  },
};

module.exports = aiController;
