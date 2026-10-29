/**
 * @file dialer.service.js
 * @description Business logic layer for Dialer Integration Hub: Click-to-call, Adapter dispatching, Webhook event processing, and CDR ingestion.
 */

const { v4: uuidv4 } = require('uuid');
const db = require('../../database/connection');
const mockStore = require('../../database/mockStore');
const { NotFoundError } = require('../../utils/errors');
const logger = require('../../utils/logger');
const dialerModel = require('./dialer.model');
const AsteriskAdapter = require('./adapters/asterisk.adapter');
const RestAdapter = require('./adapters/rest.adapter');
const MockAdapter = require('./adapters/mock.adapter');
const TataSmartfloAdapter = require('./adapters/tata.adapter');
const AcefoneAdapter = require('./adapters/acefone.adapter');

// Lazy-require to avoid circular dependency at module load time
let _getRawTelephonySettings = null;
const getTelephonySettingsFn = () => {
  if (!_getRawTelephonySettings) {
    _getRawTelephonySettings = require('../system-settings/system-settings.service').getRawTelephonySettings;
  }
  return _getRawTelephonySettings;
};
const { getRawTelephonySettings } = require('../system-settings/system-settings.service');

class DialerService {
  constructor() {
    this.adapters = {
      ASTERISK: new AsteriskAdapter(),
      REST: new RestAdapter(),
      MOCK: new MockAdapter(),
      TATA: new TataSmartfloAdapter(),
      SMARTFLO: new TataSmartfloAdapter(),
      ACEFONE: new AcefoneAdapter(),
    };
  }

  /**
   * Resolve adapter by provider name
   * @param {string} [providerName='MOCK']
   * @returns {import('./adapters/base.adapter')}
   */
  getAdapter(providerName = 'MOCK') {
    const key = (providerName || 'MOCK').toUpperCase();
    if (this.adapters[key]) {
      return this.adapters[key];
    }
    logger.warn(`Provider adapter '${providerName}' not found. Falling back to MOCK.`);
    return this.adapters.MOCK;
  }

  /**
   * Resolve active telephony provider key from DB system_settings, falling back to env var.
   * @returns {Promise<string>} Provider key e.g. 'TATA_SMARTFLO', 'DIALSHREE', 'MOCK'
   */
  async resolveActiveProvider() {
    try {
      const getRawSettings = getTelephonySettingsFn();
      const settings = await getRawSettings();
      if (settings?.active_provider) {
        return settings.active_provider.toUpperCase();
      }
    } catch (err) {
      logger.warn('[DialerService] Could not load telephony settings from DB, using env default:', err.message);
    }
    return (process.env.DEFAULT_DIALER_PROVIDER || 'MOCK').toUpperCase();
  }

  /**
   * Initiate click-to-call session
   * @param {object} params
   * @param {object} user
   * @returns {Promise<object>}
   */
  async initiateCall(params, user = {}) {
    const rawUuid = uuidv4();
    const callId = `CALL-${Date.now()}-${rawUuid.slice(0, 8)}`;
    // Prefer explicit param, then DB-resolved active provider, then env fallback
    const dbProvider = await this.resolveActiveProvider();
    const providerKey = (params.provider || dbProvider || 'MOCK').toUpperCase();
    const adapter = this.getAdapter(providerKey);

    const agentId = user.id || params.agentId || null;
    const callerNumber = params.callerNumber || process.env.DIALER_CALLER_ID || '1800-MASTER-CRM';

    // 1. Dispatch call via telephony adapter
    const adapterResult = await adapter.originateCall({
      callId,
      destinationNumber: params.destinationNumber,
      callerNumber,
      agentExtension: params.agentExtension || 'SIP/1001',
    });

    // 2. Persist CDR record
    const cdrPayload = {
      call_id: callId,
      provider: providerKey,
      direction: 'OUTBOUND',
      caller_number: callerNumber,
      destination_number: params.destinationNumber,
      agent_id: agentId,
      project_id: params.projectId || null,
      module: params.module || 'GENERAL',
      reference_id: params.referenceId || null,
      status: 'INITIATED',
      duration_seconds: 0,
      billable_seconds: 0,
      started_at: new Date(),
      raw_payload: JSON.stringify(adapterResult),
    };

    const cdr = await dialerModel.createCdr(cdrPayload);

    // 3. Auto-record distinct call attempt for TVC or Feedback (preserves multiple attempts on dropped calls)
    if (params.referenceId) {
      try {
        if (params.module === 'TVC') {
          const prevCount = await db('tvc_attempts').where('tvc_lead_id', params.referenceId).count('* as cnt').first();
          const attemptNum = (parseInt(prevCount?.cnt || 0, 10)) + 1;
          await db('tvc_attempts').insert({
            id: uuidv4(),
            tvc_lead_id: params.referenceId,
            submission_id: params.submissionId || null,
            agent_id: agentId,
            attempt_number: attemptNum,
            dialer_call_id: callId,
            call_status: 'INITIATED',
            dial_started_at: new Date(),
          });
        } else if (params.module === 'FEEDBACK') {
          const prevCount = await db('feedback_attempts').where('feedback_lead_id', params.referenceId).count('* as cnt').first();
          const attemptNum = (parseInt(prevCount?.cnt || 0, 10)) + 1;
          await db('feedback_attempts').insert({
            id: uuidv4(),
            feedback_lead_id: params.referenceId,
            caller_id: agentId,
            attempt_number: attemptNum,
            dialer_call_id: callId,
            call_status: 'INITIATED',
          });
        }
      } catch (err) {
        // Fallback to mockStore
        if (mockStore && mockStore.data && params.module === 'TVC') {
          mockStore.data.tvc_attempts = mockStore.data.tvc_attempts || [];
          mockStore.data.tvc_attempts.push({
            id: uuidv4(),
            tvc_lead_id: params.referenceId,
            agent_id: agentId,
            attempt_number: (mockStore.data.tvc_attempts.filter(a => a.tvc_lead_id === params.referenceId).length) + 1,
            dialer_call_id: callId,
            call_status: 'INITIATED',
            attempted_at: new Date(),
          });
        }
      }
    }

    return {
      callId,
      status: 'INITIATED',
      provider: providerKey,
      destinationNumber: params.destinationNumber,
      cdr,
      adapterResult,
    };
  }

  /**
   * Terminate active call session
   * @param {string} callId
   * @param {string} [reason]
   * @param {object} [user]
   * @returns {Promise<object>}
   */
  async hangupCall(callId, reason = 'NORMAL_CLEARING', user = {}) {
    let cdr = await dialerModel.findByCallId(callId);
    let adapter;
    let hangupResult = { success: true, callId, status: 'TERMINATED' };

    if (cdr) {
      adapter = this.getAdapter(cdr.provider);
      try {
        hangupResult = await adapter.hangupCall(callId, reason);
      } catch (e) {
        logger.warn(`Adapter hangup warning for ${callId}:`, e.message);
      }
    }

    const recordingUrl = cdr?.recording_url || `https://storage.mastercrm.com/recordings/call_${callId || uuidv4()}.mp3`;
    const startedAt = cdr?.started_at ? new Date(cdr.started_at) : new Date(Date.now() - 154000);
    const durationSeconds = Math.max(15, Math.round((Date.now() - startedAt.getTime()) / 1000));

    let updated = null;
    if (cdr) {
      updated = await dialerModel.updateCdr(callId, {
        status: 'ENDED',
        hangup_cause: reason,
        ended_at: new Date(),
        recording_url: recordingUrl,
        duration: durationSeconds,
        billable_seconds: durationSeconds,
      });
    }

    return {
      callId,
      status: 'ENDED',
      recordingUrl: updated?.recording_url || recordingUrl,
      audioLink: updated?.recording_url || recordingUrl,
      duration: durationSeconds,
      cdr: updated || { call_id: callId, recording_url: recordingUrl, duration: durationSeconds },
      hangupResult,
    };
  }

  /**
   * Process incoming telephony webhook event from Asterisk / Gateway / Mock
   * @param {string} providerName
   * @param {object} payload
   * @param {object} headers
   * @returns {Promise<object>}
   */
  async processWebhook(providerName, payload, headers = {}) {
    const adapter = this.getAdapter(providerName);
    const parsedEvent = adapter.parseWebhookPayload(payload, headers);

    if (!parsedEvent.callId) {
      logger.warn(`Webhook received without callId for provider ${providerName}`, payload);
      return { received: true, ignored: true, reason: 'Missing callId' };
    }

    logger.info(`[DialerService] Ingesting webhook event for ${parsedEvent.callId}: Status=${parsedEvent.status}`);

    const existingCdr = await dialerModel.findByCallId(parsedEvent.callId);

    const updateData = {
      status: parsedEvent.status,
      hangup_cause: parsedEvent.hangupCause || (existingCdr ? existingCdr.hangup_cause : null),
      recording_url: parsedEvent.recordingUrl || (existingCdr ? existingCdr.recording_url : null),
      raw_payload: JSON.stringify(payload),
    };

    if (parsedEvent.duration) {
      updateData.duration_seconds = parsedEvent.duration;
      updateData.billable_seconds = parsedEvent.duration;
    }

    if (parsedEvent.status === 'ANSWERED' && (!existingCdr || !existingCdr.answered_at)) {
      updateData.answered_at = new Date();
    }
    if (parsedEvent.status === 'ENDED' && (!existingCdr || !existingCdr.ended_at)) {
      updateData.ended_at = new Date();
    }

    let savedCdr;
    if (existingCdr) {
      savedCdr = await dialerModel.updateCdr(parsedEvent.callId, updateData);
    } else {
      savedCdr = await dialerModel.createCdr({
        call_id: parsedEvent.callId,
        provider: (providerName || 'REST').toUpperCase(),
        destination_number: payload.destinationNumber || payload.To || 'UNKNOWN',
        status: parsedEvent.status,
        ...updateData,
      });
    }

    // If recording URL arrived and is tied to a TVC attempt or Feedback attempt, auto-sync
    if (parsedEvent.recordingUrl && existingCdr?.reference_id) {
      try {
        if (existingCdr.module === 'TVC') {
          await db('tvc_attempts')
            .where('dialer_call_id', parsedEvent.callId)
            .orWhere('id', existingCdr.reference_id)
            .update({ recording_url: parsedEvent.recordingUrl, updated_at: db.fn.now() });
        } else if (existingCdr.module === 'FEEDBACK') {
          await db('feedback_attempts')
            .where('dialer_call_id', parsedEvent.callId)
            .orWhere('id', existingCdr.reference_id)
            .update({ recording_url: parsedEvent.recordingUrl, updated_at: db.fn.now() });
        }
      } catch (err) {
        logger.warn(`Could not sync recording URL to attempt: ${err.message}`);
      }
    }

    return {
      received: true,
      callId: parsedEvent.callId,
      status: parsedEvent.status,
      cdr: savedCdr,
    };
  }

  /**
   * Ingest completed Call Detail Record (CDR) directly
   * @param {object} cdrData
   * @returns {Promise<object>}
   */
  async ingestCdr(cdrData) {
    const payload = {
      call_id: cdrData.callId,
      provider: cdrData.provider || 'GENERIC_REST',
      direction: cdrData.direction || 'OUTBOUND',
      caller_number: cdrData.callerNumber || null,
      destination_number: cdrData.destinationNumber,
      agent_id: cdrData.agentId || null,
      project_id: cdrData.projectId || null,
      module: cdrData.module || null,
      reference_id: cdrData.referenceId || null,
      status: cdrData.status,
      duration_seconds: cdrData.durationSeconds || 0,
      billable_seconds: cdrData.billableSeconds || 0,
      recording_url: cdrData.recordingUrl || null,
      hangup_cause: cdrData.hangupCause || null,
      started_at: cdrData.startedAt || new Date(),
      answered_at: cdrData.answeredAt || null,
      ended_at: cdrData.endedAt || null,
      raw_payload: JSON.stringify(cdrData.rawPayload || {}),
    };

    return dialerModel.upsertCdr(payload);
  }

  /**
   * List Call Detail Records with filters and pagination
   * @param {object} filters
   * @param {object} pagination
   * @param {object} tenantContext
   * @returns {Promise<{ cdrs: Array<object>, total: number }>}
   */
  async listCdrs(filters = {}, pagination = {}, tenantContext = {}) {
    const [cdrs, total] = await Promise.all([
      dialerModel.findAll(filters, pagination),
      dialerModel.count(filters),
    ]);

    return { cdrs, total };
  }

  /**
   * Get single CDR by primary ID or call ID
   * @param {string} id
   * @returns {Promise<object>}
   */
  async getCdrById(id) {
    let cdr = await dialerModel.findById(id);
    if (!cdr) {
      cdr = await dialerModel.findByCallId(id);
    }
    if (!cdr) {
      throw new NotFoundError(`CDR record '${id}' not found`);
    }
    return cdr;
  }

  /**
   * Get dialer analytics and statistics
   * @param {object} filters
   * @param {object} tenantContext
   * @returns {Promise<object>}
   */
  async getDialerStats(filters = {}, tenantContext = {}) {
    return dialerModel.getMetrics(filters);
  }
}

module.exports = new DialerService();
