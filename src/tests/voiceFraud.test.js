/**
 * @file voiceFraud.test.js
 * @description Unit and Integration tests for AI Voice Fraud Detection & Biometric Speaker Verification API.
 */

const request = require('supertest');
const app = require('../app');
const { generateToken } = require('../utils/crypto');
const config = require('../config');
const mockStore = require('../database/mockStore');

jest.setTimeout(30000);

describe('AI Voice Fraud & Biometric Speaker Verification System', () => {
  let adminToken;
  let agentToken;

  const adminUser = {
    userId: '88385a13-2e1f-4f44-b761-6a0dcf6a7c5c',
    id: '88385a13-2e1f-4f44-b761-6a0dcf6a7c5c',
    email: 'admin@mastercrm.com',
    role: 'MASTER_ADMIN',
    role_name: 'MASTER_ADMIN',
    organization_id: '11111111-1111-1111-1111-111111111111',
    permissions: ['*:*'],
  };

  const agentUser = {
    userId: '66666666-6666-6666-6666-666666666605',
    id: '66666666-6666-6666-6666-666666666605',
    email: 'cati@crm.local',
    role: 'CATI_AGENT',
    role_name: 'CATI_AGENT',
    organization_id: '11111111-1111-1111-1111-111111111111',
    permissions: ['submissions:*'],
  };

  beforeAll(() => {
    const secret = config.jwt.secret || config.jwt.accessSecret;
    adminToken = generateToken(adminUser, secret, '1h');
    agentToken = generateToken(agentUser, secret, '1h');
  });

  test('1. POST /api/v1/voice-fraud/enroll registers an agent baseline voice profile', async () => {
    const res = await request(app)
      .post('/api/v1/voice-fraud/enroll')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        agentId: 'test-agent-99',
        agentName: 'Rohan Sen',
        audioUrl: '/uploads/voice-baselines/rohan_baseline.wav',
        metadata: { method: 'MIC_RECORDING', qualityScore: 95 },
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.agent_id).toBe('test-agent-99');
    expect(res.body.data.audio_url).toBe('/uploads/voice-baselines/rohan_baseline.wav');
    expect(res.body.data.embedding).toBeDefined();
    expect(res.body.data.snr_db).toBeGreaterThan(0);
  });

  test('2. GET /api/v1/voice-fraud/profiles returns all agents with baseline enrollment status', async () => {
    const res = await request(app)
      .get('/api/v1/voice-fraud/profiles')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    const rohan = res.body.data.find((p) => p.agentId === 'test-agent-99');
    expect(rohan).toBeDefined();
    expect(rohan.isEnrolled).toBe(true);
  });

  test('3. GET /api/v1/voice-fraud/profiles/:agentId retrieves single profile', async () => {
    const res = await request(app)
      .get('/api/v1/voice-fraud/profiles/test-agent-99')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.agent_name).toBe('Rohan Sen');
  });

  test('4. POST /api/v1/voice-fraud/verify flags BASELINE_VOICE_MISSING if agent is unenrolled', async () => {
    const res = await request(app)
      .post('/api/v1/voice-fraud/verify')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        leadId: 'LEAD-UNENROLLED-01',
        agentId: 'unenrolled-ghost-agent-007',
        agentName: 'Ghost Agent',
        recordingUrl: '/uploads/recordings/lead_ghost.wav',
      });

    expect(res.status).toBe(200);
    expect(res.body.data.passed).toBe(false);
    expect(res.body.data.fraudDetected).toBe(true);
    expect(res.body.data.fraudType).toBe('BASELINE_VOICE_MISSING');
    expect(res.body.data.record).toBeDefined();
    expect(res.body.data.record.status).toBe('UNDER_REVIEW');
  });

  test('5. POST /api/v1/voice-fraud/verify flags VOICE_MISMATCH when third-party proxy conducts call', async () => {
    const res = await request(app)
      .post('/api/v1/voice-fraud/verify')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        leadId: 'LEAD-PROXY-02',
        agentId: 'test-agent-99',
        recordingUrl: '/uploads/recordings/lead_proxy.wav',
        simulatedScenario: 'PROXY_MISMATCH',
      });

    expect(res.status).toBe(200);
    expect(res.body.data.passed).toBe(false);
    expect(res.body.data.fraudDetected).toBe(true);
    expect(res.body.data.fraudType).toBe('VOICE_MISMATCH');
    expect(res.body.data.similarityScore).toBeLessThan(0.70);
    expect(res.body.data.record.status).toBe('CONFIRMED_FRAUD');
  });

  test('6. POST /api/v1/voice-fraud/verify flags SELF_INTERVIEW_MIMICRY when agent changes pitch to fake respondent', async () => {
    const res = await request(app)
      .post('/api/v1/voice-fraud/verify')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        leadId: 'LEAD-MIMICRY-03',
        agentId: 'test-agent-99',
        recordingUrl: '/uploads/recordings/lead_mimicry.wav',
        simulatedScenario: 'SELF_MIMICRY',
      });

    expect(res.status).toBe(200);
    expect(res.body.data.passed).toBe(false);
    expect(res.body.data.fraudDetected).toBe(true);
    expect(res.body.data.fraudType).toBe('SELF_INTERVIEW_MIMICRY');
    expect(res.body.data.record.status).toBe('UNDER_REVIEW');
  });

  test('7. POST /api/v1/voice-fraud/verify passes authentic call with calibrated threshold (no false positive)', async () => {
    const res = await request(app)
      .post('/api/v1/voice-fraud/verify')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        leadId: 'LEAD-AUTHENTIC-04',
        agentId: 'test-agent-99',
        recordingUrl: '/uploads/recordings/lead_authentic.wav',
      });

    expect(res.status).toBe(200);
    expect(res.body.data.passed).toBe(true);
    expect(res.body.data.fraudDetected).toBe(false);
    expect(res.body.data.similarityScore).toBeGreaterThanOrEqual(0.70);
  });

  test('8. GET /api/v1/voice-fraud/records lists fraud incident records with filters', async () => {
    const res = await request(app)
      .get('/api/v1/voice-fraud/records?limit=10')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.records).toBeDefined();
    expect(res.body.data.total).toBeGreaterThan(0);
  });

  test('9. PATCH /api/v1/voice-fraud/records/:id/status updates review state', async () => {
    const recordsRes = await request(app)
      .get('/api/v1/voice-fraud/records?limit=5')
      .set('Authorization', `Bearer ${adminToken}`);

    const targetRecord = recordsRes.body.data.records[0];

    const patchRes = await request(app)
      .patch(`/api/v1/voice-fraud/records/${targetRecord.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        status: 'DISMISSED',
        notes: 'Verified manually: Background noise caused minor distortion, voice is authentic.',
      });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.success).toBe(true);
    expect(patchRes.body.data.status).toBe('DISMISSED');
    expect(patchRes.body.data.notes).toContain('Verified manually');
  });

  test('10. GET /api/v1/voice-fraud/stats computes radar metrics', async () => {
    const res = await request(app)
      .get('/api/v1/voice-fraud/stats')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.total).toBeDefined();
    expect(res.body.data.voiceMismatch).toBeDefined();
    expect(res.body.data.mimicry).toBeDefined();
    expect(res.body.data.missingBaseline).toBeDefined();
    expect(res.body.data.enrolledAgentsCount).toBeGreaterThan(0);
  });

  test('11. POST /api/v1/voice-fraud/audit-survey extracts surveyor initial voice baseline (0:00 - 0:15)', async () => {
    const res = await request(app)
      .post('/api/v1/voice-fraud/audit-survey')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        leadId: 'LEAD-FORENSIC-01',
        agentId: 'test-agent-99',
        agentName: 'Rohan Sen',
        audioUrl: '/uploads/recordings/lead_forensic_01.wav',
        metadata: { durationSec: 180 },
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const { surveyorBaseline } = res.body.data;
    expect(surveyorBaseline).toBeDefined();
    expect(surveyorBaseline.status).toBe('CAPTURED');
    expect(surveyorBaseline.segment.start).toBe('0:00');
    expect(surveyorBaseline.segment.end).toBe('0:15');
    expect(surveyorBaseline.pitchFrequencyBand).toBeDefined();
    expect(surveyorBaseline.pitchFrequencyBand.bandLabel).toBeDefined();
    expect(surveyorBaseline.timbreProfile).toBeDefined();
    expect(surveyorBaseline.timbreProfile.formants).toBeDefined();
    expect(surveyorBaseline.spectralCentroid).toBeGreaterThan(0);
    expect(surveyorBaseline.cadence).toBeDefined();
    expect(surveyorBaseline.cadence.speechRateWpm).toBeGreaterThan(0);
    expect(res.body.data.diarization).toBeDefined();
  });

  test('12. POST /api/v1/voice-fraud/audit-survey flags SELF_ANSWERING when surveyor and respondent similarity >= 82%', async () => {
    const res = await request(app)
      .post('/api/v1/voice-fraud/audit-survey')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        leadId: 'LEAD-SELF-ANSWER-02',
        agentId: 'test-agent-99',
        agentName: 'Rohan Sen',
        audioUrl: '/uploads/recordings/self_answering_call.wav',
        simulatedScenario: 'SELF_ANSWERING',
      });

    expect(res.status).toBe(200);
    expect(res.body.data.fraud_detected).toBe(true);
    expect(res.body.data.fraud_type).toBe('SELF_ANSWERING');
    expect(res.body.data.fraud_confidence).toBeGreaterThanOrEqual(82);
    expect(res.body.data.fraud_tags).toContain('FRAUD_DETECTED');
    expect(res.body.data.fraud_tags).toContain('SELF_ANSWERING');
    expect(res.body.data.fraud_reasons).toBeDefined();
    expect(res.body.data.fraud_reasons.en).toContain('Agent self-answering detected');
    expect(res.body.data.fraud_reasons.bn).toBeDefined();
    expect(res.body.data.audio_disposition).toBe('Fraudulent / Spoofed Audio Detected');
    expect(res.body.data.decision).toBe('FAIL');
  });

  test('13. POST /api/v1/voice-fraud/audit-survey flags MULTIPLE_AGENTS handover fraud', async () => {
    const res = await request(app)
      .post('/api/v1/voice-fraud/audit-survey')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        leadId: 'LEAD-MULTI-AGENT-03',
        agentId: 'test-agent-99',
        agentName: 'Rohan Sen',
        audioUrl: '/uploads/recordings/multiple_agents_call.wav',
        simulatedScenario: 'MULTIPLE_AGENTS',
      });

    expect(res.status).toBe(200);
    expect(res.body.data.fraud_detected).toBe(true);
    expect(res.body.data.fraud_type).toBe('MULTIPLE_AGENTS');
    expect(res.body.data.fraud_tags).toContain('FRAUD_DETECTED');
    expect(res.body.data.fraud_tags).toContain('MULTIPLE_AGENTS');
    expect(res.body.data.fraud_reasons.en).toContain('Multiple surveyor voices detected');
    expect(res.body.data.fraud_reasons.bn).toBeDefined();
    expect(res.body.data.audio_disposition).toBe('Fraudulent / Spoofed Audio Detected');
    expect(res.body.data.decision).toBe('FAIL');
  });

  test('14. POST /api/v1/voice-fraud/audit-survey flags AUDIO_SPOOF and NO_RESPONDENT fraud', async () => {
    const spoofRes = await request(app)
      .post('/api/v1/voice-fraud/audit-survey')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        leadId: 'LEAD-SPOOF-04',
        agentId: 'test-agent-99',
        simulatedScenario: 'AUDIO_SPOOF',
      });

    expect(spoofRes.status).toBe(200);
    expect(spoofRes.body.data.fraud_detected).toBe(true);
    expect(spoofRes.body.data.fraud_type).toBe('AUDIO_SPOOF');
    expect(spoofRes.body.data.fraud_tags).toContain('FRAUD_DETECTED');
    expect(spoofRes.body.data.fraud_tags).toContain('AUDIO_SPOOF');
    expect(spoofRes.body.data.audio_disposition).toBe('Fraudulent / Spoofed Audio Detected');
    expect(spoofRes.body.data.decision).toBe('FAIL');

    const noRespRes = await request(app)
      .post('/api/v1/voice-fraud/audit-survey')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        leadId: 'LEAD-NO-RESP-05',
        agentId: 'test-agent-99',
        simulatedScenario: 'NO_RESPONDENT',
      });

    expect(noRespRes.status).toBe(200);
    expect(noRespRes.body.data.fraud_detected).toBe(true);
    expect(noRespRes.body.data.fraud_type).toBe('NO_RESPONDENT');
    expect(noRespRes.body.data.fraud_tags).toContain('NO_RESPONDENT');
  });

  test('15. CAPI submitDecision enforces FAIL, saves [FRAUD_DETECTED] tags and fraud details', async () => {
    const capiService = require('../modules/capi/capi.service');
    const leadId = 'test-lead-capi-fraud-99';

    // Seed mockStore lead
    if (!mockStore.campaign_leads) mockStore.campaign_leads = [];
    mockStore.campaign_leads.push({
      id: leadId,
      status: 'ASSIGNED',
      tags: [],
      metadata: { respondent_name: 'Test Citizen', audio_url: '/uploads/sample.wav' },
    });

    const decisionResult = await capiService.submitDecision(
      leadId,
      {
        decision: 'PASS', // Auditor or client sent PASS, but fraud detected must FORCE FAIL
        fraud_detected: true,
        fraud_type: 'SELF_ANSWERING',
        fraud_confidence: 94,
        fraud_tags: ['FRAUD_DETECTED', 'SELF_ANSWERING'],
        fraud_reasons: {
          en: 'Agent self-answering detected: 94% voice acoustic match.',
          bn: 'সমীক্ষক নিজে উত্তর প্রদান প্রতারণা সনাক্ত হয়েছে।',
        },
        audioDisposition: 'Fraudulent / Spoofed Audio Detected',
      },
      { id: adminUser.userId, email: adminUser.email }
    );

    expect(decisionResult).toBeDefined();
    expect(decisionResult.decision).toBe('FAIL');
    expect(decisionResult.score).toBe(0);
    expect(decisionResult.fraud_detected).toBe(true);
    expect(decisionResult.fraud_tags).toContain('FRAUD_DETECTED');
    expect(decisionResult.fraud_tags).toContain('SELF_ANSWERING');

    const updatedLead = mockStore.campaign_leads.find((l) => l.id === leadId);
    expect(updatedLead.tags).toContain('[FRAUD_DETECTED]');
    expect(updatedLead.tags).toContain('SELF_ANSWERING');
    expect(updatedLead.metadata.fraud_detected).toBe(true);
    expect(updatedLead.metadata.fraud_reasons).toBeDefined();
  });

  test('16. CATI saveSubmission persists fraud tags and metadata', async () => {
    const catiService = require('../modules/field-cati/cati.service');
    const submissionId = `SUB-CATI-FRAUD-${Date.now()}`;

    const saveResult = await catiService.saveSubmission(
      submissionId,
      {
        projectId: 'PRJ-TEST-CATI',
        respondentName: 'Biplab Das',
        respondentPhone: '9830098300',
        answers: { consent: 'Yes', feedback: 'Good' },
        fraud_detected: true,
        fraud_type: 'SELF_ANSWERING',
        fraud_confidence: 94,
        fraud_tags: ['FRAUD_DETECTED', 'SELF_ANSWERING'],
        fraud_reasons: {
          en: 'Agent self-answering detected: 94% match.',
          bn: 'সমীক্ষক নিজে উত্তর প্রদান প্রতারণা সনাক্ত হয়েছে।',
        },
      },
      agentUser
    );

    expect(saveResult.success).toBe(true);
    expect(saveResult.fraud_detected).toBe(true);
    expect(saveResult.fraud_type).toBe('SELF_ANSWERING');
    expect(saveResult.fraud_tags).toContain('FRAUD_DETECTED');

    const sub = (mockStore.submissions || []).find((s) => s.submission_id === submissionId);
    if (sub) {
      const meta = typeof sub.respondent_metadata === 'string' ? JSON.parse(sub.respondent_metadata) : sub.respondent_metadata;
      expect(meta.fraud_detected).toBe(true);
      expect(meta.fraud_type).toBe('SELF_ANSWERING');
      expect(meta.fraud_tags).toContain('FRAUD_DETECTED');
    }
  });
});
