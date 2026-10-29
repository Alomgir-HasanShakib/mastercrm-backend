/**
 * @file hourlyCampaignSync.test.js
 * @description Comprehensive test suite for Campaign Client DB Ingest & Hourly Auto-Pull Sync.
 * Tests immediate pull on campaign create/update, field mapping, strict deduplication,
 * recurring hourly scheduler lifecycle, audit logging, and on-demand sync endpoint.
 */

const { db } = require('../database/connection');
const hourlyCampaignSyncService = require('../services/hourlyCampaignSync.service');
const tenancyService = require('../modules/tenancy/tenancy.service');
const { v4: uuidv4 } = require('uuid');

jest.setTimeout(30000);

describe('Campaign Client DB Ingest & Hourly Auto-Pull Sync Suite', () => {
  let orgId;
  let clientTable = `test_client_survey_${Date.now().toString().slice(-6)}`;
  let testProjectId;

  beforeAll(async () => {
    // 1. Resolve test organization
    const org = await db('organizations').first();
    orgId = org?.id || '11111111-1111-1111-1111-111111111111';

    // 2. Create mock client table in database with mock survey leads
    const hasTable = await db.schema.hasTable(clientTable);
    if (!hasTable) {
      await db.schema.createTable(clientTable, (table) => {
        table.string('submission_id', 100).primary();
        table.string('respondent_name', 255);
        table.string('phone_number', 50);
        table.string('ac_name', 100);
        table.string('state', 100);
        table.string('audio_link', 500);
        table.integer('duration');
        table.string('interviewer_id', 100);
        table.string('custom_feedback', 255);
        table.timestamp('created_at').defaultTo(db.fn.now());
      });
    }

    // 3. Seed 5 initial records into client table
    await db(clientTable).insert([
      {
        submission_id: 'SUB-CLIENT-001',
        respondent_name: 'Aarav Sharma',
        phone_number: '+919876543201',
        ac_name: 'Varanasi Cantt',
        state: 'Uttar Pradesh',
        audio_link: 'https://storage.client.io/audio/sub-001.mp3',
        duration: 185,
        interviewer_id: 'INT-991',
        custom_feedback: 'Satisfied with local municipal services',
      },
      {
        submission_id: 'SUB-CLIENT-002',
        respondent_name: 'Priya Patel',
        phone_number: '+919876543202',
        ac_name: 'Nagpur South',
        state: 'Maharashtra',
        audio_link: 'https://storage.client.io/audio/sub-002.mp3',
        duration: 210,
        interviewer_id: 'INT-992',
        custom_feedback: 'Road improvement needed',
      },
      {
        submission_id: 'SUB-CLIENT-003',
        respondent_name: 'Vikram Joshi',
        phone_number: '+919876543203',
        ac_name: 'Pune Cantonment',
        state: 'Maharashtra',
        audio_link: 'https://storage.client.io/audio/sub-003.mp3',
        duration: 320,
        interviewer_id: 'INT-993',
        custom_feedback: 'Drinking water pipeline delay',
      },
      {
        submission_id: 'SUB-CLIENT-004',
        respondent_name: 'Ananya Roy',
        phone_number: '+919876543204',
        ac_name: 'Kolkata Port',
        state: 'West Bengal',
        audio_link: 'https://storage.client.io/audio/sub-004.mp3',
        duration: 145,
        interviewer_id: 'INT-994',
        custom_feedback: 'Healthcare centre requested',
      },
      {
        submission_id: 'SUB-CLIENT-005',
        respondent_name: 'Rohan Mehra',
        phone_number: '+919876543205',
        ac_name: 'Chandni Chowk',
        state: 'Delhi',
        audio_link: 'https://storage.client.io/audio/sub-005.mp3',
        duration: 260,
        interviewer_id: 'INT-995',
        custom_feedback: 'Pollution control measures',
      },
    ]);
  });

  afterAll(async () => {
    // Clean up test campaign data & client table
    if (testProjectId) {
      await db('campaign_leads').where('project_id', testProjectId).delete();
      await db('submissions').where('project_id', testProjectId).delete();
      await db('audit_logs').where('entity_id', testProjectId).delete();
      await db('projects').where('id', testProjectId).delete();
    }
    await db.schema.dropTableIfExists(clientTable);
  });

  describe('1. Immediate Pull on Campaign Creation & Field Mapping', () => {
    it('should create campaign with client_table_name and immediately pull all 5 rows into campaign_leads', async () => {
      const code = `TEST_CAM_${Date.now().toString().slice(-5)}`;
      const campaign = await tenancyService.createProject(
        {
          name: 'State Election Survey 2026',
          code,
          project_code: code,
          type: 'CATI',
          client_table_name: clientTable,
          status: 'ACTIVE',
        },
        { organizationId: orgId, isMasterAdmin: true }
      );

      testProjectId = campaign.id;
      expect(testProjectId).toBeDefined();

      // Wait a moment for background async pull to complete
      await new Promise((r) => setTimeout(r, 600));

      // Verify leads in campaign_leads
      const leads = await db('campaign_leads')
        .where('project_id', testProjectId)
        .orderBy('created_at', 'asc');

      expect(leads.length).toBe(5);

      // Verify field mappings on first lead
      const lead1 = leads.find((l) => l.external_id === 'SUB-CLIENT-001');
      expect(lead1).toBeDefined();
      expect(lead1.respondent_name).toBe('Aarav Sharma');
      expect(lead1.phone_number).toBe('+919876543201');
      expect(lead1.constituency).toBe('Varanasi Cantt');
      expect(lead1.state).toBe('Uttar Pradesh');
      expect(lead1.status).toBe('PENDING');

      // Verify metadata fields
      const meta = typeof lead1.metadata === 'string' ? JSON.parse(lead1.metadata) : lead1.metadata;
      expect(meta.submission_id).toBe('SUB-CLIENT-001');
      expect(meta.external_id).toBe('SUB-CLIENT-001');
      expect(meta.audio_link).toBe('https://storage.client.io/audio/sub-001.mp3');
      expect(meta.duration).toBe(185);
      expect(meta.interviewer_id).toBe('INT-991');
      expect(meta.source_table).toBe(clientTable);
      expect(meta.custom_feedback).toBe('Satisfied with local municipal services');
    });
  });

  describe('2. Deduplication & Incremental New Row Pulling', () => {
    it('should NOT re-insert existing rows when sync runs again (deduplication)', async () => {
      const result = await hourlyCampaignSyncService.syncCampaignLeads(testProjectId, {
        triggeredBy: 'TEST_CYCLE',
      });

      expect(result.success).toBe(true);
      expect(result.newLeadsPulled).toBe(0);
      expect(result.totalLeads).toBe(5);

      // Verify DB count remains exactly 5
      const countRow = await db('campaign_leads')
        .where('project_id', testProjectId)
        .count('id as count')
        .first();
      expect(parseInt(countRow.count, 10)).toBe(5);
    });

    it('should detect new records added to client table and ingest ONLY new records', async () => {
      // Insert 2 new records into the client table
      await db(clientTable).insert([
        {
          submission_id: 'SUB-CLIENT-006',
          respondent_name: 'Kavita Sengupta',
          phone_number: '+919876543206',
          ac_name: 'Howrah Central',
          state: 'West Bengal',
          audio_link: 'https://storage.client.io/audio/sub-006.mp3',
          duration: 195,
          interviewer_id: 'INT-996',
          custom_feedback: 'Water supply feedback',
        },
        {
          submission_id: 'SUB-CLIENT-007',
          respondent_name: 'Tarun Deshmukh',
          phone_number: '+919876543207',
          ac_name: 'Amravati',
          state: 'Maharashtra',
          audio_link: 'https://storage.client.io/audio/sub-007.mp3',
          duration: 240,
          interviewer_id: 'INT-997',
          custom_feedback: 'Farmer subsidies query',
        },
      ]);

      // Run sync again
      const result = await hourlyCampaignSyncService.syncCampaignLeads(testProjectId, {
        triggeredBy: 'INCREMENTAL_TEST',
      });

      expect(result.success).toBe(true);
      expect(result.newLeadsPulled).toBe(2);
      expect(result.totalLeads).toBe(7);

      // Verify that SUB-CLIENT-006 and SUB-CLIENT-007 exist in campaign_leads
      const lead6 = await db('campaign_leads')
        .where({ project_id: testProjectId, external_id: 'SUB-CLIENT-006' })
        .first();
      expect(lead6).toBeDefined();
      expect(lead6.respondent_name).toBe('Kavita Sengupta');

      const lead7 = await db('campaign_leads')
        .where({ project_id: testProjectId, external_id: 'SUB-CLIENT-007' })
        .first();
      expect(lead7).toBeDefined();
      expect(lead7.respondent_name).toBe('Tarun Deshmukh');
    });
  });

  describe('3. Audit Logging Verification', () => {
    it('should log HOURLY_CAMPAIGN_PULL_SYNC event to audit_logs with correct metadata', async () => {
      const logs = await db('audit_logs')
        .where({ entity_id: testProjectId, action: 'HOURLY_CAMPAIGN_PULL_SYNC' })
        .orderBy('created_at', 'desc');

      expect(logs.length).toBeGreaterThan(0);
      const latestLog = logs[0];
      expect(latestLog.module).toBe('PROJECTS');
      expect(latestLog.entity_type).toBe('projects');

      const meta = typeof latestLog.metadata === 'string' ? JSON.parse(latestLog.metadata) : latestLog.metadata;
      expect(meta.projectId).toBe(testProjectId);
      expect(meta.tableName).toBe(clientTable);
      expect(meta.totalLeads).toBe(7);
    });
  });

  describe('4. Hourly Scheduler & Multi-Campaign Sweep', () => {
    it('should sweep across active campaigns and report accurate results', async () => {
      const sweep = await hourlyCampaignSyncService.syncAllActiveCampaigns({ triggeredBy: 'HOURLY_CRON' });
      expect(sweep.success).toBe(true);
      expect(sweep.campaignsProcessed).toBeGreaterThan(0);
      expect(sweep.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should start and stop scheduler cleanly without error', () => {
      expect(() => {
        hourlyCampaignSyncService.startHourlyCampaignSyncScheduler(false);
      }).not.toThrow();

      expect(() => {
        hourlyCampaignSyncService.stopHourlyCampaignSyncScheduler();
      }).not.toThrow();
    });
  });

  describe('5. Error Resilience', () => {
    it('should handle non-existent table gracefully without crashing', async () => {
      const fakeCampaignId = uuidv4();
      const code = `FAKE_${Date.now().toString().slice(-4)}`;
      await db('projects').insert({
        id: fakeCampaignId,
        organization_id: orgId,
        name: 'Fake Table Campaign',
        code,
        project_code: code,
        status: 'ACTIVE',
        client_table_name: 'non_existent_ghost_table_xyz_123',
        created_at: new Date(),
        updated_at: new Date(),
      });

      const res = await hourlyCampaignSyncService.syncCampaignLeads(fakeCampaignId);
      expect(res.success).toBe(true);
      expect(res.newLeadsPulled).toBe(0);

      // Clean up
      await db('projects').where('id', fakeCampaignId).delete();
    });
  });

  describe('6. On-Demand Sync API Endpoint', () => {
    it('POST /api/v1/projects/:id/sync-leads should trigger sync and return summary', async () => {
      const request = require('supertest');
      const app = require('../app');
      const { generateToken } = require('../utils/crypto');

      const adminToken = generateToken({
        userId: '66666666-6666-6666-6666-666666666601',
        id: '66666666-6666-6666-6666-666666666601',
        email: 'admin@mastercrm.com',
        role: 'MASTER_ADMIN',
        role_name: 'MASTER_ADMIN',
        organization_id: orgId,
        permissions: ['*:*'],
      });

      const res = await request(app)
        .post(`/api/v1/projects/${testProjectId}/sync-leads`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ tableName: clientTable });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.newLeadsPulled).toBe(0);
      expect(res.body.data.totalLeads).toBe(7);
      expect(res.body.data.syncedAt).toBeDefined();
      expect(res.body.data.tableName).toBe(clientTable);
    });
  });
});
