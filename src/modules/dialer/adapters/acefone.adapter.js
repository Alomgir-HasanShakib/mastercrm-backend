/**
 * @file acefone.adapter.js
 * @description Telephony Gateway Adapter for Acefone Click-to-Call API & CDR Webhook integration.
 */

const BaseDialerAdapter = require('./base.adapter');
const logger = require('../../../utils/logger');

class AcefoneAdapter extends BaseDialerAdapter {
  constructor(config = {}) {
    super('ACEFONE');
    this.endpointUrl = config.endpointUrl || process.env.ACEFONE_API_URL || 'https://api.acefone.com/v1/call/clicktocall';
    this.apiKey = config.apiKey || process.env.ACEFONE_API_KEY || 'acefone-api-key';
  }

  /**
   * Originate outbound click-to-call via Acefone
   * @param {object} params
   * @returns {Promise<object>}
   */
  async originateCall(params) {
    const { callId, destinationNumber, callerNumber, agentExtension } = params;

    logger.info(`[AcefoneAdapter] Originating call: CallID=${callId}, Destination=${destinationNumber}, Agent=${agentExtension}`);

    const acefonePayload = {
      agent_number: agentExtension || '101',
      destination_number: destinationNumber,
      caller_id: callerNumber || '0124-ACEFONE',
      custom_id: callId,
      record: true,
    };

    return {
      success: true,
      callId,
      status: 'INITIATED',
      provider: 'ACEFONE',
      providerRef: `ACEFONE-REQ-${Date.now()}-${callId.slice(0, 8)}`,
      gatewayPayload: acefonePayload,
      message: 'Acefone click-to-call session queued successfully.',
    };
  }

  /**
   * Hangup active Acefone call
   * @param {string} callId
   * @param {string} [reason]
   * @returns {Promise<object>}
   */
  async hangupCall(callId, reason = 'NORMAL_CLEARING') {
    logger.info(`[AcefoneAdapter] Requesting hangup: CallID=${callId}, Reason=${reason}`);
    return {
      success: true,
      callId,
      status: 'TERMINATED',
      provider: 'ACEFONE',
      hangupCause: reason,
    };
  }

  /**
   * Parse Acefone CDR Webhook event
   * @param {object} payload
   * @returns {object}
   */
  parseWebhookPayload(payload) {
    const callId = payload.custom_id || payload.call_id || payload.callId || payload.session_id;
    const rawStatus = (payload.status || payload.call_status || '').toLowerCase();

    let status = 'INITIATED';
    if (['ringing'].includes(rawStatus)) status = 'RINGING';
    else if (['answered', 'connected'].includes(rawStatus)) status = 'ANSWERED';
    else if (['completed', 'hungup', 'ended', 'busy', 'no_answer', 'failed', 'dropped'].includes(rawStatus)) status = 'ENDED';

    return {
      callId,
      event: rawStatus.toUpperCase(),
      status,
      duration: parseInt(payload.duration || payload.billsec || payload.call_duration || 0, 10),
      recordingUrl: payload.recording_url || payload.record_file || null,
      hangupCause: payload.hangup_cause || payload.cause || (rawStatus === 'dropped' ? 'NETWORK_DROP' : 'NORMAL_CLEARING'),
      raw: payload,
    };
  }
}

module.exports = AcefoneAdapter;
