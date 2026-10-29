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
});
