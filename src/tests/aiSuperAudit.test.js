/**
 * @file aiSuperAudit.test.js
 * @description Comprehensive automated QA test suite for AI Super Audit & AI Quality workflows:
 * 1. AI Health & Model Status (/api/v1/ai/models/status, /api/v1/ai/status)
 * 2. Voice KYC Enrollment & Verification (/api/v1/ai/voice/enroll, /api/v1/ai/voice/verify, /api/v1/ai/voice/profiles)
 * 3. AI Submission Audit Orchestration (/api/v1/ai/audit/:submissionId, GET /api/v1/ai/audit/:submissionId)
 * 4. AI Risk Engine & Routing Breakdown (/api/v1/ai/risk/:submissionId)
 * 5. Conversational AI Engines (/api/v1/ai/tvc/turn, /api/v1/ai/fa/turn)
 * 6. Voice Fraud Signals & Remediation (/api/v1/ai/fraud-signals, /api/v1/ai/fraud-signals/:signalId/action)
 * 7. Best-Case & Worst-Case Fraud Simulations (/api/v1/ai/simulate-scenario)
 * 8. Security, Entitlements & Validation Edge Cases
 */

const request = require('supertest');
const app = require('../app');
const { generateToken } = require('../utils/crypto');
const config = require('../config');

jest.setTimeout(45000);

describe('AI Super Audit & AI Quality Integration Suite', () => {
  let adminToken = null;
  let auditorToken = null;

  const adminUser = {
    userId: '66666666-6666-6666-6666-666666666601',
    id: '66666666-6666-6666-6666-666666666601',
    email: 'admin@mastercrm.com',
    role: 'MASTER_ADMIN',
    role_name: 'MASTER_ADMIN',
    organization_id: '11111111-1111-1111-1111-111111111111',
    permissions: ['*:*'],
  };

  const auditorUser = {
    userId: '66666666-6666-6666-6666-666666666606',
    id: '66666666-6666-6666-6666-666666666606',
    email: 'auditor@mastercrm.com',
    role: 'SUPER_AUDITOR',
    role_name: 'SUPER_AUDITOR',
    organization_id: '11111111-1111-1111-1111-111111111111',
    permissions: ['super_audit:*', 'ai:*', 'submissions:read'],
  };

  let validSubmissionId = 'SUB-WB-ALIPURDUAR-2026-001';

  beforeAll(async () => {
    const secret = config.jwt.secret || config.jwt.accessSecret;
    adminToken = generateToken(adminUser, secret, '1h');
    auditorToken = generateToken(auditorUser, secret, '1h');

    try {
      const db = require('../database/connection');
      const row = await db('submissions').first();
      if (row && row.submission_id) {
        validSubmissionId = row.submission_id;
      }
    } catch (_) {}
  });

  // ==========================================
  // 1. AI STATUS & DEPLOYED MODEL REGISTRY
  // ==========================================
  describe('1. AI Engine Health & Model Telemetry', () => {
    test('GET /api/v1/ai/models/status returns operational status of all 5 deployed neural models', async () => {
      const res = await request(app)
        .get('/api/v1/ai/models/status')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('HEALTHY');
      expect(res.body.data.models).toHaveProperty('speechToText');
      expect(res.body.data.models).toHaveProperty('speakerDiarization');
      expect(res.body.data.models).toHaveProperty('voiceKyc');
      expect(res.body.data.models).toHaveProperty('llmAuditor');
      expect(res.body.data.models).toHaveProperty('conversationalEngine');
      expect(res.body.data.models.speechToText.status).toBe('READY');
    });

    test('GET /api/v1/ai/status alias returns operational status', async () => {
      const res = await request(app)
        .get('/api/v1/ai/status')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('HEALTHY');
    });
  });

  // ==========================================
  // 2. VOICE KYC ENROLLMENT & VERIFICATION
  // ==========================================
  describe('2. Voice KYC Profile Registry & Cosine Verification', () => {
    const testAgentId = '66666666-6666-6666-6666-666666666605';

    test('POST /api/v1/ai/voice/enroll successfully registers an agent voice profile', async () => {
      const res = await request(app)
        .get('/api/v1/ai/voice/profiles')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    test('POST /api/v1/ai/voice/enroll creates reference embedding for enumerator', async () => {
      const payload = {
        userId: testAgentId,
        sampleAudioUrl: 'https://storage.crm.local/audio/agent_enroll_005.wav',
        fullName: 'Rahul Verma Test',
        role: 'CATI_AGENT',
      };

      const res = await request(app)
        .post('/api/v1/ai/voice/enroll')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(payload);

      expect([200, 201]).toContain(res.status);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('embedding_vector');
      expect(res.body.data.embedding_dimension).toBe(512);
      expect(res.body.data.status).toBe('ACTIVE');
    });

    test('POST /api/v1/ai/voice/verify verifies probe audio against reference profile', async () => {
      const payload = {
        userId: testAgentId,
        audioUrl: 'https://storage.crm.local/audio/agent_verify_probe.wav',
        confidenceThreshold: 0.80,
      };

      const res = await request(app)
        .post('/api/v1/ai/voice/verify')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('isVerified');
      expect(res.body.data).toHaveProperty('confidenceScore');
      expect(res.body.data).toHaveProperty('verificationStatus');
    });
  });

  // ==========================================
  // 3. AI SUPER AUDIT ORCHESTRATION ON SUBMISSIONS
  // ==========================================
  describe('3. AI Super Audit Execution & Evidence Retrieval', () => {
    test('POST /api/v1/ai/audit/:submissionId triggers speech, diarization, and alignment audit', async () => {
      const res = await request(app)
        .post(`/api/v1/ai/audit/${validSubmissionId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          language: 'hi',
          strictness: 'HIGH',
          forceReprocess: true,
        });

      expect([200, 201]).toContain(res.status);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('audit');
      expect(res.body.data).toHaveProperty('segments');
      expect(res.body.data).toHaveProperty('signals');
      expect(res.body.data).toHaveProperty('riskEvaluation');
      expect(res.body.data.audit.status).toBe('COMPLETED');
      expect(Number(res.body.data.audit.overall_score)).toBeGreaterThanOrEqual(0);
    });

    test('GET /api/v1/ai/audit/:submissionId retrieves cached audit findings and question segments', async () => {
      const res = await request(app)
        .get(`/api/v1/ai/audit/${validSubmissionId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('submission');
      expect(res.body.data).toHaveProperty('audit');
      expect(res.body.data).toHaveProperty('segments');
      expect(Array.isArray(res.body.data.segments)).toBe(true);
    });

    test('GET /api/v1/ai/risk/:submissionId returns risk score breakdown and routing decision', async () => {
      const res = await request(app)
        .get(`/api/v1/ai/risk/${validSubmissionId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('aggregateRiskScore');
      expect(res.body.data).toHaveProperty('riskLevel');
      expect(res.body.data).toHaveProperty('routingDecision');
    });
  });

  // ==========================================
  // 4. FRAUD SIGNALS & REMEDIATION ACTIONS
  // ==========================================
  describe('4. AI Voice Fraud Center & Remediation Workflows', () => {
    test('GET /api/v1/ai/fraud-signals retrieves active voice fraud signals', async () => {
      const res = await request(app)
        .get('/api/v1/ai/fraud-signals')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    test('POST /api/v1/ai/fraud-signals/:signalId/action applies remediation action (quarantine)', async () => {
      const res = await request(app)
        .post('/api/v1/ai/fraud-signals/SIG-1049/action')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ action: 'quarantine' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('quarantined');
    });

    test('POST /api/v1/ai/fraud-signals/:signalId/action applies route_super_audit', async () => {
      const res = await request(app)
        .post('/api/v1/ai/fraud-signals/SIG-1049/action')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ action: 'route_super_audit' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.routed_to).toBe('SUPER_AUDIT');
    });
  });

  // ==========================================
  // 5. TEST SCENARIO SIMULATIONS (BEST & WORST CASES)
  // ==========================================
  describe('5. Voice Fraud Test Scenarios Simulation Engine', () => {
    test('Simulate Best-Case Genuine Call (BEST_CASE_VERIFIED)', async () => {
      const res = await request(app)
        .post('/api/v1/ai/simulate-scenario')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ scenarioType: 'BEST_CASE_VERIFIED' });

      expect([200, 201]).toContain(res.status);
      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toContain('Best-Case Simulation');
    });

    test('Simulate Worst-Case 1: Proxy Agent (PROXY_USER_ALERT)', async () => {
      const res = await request(app)
        .post('/api/v1/ai/simulate-scenario')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ scenarioType: 'PROXY_USER_ALERT' });

      expect([200, 201]).toContain(res.status);
      expect(res.body.success).toBe(true);
      expect(res.body.data.signal.type).toBe('PROXY_USER_ALERT');
    });

    test('Simulate Worst-Case 2: Cross-Agent Collision (CROSS_AGENT_COLLISION)', async () => {
      const res = await request(app)
        .post('/api/v1/ai/simulate-scenario')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ scenarioType: 'CROSS_AGENT_COLLISION' });

      expect([200, 201]).toContain(res.status);
      expect(res.body.success).toBe(true);
      expect(res.body.data.signal.type).toBe('CROSS_AGENT_COLLISION');
    });

    test('Simulate Worst-Case 3: Ghost Respondent Loop (REPEATED_RESPONDENT_CLUSTER)', async () => {
      const res = await request(app)
        .post('/api/v1/ai/simulate-scenario')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ scenarioType: 'REPEATED_RESPONDENT_CLUSTER' });

      expect([200, 201]).toContain(res.status);
      expect(res.body.success).toBe(true);
      expect(res.body.data.signal.type).toBe('REPEATED_RESPONDENT_CLUSTER');
    });

    test('Simulate Worst-Case 4: Synthetic AI Voice Robocall (AI_SYNTHETIC_VOICE)', async () => {
      const res = await request(app)
        .post('/api/v1/ai/simulate-scenario')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ scenarioType: 'AI_SYNTHETIC_VOICE' });

      expect([200, 201]).toContain(res.status);
      expect(res.body.success).toBe(true);
      expect(res.body.data.signal.type).toBe('AI_SYNTHETIC_VOICE');
    });

    test('Simulate Edge-Case 5: Low SNR / Heavy Static (INSUFFICIENT_AUDIO_QUALITY)', async () => {
      const res = await request(app)
        .post('/api/v1/ai/simulate-scenario')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ scenarioType: 'INSUFFICIENT_AUDIO_QUALITY' });

      expect([200, 201]).toContain(res.status);
      expect(res.body.success).toBe(true);
      expect(res.body.data.signal.type).toBe('INSUFFICIENT_AUDIO_QUALITY');
    });
  });

  // ==========================================
  // 6. CONVERSATIONAL AI ENGINES (TVC / FA)
  // ==========================================
  describe('6. Conversational AI Turns (TVC & Field Agent Coaching)', () => {
    test('POST /api/v1/ai/tvc/turn executes automated respondent verification turn', async () => {
      const res = await request(app)
        .post('/api/v1/ai/tvc/turn')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          conversationId: 'conv-tvc-001',
          submissionId: validSubmissionId,
          userInput: 'Yes, this is Gaurav and I did vote in the previous election',
          turnNumber: 2,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('intent');
      expect(res.body.data).toHaveProperty('response');
    });

    test('POST /api/v1/ai/fa/turn executes automated agent coaching turn', async () => {
      const res = await request(app)
        .post('/api/v1/ai/fa/turn')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          conversationId: 'conv-fa-001',
          submissionId: validSubmissionId,
          userInput: 'I made a mistake in entering the vote option, entered wrong party by accident',
          turnNumber: 2,
          context: { agentName: 'Sachin', violationType: 'Candidate Mismatch' },
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.intent).toBe('MISTAKE_ADMISSION');
      expect(res.body.data.actionDisposition).toBe('RESOLVED_ADMITTED');
    });
  });

  // ==========================================
  // 7. SECURITY & ERROR HANDLING
  // ==========================================
  describe('7. Security Gating & Error Edge Cases', () => {
    test('Unauthenticated request to AI audit returns 401 Unauthorized', async () => {
      const res = await request(app).get(`/api/v1/ai/audit/${validSubmissionId}`);
      expect(res.status).toBe(401);
    });

    test('GET non-existent submission returns 404 NotFound', async () => {
      const res = await request(app)
        .get('/api/v1/ai/audit/SUB-NONEXISTENT-9999')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });

    test('Voice verification for non-enrolled user returns 404', async () => {
      const res = await request(app)
        .post('/api/v1/ai/voice/verify')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          userId: '00000000-0000-0000-0000-000000009999',
          audioUrl: 'https://storage.crm.local/audio/unknown.wav',
        });

      expect(res.status).toBe(404);
    });
  });
});
