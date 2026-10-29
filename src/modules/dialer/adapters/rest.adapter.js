/**
 * @file rest.adapter.js
 * @description Generic REST-based Telephony Gateway Adapter (e.g. Twilio, Vicidial REST, Cloud PBX).
 */

const BaseDialerAdapter = require('./base.adapter');
const logger = require('../../../utils/logger');

class RestAdapter extends BaseDialerAdapter {
  constructor(config = {}) {
    super('REST');
    this.endpointUrl = config.endpointUrl || process.env.DIALER_REST_URL || 'https://api.telephony-provider.internal/v1';
    this.apiKey = config.apiKey || process.env.DIALER_API_KEY || 'test-key';
  }

  /**
   * Originate outbound call via REST Telephony Gateway
   * @param {object} params
   * @returns {Promise<object>}
   */
  async originateCall(params) {
    const { callId, destinationNumber, callerNumber, agentExtension } = params;

    logger.info(`[RestAdapter] Dispatching REST click-to-call: CallID=${callId}, To=${destinationNumber}, From=${callerNumber}`);

    // Emulate / dispatch REST API post to gateway
    return {
      success: true,
      callId,
      status: 'INITIATED',
      provider: 'REST',
      providerRef: `REST-REQ-${Date.now()}-${callId.slice(0, 8)}`,
      gatewayUrl: this.endpointUrl,
    };
  }

  /**
   * Terminate active call via REST gateway
   * @param {string} callId
   * @param {string} [reason]
   * @returns {Promise<object>}
   */
  async hangupCall(callId, reason = 'NORMAL_CLEARING') {
    logger.info(`[RestAdapter] Dispatching REST hangup: CallID=${callId}, Reason=${reason}`);

    return {
      success: true,
      callId,
      status: 'TERMINATED',
      provider: 'REST',
      hangupCause: reason,
    };
  }

  /**
   * Parse generic REST provider webhook event
   * @param {object} payload
   * @returns {object}
   */
  parseWebhookPayload(payload) {
    const callId = payload.callId || payload.call_id || payload.CallSid || payload.session_id;
    const rawStatus = (payload.status || payload.CallStatus || payload.event || '').toLowerCase();

    let status = 'INITIATED';
    if (['ringing', 'in-progress'].includes(rawStatus)) status = 'RINGING';
    else if (['answered', 'connected'].includes(rawStatus)) status = 'ANSWERED';
    else if (['completed', 'hungup', 'ended', 'busy', 'no-answer', 'failed'].includes(rawStatus)) status = 'ENDED';

    return {
      callId,
      event: rawStatus.toUpperCase(),
      status,
      duration: parseInt(payload.duration || payload.CallDuration || payload.duration_seconds || 0, 10),
      recordingUrl: payload.recordingUrl || payload.RecordingUrl || payload.recording_url || null,
      hangupCause: payload.hangupCause || payload.disconnect_reason || null,
      raw: payload,
    };
  }
}

module.exports = RestAdapter;
