/**
 * @file mock.adapter.js
 * @description Mock/Local Dev Telephony Adapter for testing click-to-call, simulated progress, and CDR generation.
 */

const BaseDialerAdapter = require('./base.adapter');
const logger = require('../../../utils/logger');

class MockAdapter extends BaseDialerAdapter {
  constructor() {
    super('MOCK');
  }

  /**
   * Originate mock call
   * @param {object} params
   * @returns {Promise<object>}
   */
  async originateCall(params) {
    const { callId, destinationNumber, callerNumber } = params;

    logger.info(`[MockAdapter] Originated mock call: CallID=${callId}, To=${destinationNumber}, From=${callerNumber}`);

    return {
      success: true,
      callId,
      status: 'INITIATED',
      provider: 'MOCK',
      providerRef: `MOCK-${Date.now()}-${callId.slice(0, 8)}`,
      simulated: true,
    };
  }

  /**
   * Terminate mock call
   * @param {string} callId
   * @param {string} [reason]
   * @returns {Promise<object>}
   */
  async hangupCall(callId, reason = 'NORMAL_CLEARING') {
    logger.info(`[MockAdapter] Hung up mock call: CallID=${callId}, Reason=${reason}`);

    return {
      success: true,
      callId,
      status: 'TERMINATED',
      provider: 'MOCK',
      hangupCause: reason,
      simulated: true,
    };
  }

  /**
   * Parse mock webhook payload
   * @param {object} payload
   * @returns {object}
   */
  parseWebhookPayload(payload) {
    const callId = payload.callId || payload.call_id || 'MOCK-SESSION-1';
    return {
      callId,
      event: (payload.event || 'ANSWERED').toUpperCase(),
      status: payload.status || 'ANSWERED',
      duration: parseInt(payload.duration || 60, 10),
      recordingUrl: payload.recordingUrl || 'https://storage.internal/recordings/mock-audio.mp3',
      hangupCause: payload.hangupCause || 'NORMAL_CLEARING',
      raw: payload,
    };
  }
}

module.exports = MockAdapter;
