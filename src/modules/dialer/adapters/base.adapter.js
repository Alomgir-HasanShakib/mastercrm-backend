/**
 * @file base.adapter.js
 * @description Base interface / abstract class for telephony dialer adapters.
 */

class BaseDialerAdapter {
  constructor(name) {
    this.name = name;
  }

  /**
   * Originate an outbound call
   * @param {object} params
   * @param {string} params.callId
   * @param {string} params.destinationNumber
   * @param {string} params.callerNumber
   * @param {string} [params.agentExtension]
   * @param {object} [params.customHeaders]
   * @returns {Promise<{ success: boolean, callId: string, status: string, providerRef?: string }>}
   */
  async originateCall(params) {
    throw new Error(`originateCall() not implemented in adapter ${this.name}`);
  }

  /**
   * Terminate / hangup active call
   * @param {string} callId
   * @param {string} [reason]
   * @returns {Promise<{ success: boolean, callId: string, status: string }>}
   */
  async hangupCall(callId, reason = 'NORMAL_CLEARING') {
    throw new Error(`hangupCall() not implemented in adapter ${this.name}`);
  }

  /**
   * Parse incoming webhook payload into standard telephony event structure
   * @param {object} payload
   * @param {object} headers
   * @returns {{ callId: string, event: string, status: string, duration?: number, recordingUrl?: string, raw: object }}
   */
  parseWebhookPayload(payload, headers = {}) {
    throw new Error(`parseWebhookPayload() not implemented in adapter ${this.name}`);
  }
}

module.exports = BaseDialerAdapter;
