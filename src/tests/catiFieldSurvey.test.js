/**
 * @file catiFieldSurvey.test.js
 * @description Integration tests for CATI - Field Survey (FIELD_CATI) API endpoints:
 * - GET /api/v1/cati/assignments
 * - POST /api/v1/cati/submissions/:id
 * - POST /api/v1/cati/submissions/:id/audio
 * - POST /api/v1/cati/sync
 */

const fs = require('fs');
const path = require('path');
const request = require('supertest');
const app = require('../app');
const { generateToken } = require('../utils/crypto');
const config = require('../config');

jest.setTimeout(30000);

describe('CATI - Field Survey (FIELD_CATI) System API', () => {
  let agentToken = null;
  const agentUser = {
    userId: '66666666-6666-6666-6666-666666666605',
    id: '66666666-6666-6666-6666-666666666605',
    email: 'surveyor.field@primefield.in',
    role: 'CATI_AGENT',
    role_name: 'CATI_AGENT',
    organization_id: '11111111-1111-1111-1111-111111111111',
    permissions: ['field_cati:*', 'submissions:*'],
  };

  beforeAll(() => {
    const secret = config.jwt.secret || config.jwt.accessSecret;
    agentToken = generateToken(agentUser, secret, '1h');
  });

  describe('GET /api/v1/cati/assignments', () => {
    it('should return surveyor AC assignments, active project, and questionnaire manifest', async () => {
      const res = await request(app)
        .get('/api/v1/cati/assignments')
        .set('Authorization', `Bearer ${agentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('surveyor');
      expect(res.body.data).toHaveProperty('constituencies');
      expect(Array.isArray(res.body.data.constituencies)).toBe(true);
      expect(res.body.data.constituencies.length).toBeGreaterThan(0);
      expect(res.body.data).toHaveProperty('questionnaire');
      expect(res.body.data.questionnaire.questions.length).toBeGreaterThan(0);

      // Verify question_tag and skip logic exist
      const introQ = res.body.data.questionnaire.questions.find((q) => q.question_tag === 'introduction');
      expect(introQ).toBeDefined();
      expect(introQ.skipLogic).toBeDefined();
    });
  });

  describe('POST /api/v1/cati/submissions/:id', () => {
    const testSubId = `SUB-TEST-${Date.now()}`;

    it('should save survey submission with question tags, responses, GPS, and timestamps', async () => {
      const payload = {
        projectId: '44444444-4444-4444-4444-444444444441',
        acId: 'AC-216',
        acName: '216 - Kanthi Dakshin',
        respondentName: 'Suman Roy',
        respondentPhone: '9830112233',
        answers: {
          introduction: 'Consent Given',
          is_registered_voter: 'Yes',
          respondent_name: 'Suman Roy',
          phone_no: '9830112233',
          gender: 'Male',
          age: '25-35',
          religion: 'Hindu',
          caste: 'General',
          major_problems: ['Unemployment', 'Inflation'],
          state_govt_change: 'Continue Current Govt',
          mla_choice: 'Ruling Party Candidate',
          cm_choice: 'Current CM',
          voting_intention_vs_party: 'BJP',
        },
        gps: {
          latitude: 21.7891,
          longitude: 87.7524,
          accuracy: 4.5,
          speed: 0.5,
          altitude: 12.0,
          batteryLevel: 92,
          networkType: '4G',
        },
        questionTimestamps: [
          { question_tag: 'introduction', start_time_seconds: 0, end_time_seconds: 15 },
          { question_tag: 'is_registered_voter', start_time_seconds: 15, end_time_seconds: 28 },
          { question_tag: 'mla_choice', start_time_seconds: 28, end_time_seconds: 65 },
        ],
        startedAt: new Date(Date.now() - 120000).toISOString(),
        completedAt: new Date().toISOString(),
      };

      const res = await request(app)
        .post(`/api/v1/cati/submissions/${testSubId}`)
        .set('Authorization', `Bearer ${agentToken}`)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.submissionId).toBe(testSubId);
      expect(res.body.data.sourceChannel).toBe('FIELD_CATI');
      expect(res.body.data.totalAnswersCaptured).toBeGreaterThanOrEqual(13);
    });
  });

  describe('POST /api/v1/cati/submissions/:id/audio', () => {
    const testSubId = `SUB-AUDIO-${Date.now()}`;

    beforeAll(async () => {
      // Pre-create the submission
      await request(app)
        .post(`/api/v1/cati/submissions/${testSubId}`)
        .set('Authorization', `Bearer ${agentToken}`)
        .send({
          acId: 'AC-216',
          answers: { introduction: 'Consent Given', mla_choice: 'BJP Candidate' },
        });
    });

    it('should upload audio file and link to audio_sessions and CAPI audit', async () => {
      // Mock 1KB audio buffer
      const audioBuffer = Buffer.alloc(1024, 0xaa);

      const res = await request(app)
        .post(`/api/v1/cati/submissions/${testSubId}/audio`)
        .set('Authorization', `Bearer ${agentToken}`)
        .attach('audio', audioBuffer, 'field_survey.webm')
        .field('duration', 125)
        .field('questionTimestamps', JSON.stringify([
          { question_tag: 'introduction', start: 0, end: 20 },
          { question_tag: 'mla_choice', start: 20, end: 60 },
        ]));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('storageUrl');
      expect(res.body.data.durationSeconds).toBe(125);
      expect(res.body.data.fileSizeBytes).toBe(1024);
    });

    it('should also accept base64 audio payload', async () => {
      const base64Data = Buffer.from('FAKE_AUDIO_SAMPLE').toString('base64');
      const b64SubId = `SUB-B64-${Date.now()}`;

      const res = await request(app)
        .post(`/api/v1/cati/submissions/${b64SubId}/audio`)
        .set('Authorization', `Bearer ${agentToken}`)
        .send({
          audioBase64: base64Data,
          mimeType: 'audio/webm',
          duration: 45,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('storageUrl');
    });
  });

  describe('POST /api/v1/cati/sync', () => {
    it('should batch synchronize multiple offline submissions and GPS events', async () => {
      const offlineBatch = {
        submissions: [
          {
            submissionId: `SUB-OFFLINE-1-${Date.now()}`,
            acId: 'AC-153',
            answers: {
              introduction: 'Consent Given',
              respondent_name: 'Ramesh Singh',
              phone_no: '9811223344',
              mla_choice: 'Opposition Candidate',
            },
            gps: { latitude: 25.3456, longitude: 85.1234 },
          },
          {
            submissionId: `SUB-OFFLINE-2-${Date.now()}`,
            acId: 'AC-153',
            answers: {
              introduction: 'Consent Given',
              respondent_name: 'Anjali Gupta',
              phone_no: '9822334455',
              mla_choice: 'Ruling Party Candidate',
            },
            gps: { latitude: 25.3459, longitude: 85.1238 },
          },
        ],
        gpsEvents: [
          { latitude: 25.3456, longitude: 85.1234, timestamp: new Date().toISOString() },
        ],
      };

      const res = await request(app)
        .post('/api/v1/cati/sync')
        .set('Authorization', `Bearer ${agentToken}`)
        .send(offlineBatch);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.totalReceived).toBe(2);
      expect(res.body.data.syncedCount).toBe(2);
      expect(res.body.data.failedCount).toBe(0);
    });
  });

  afterAll(() => {
    // Clean up temporary test audio files created in upload directories
    const uploadDirs = [
      path.resolve(config.storage.uploadDir || 'uploads', 'recordings'),
      path.resolve(__dirname, '../../uploads/recordings'),
    ];
    for (const dir of uploadDirs) {
      if (fs.existsSync(dir)) {
        try {
          const files = fs.readdirSync(dir);
          for (const file of files) {
            if (file.startsWith('SUB-AUDIO-') || file.startsWith('SUB-B64-')) {
              fs.unlinkSync(path.join(dir, file));
            }
          }
        } catch (_) {
          // Ignore cleanup errors in test teardown
        }
      }
    }
  });
});
