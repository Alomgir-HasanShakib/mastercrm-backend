/**
 * @file campaignVendorAssignmentAndCron.test.js
 * @description Comprehensive test suite verifying Single Vendor vs Equal Split lead distribution,
 * Client DB Live Pull & Record Counters, Deduplication, and Hourly Cron Job (0 * * * *).
 */

const { db } = require('../database/connection');
const projectsService = require('../modules/projects/projects.service');
const hourlyCampaignSyncService = require('../services/hourlyCampaignSync.service');
const { hourlyCampaignSyncJob } = require('../jobs');
const { v4: uuidv4 } = require('uuid');

describe('Campaign Vendor Assignment, Live Counters & Hourly Cron Suite', () => {
  let orgId;
  let vendor1Id;
  let vendor2Id;
  let testProjectId;
  let clientTableName;

  beforeAll(async () => {
    // 1. Resolve test organization
    const org = await db('organizations').first();
    orgId = org?.id || '11111111-1111-1111-1111-111111111111';

    // 2. Resolve or create two test vendors
    const vendors = await db('vendors').where('organization_id', orgId).limit(2);
    if (vendors.length >= 2) {
      vendor1Id = vendors[0].id;
      vendor2Id = vendors[1].id;
    } else {
      vendor1Id = uuidv4();
      vendor2Id = uuidv4();
      await db('vendors').insert([
        {
          id: vendor1Id,
          organization_id: orgId,
          name: 'Prime Field Agency Alpha',
          code: 'VND_ALPHA',
          status: 'ACTIVE',
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: vendor2Id,
          organization_id: orgId,
          name: 'Beta Research Partner',
          code: 'VND_BETA',
          status: 'ACTIVE',
          created_at: new Date(),
          updated_at: new Date(),
        },
      ]);
    }

    // 3. Create test client table in local PostgreSQL
    clientTableName = `client_sync_test_${Date.now().toString().slice(-6)}`;
    await db.schema.createTable(clientTableName, (table) => {
      table.string('submission_id', 100).primary();
      table.string('respondent_name', 255);
      table.string('phone_number', 50);
      table.string('ac_name', 100);
      table.string('state', 100);
      table.timestamp('created_at').defaultTo(db.fn.now());
    });

    // Seed 20 initial rows in client table
    const initialRows = [];
    for (let i = 1; i <= 20; i++) {
      initialRows.push({
        submission_id: `SUB-CLIENT-${1000 + i}`,
        respondent_name: `Respondent ${i}`,
        phone_number: `+91981100${1000 + i}`,
        ac_name: `Constituency ${i % 5 + 1}`,
        state: 'Maharashtra',
        created_at: new Date(),
      });
    }
    await db(clientTableName).insert(initialRows);

    // 4. Create test campaign
    testProjectId = uuidv4();
    await db('projects').insert({
      id: testProjectId,
      organization_id: orgId,
      name: 'Single Vendor & Cron Verification Campaign',
      code: `TEST_CAMP_${Date.now().toString().slice(-4)}`,
      project_code: `TEST_CAMP_${Date.now().toString().slice(-4)}`,
      type: 'CATI',
      enabled_modules: JSON.stringify(['CATI']),
      client_table_name: clientTableName,
      distribution_method: 'SINGLE',
      assigned_single_vendor_id: vendor1Id,
      status: 'ACTIVE',
      created_at: new Date(),
      updated_at: new Date(),
    });
  });

  afterAll(async () => {
    // Cleanup
    hourlyCampaignSyncJob.stopHourlySyncJob();
    hourlyCampaignSyncService.stopHourlyCampaignSyncScheduler();

    if (testProjectId) {
      await db('campaign_leads').where('project_id', testProjectId).delete().catch(() => null);
      await db('submissions').where('project_id', testProjectId).delete().catch(() => null);
      await db('project_vendor_assignments').where('project_id', testProjectId).delete().catch(() => null);
      await db('projects').where('id', testProjectId).delete().catch(() => null);
    }

    if (clientTableName) {
      await db.schema.dropTableIfExists(clientTableName).catch(() => null);
    }
  });

  describe('1. Single Vendor vs Equal Distribution', () => {
    it('should assign 100% of candidate leads to a single vendor when method is SINGLE', async () => {
      // Seed 10 unassigned leads
      const now = new Date();
      const testLeads = [];
      for (let i = 1; i <= 10; i++) {
        testLeads.push({
          id: uuidv4(),
          project_id: testProjectId,
          external_id: `LEAD-SNG-${i}`,
          vendor_id: null,
          phone_number: `+9198000000${i}`,
          respondent_name: `Lead Respondent ${i}`,
          state: 'Maharashtra',
          constituency: 'Pune City',
          status: 'PENDING',
          created_at: now,
          updated_at: now,
        });
      }
      await db('campaign_leads').insert(testLeads);

      // Perform single vendor allocation
      const result = await projectsService.allocateLeads(
        testProjectId,
        {
          method: 'SINGLE',
          vendorId: vendor1Id,
          reallocateAll: true,
        },
        { organizationId: orgId }
      );

      expect(result).toBeDefined();
      expect(result.method).toBe('SINGLE');
      expect(result.vendorCount).toBe(1);
      expect(result.perVendorCount).toBe(result.totalLeads);
      expect(result.remainderCount).toBe(0);
      expect(result.allocatedVendors[0].vendorId).toBe(vendor1Id);
      expect(result.allocatedVendors[0].allocatedCount).toBe(result.totalLeads);

      // Verify in DB that all leads now have vendor1Id
      const assignedCount = await db('campaign_leads')
        .where({ project_id: testProjectId, vendor_id: vendor1Id })
        .count('id as count')
        .first();
      expect(parseInt(assignedCount.count, 10)).toBe(result.totalLeads);

      // Verify project metadata was updated
      const projectRow = await db('projects').where('id', testProjectId).first();
      expect(projectRow.distribution_method).toBe('SINGLE');
      expect(projectRow.assigned_single_vendor_id).toBe(vendor1Id);
    });

    it('should split leads evenly when switching distribution to EQUAL_SPLIT', async () => {
      const result = await projectsService.allocateLeads(
        testProjectId,
        {
          method: 'EQUAL_SPLIT',
          vendorIds: [vendor1Id, vendor2Id],
          reallocateAll: true,
          distributeRemainder: true,
        },
        { organizationId: orgId }
      );

      expect(result).toBeDefined();
      expect(result.vendorCount).toBe(2);
      expect(result.allocatedVendors).toHaveLength(2);

      const v1Allocated = result.allocatedVendors.find((v) => v.vendorId === vendor1Id);
      const v2Allocated = result.allocatedVendors.find((v) => v.vendorId === vendor2Id);
      expect(v1Allocated.allocatedCount).toBeGreaterThan(0);
      expect(v2Allocated.allocatedCount).toBeGreaterThan(0);
      expect(v1Allocated.allocatedCount + v2Allocated.allocatedCount).toBe(result.totalLeads);

      // Verify project metadata was updated
      const projectRow = await db('projects').where('id', testProjectId).first();
      expect(projectRow.distribution_method).toBe('EQUAL');
    });

    it('should switch back to SINGLE vendor and allocate 100% of leads to the newly chosen vendor', async () => {
      const result = await projectsService.allocateLeads(
        testProjectId,
        {
          method: 'SINGLE',
          vendorId: vendor2Id,
          reallocateAll: true,
        },
        { organizationId: orgId }
      );

      expect(result.method).toBe('SINGLE');
      expect(result.vendorCount).toBe(1);
      expect(result.allocatedVendors[0].vendorId).toBe(vendor2Id);
      expect(result.allocatedVendors[0].allocatedCount).toBe(result.totalLeads);

      const v2Count = await db('campaign_leads')
        .where({ project_id: testProjectId, vendor_id: vendor2Id })
        .count('id as count')
        .first();
      expect(parseInt(v2Count.count, 10)).toBe(result.totalLeads);
    });
  });

  describe('2. Client DB Live Pull, Counter & Deduplication', () => {
    it('should pull records from client table and update live counter and sync status', async () => {
      // Clear campaign leads for fresh test
      await db('campaign_leads').where('project_id', testProjectId).delete();

      const syncResult = await hourlyCampaignSyncService.syncCampaignLeads(
        testProjectId,
        { tableName: clientTableName, triggeredBy: 'MANUAL_TRIGGER' },
        { organizationId: orgId }
      );

      expect(syncResult.success).toBe(true);
      expect(syncResult.newLeadsPulled).toBe(20);
      expect(syncResult.totalLeads).toBe(20);
      expect(syncResult.clientDbCount).toBe(20);
      expect(syncResult.syncStatus).toBe('SYNCED');
      expect(syncResult.syncProgress).toBe(100);

      // Verify project row has live counter values
      const projectRow = await db('projects').where('id', testProjectId).first();
      expect(projectRow.client_db_count).toBe(20);
      expect(projectRow.sync_status).toBe('SYNCED');
      expect(projectRow.last_synced_at).toBeTruthy();
    });

    it('should strictly deduplicate duplicate client records and ingest 0 duplicates', async () => {
      // Re-trigger sync with the same 20 rows in client table
      const duplicateSyncResult = await hourlyCampaignSyncService.syncCampaignLeads(
        testProjectId,
        { tableName: clientTableName, triggeredBy: 'HOURLY_CRON' },
        { organizationId: orgId }
      );

      expect(duplicateSyncResult.success).toBe(true);
      expect(duplicateSyncResult.newLeadsPulled).toBe(0);
      expect(duplicateSyncResult.totalLeads).toBe(20);
      expect(duplicateSyncResult.clientDbCount).toBe(20);
      expect(duplicateSyncResult.syncProgress).toBe(100);

      // Verify total count in DB didn't increase
      const leadCount = await db('campaign_leads').where('project_id', testProjectId).count('id as count').first();
      expect(parseInt(leadCount.count, 10)).toBe(20);
    });

    it('should only pull newly added records when client DB grows', async () => {
      // Insert 5 new distinct records into client table
      const newClientRows = [];
      for (let i = 21; i <= 25; i++) {
        newClientRows.push({
          submission_id: `SUB-CLIENT-${1000 + i}`,
          respondent_name: `New Respondent ${i}`,
          phone_number: `+91981100${1000 + i}`,
          ac_name: 'Nagpur Central',
          state: 'Maharashtra',
          created_at: new Date(),
        });
      }
      await db(clientTableName).insert(newClientRows);

      // Trigger sync
      const growthSyncResult = await hourlyCampaignSyncService.syncCampaignLeads(
        testProjectId,
        { tableName: clientTableName, triggeredBy: 'MANUAL_TRIGGER' },
        { organizationId: orgId }
      );

      expect(growthSyncResult.success).toBe(true);
      expect(growthSyncResult.newLeadsPulled).toBe(5);
      expect(growthSyncResult.totalLeads).toBe(25);
      expect(growthSyncResult.clientDbCount).toBe(25);
      expect(growthSyncResult.syncProgress).toBe(100);

      // Verify in DB
      const leadCount = await db('campaign_leads').where('project_id', testProjectId).count('id as count').first();
      expect(parseInt(leadCount.count, 10)).toBe(25);
    });
  });

  describe('3. Hourly Cron Job Scheduling (0 * * * *)', () => {
    it('should schedule hourly cron job matching "0 * * * *"', () => {
      expect(hourlyCampaignSyncJob.CRON_SCHEDULE).toBe('0 * * * *');
    });

    it('should activate and track next hourly run cleanly', () => {
      hourlyCampaignSyncJob.startHourlySyncJob(false);
      const status = hourlyCampaignSyncJob.getJobStatus();

      expect(status.isActive).toBe(true);
      expect(status.schedule).toBe('0 * * * *');
      expect(status.nextRunAt).toBeTruthy();

      const nextDate = new Date(status.nextRunAt);
      expect(nextDate.getMinutes()).toBe(0);
      expect(nextDate.getSeconds()).toBe(0);

      hourlyCampaignSyncJob.stopHourlySyncJob();
      const stoppedStatus = hourlyCampaignSyncJob.getJobStatus();
      expect(stoppedStatus.isActive).toBe(false);
    });

    it('should allow immediate manual pull execution via runManualSyncNow', async () => {
      const manualRes = await hourlyCampaignSyncJob.runManualSyncNow(testProjectId, {
        tableName: clientTableName,
      });

      expect(manualRes.success).toBe(true);
      expect(manualRes.totalLeads).toBe(25);
      expect(manualRes.syncStatus).toBe('SYNCED');
    });
  });
});
