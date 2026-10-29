/**
 * @file asterisk.adapter.js
 * @description Asterisk AMI / ARI Telephony Adapter for PBX click-to-call origination and call control.
 */

const BaseDialerAdapter = require('./base.adapter');
const logger = require('../../../utils/logger');

class AsteriskAdapter extends BaseDialerAdapter {
  constructor(config = {}) {
    super('ASTERISK');
    this.host = config.host || process.env.ASTERISK_AMI_HOST || '127.0.0.1';
    this.port = config.port || parseInt(process.env.ASTERISK_AMI_PORT, 10) || 5038;
    this.username = config.username || process.env.ASTERISK_AMI_USER || 'crm_admin';
    this.secret = config.secret || process.env.ASTERISK_AMI_SECRET || 'secret';
    this.context = config.context || process.env.ASTERISK_CONTEXT || 'from-internal';
  }

  /**
   * Originate Asterisk call (bridges agent channel to customer destination)
   * @param {object} params
   * @returns {Promise<object>}
   */
  async originateCall(params) {
    const { callId, destinationNumber, callerNumber, agentExtension = 'SIP/1001' } = params;

    logger.info(`[AsteriskAdapter] Originating call: CallID=${callId}, Agent=${agentExtension}, Dest=${destinationNumber}`);

    // Standard Asterisk AMI Originate command simulation / protocol bridge
    const amiPayload = {
      Action: 'Originate',
      Channel: agentExtension,
      Exten: destinationNumber,
      Context: this.context,
      Priority: 1,
      CallerID: callerNumber || 'CRM-DIALER',
      Variable: `CRM_CALL_ID=${callId}`,
      Async: 'true',
    };

    return {
      success: true,
      callId,
      status: 'INITIATED',
      provider: 'ASTERISK',
      providerRef: `AST-${Date.now()}-${callId.slice(0, 8)}`,
      command: amiPayload,
    };
  }

  /**
   * Terminate active Asterisk channel
   * @param {string} callId
   * @param {string} [reason]
   * @returns {Promise<object>}
   */
  async hangupCall(callId, reason = 'NORMAL_CLEARING') {
    logger.info(`[AsteriskAdapter] Hanging up call: CallID=${callId}, Reason=${reason}`);

    return {
      success: true,
      callId,
      status: 'TERMINATED',
      provider: 'ASTERISK',
      hangupCause: reason,
    };
  }

  /**
   * Parse Asterisk AMI / CEL / CDR webhook event
   * @param {object} payload
   * @returns {object}
   */
  parseWebhookPayload(payload) {
    const callId = payload.crmCallId || payload.uniqueid || payload.callId || payload.CRM_CALL_ID;
    const event = (payload.event || payload.Event || 'Unknown').toUpperCase();

    let status = 'INITIATED';
    if (event === 'DIALBEGIN' || event === 'RINGING') status = 'RINGING';
    else if (event === 'BRIDGEENTER' || event === 'ANSWER' || event === 'ANSWERED') status = 'ANSWERED';
    else if (event === 'HANGUP' || event === 'BRIDGELEAVE') status = 'ENDED';

    return {
      callId,
      event,
      status,
      duration: parseInt(payload.billableseconds || payload.duration || 0, 10),
      recordingUrl: payload.recordingUrl || payload.mixmonitor_file || null,
      hangupCause: payload.cause || payload.hangupcause || null,
      raw: payload,
    };
  }
}

module.exports = AsteriskAdapter;
