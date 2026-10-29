/**
 * @file campaignDbSyncAndSplit.test.js
 * @description Comprehensive verification suite for Campaign Creation, Client DB Table Binding,
 * Source Channel resolution (CAPI -> FIELD_CAPI, CATI -> REMOTE_CATI, TVC, FA),
 * Multi-Vendor Equal Split lead distribution, and Strict Multi-Vendor Data Isolation.
 */

const { db } = require('../database/connection');
const clientDbSyncService = require('../modules/client-db/clientDbSync.service');
const projectsService = require('../modules/projects/projects.service');
const tenancyService = require('../modules/tenancy/tenancy.service');
const mockStore = require('../database/mockStore');
const { v4: uuidv4 } = require('uuid');

describe('Campaign DB Sync & Multi-Vendor Equal Split Suite', () => {
  let orgId;
  let vendor1Id;
  let vendor2Id;
  let capiProjectId;
  let catiProjectId;

  beforeAll(async () => {
    // 1. Resolve test organization
    const org = await db('organizations').first();
    orgId = org?.id || '11111111-1111-1111-1111-111111111111';

    // 2. Resolve or create two active vendors
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
          name: 'Apex Field Agency 1',
          code: 'VND_APEX_1',
          status: 'ACTIVE',
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: vendor2Id,
          organization_id: orgId,
          name: 'Zenith Field Agency 2',
          code: 'VND_ZENITH_2',
          status: 'ACTIVE',
          created_at: new Date(),
          updated_at: new Date(),
        },
      ]);
    }

    // 3. Create CAPI Campaign
    capiProjectId = uuidv4();
    await db('projects').insert({
      id: capiProjectId,
      organization_id: orgId,
      name: 'Maharashtra CAPI Field Audit 2026',
      code: `CAM_CAPI_${Date.now().toString().slice(-4)}`,
      project_code: `CAM_CAPI_${Date.now().toString().slice(-4)}`,
      type: 'CAPI',
      enabled_modules: JSON.stringify(['CAPI']),
      client_table_name: 'mh_zone_audit_input_r1',
      output1_table_name: 'mh_zone_audit_output_r1_1',
      output2_table_name: 'mh_zone_audit_output_r1_2',
      status: 'ACTIVE',
      created_at: new Date(),
      updated_at: new Date(),
    });

    // 4. Create CATI Campaign
    catiProjectId = uuidv4();
    await db('projects').insert({
      id: catiProjectId,
      organization_id: orgId,
      name: 'UP CATI Opinion Telephony Poll',
      code: `CAM_CATI_${Date.now().toString().slice(-4)}`,
      project_code: `CAM_CATI_${Date.now().toString().slice(-4)}`,
      type: 'CATI',
      enabled_modules: JSON.stringify(['CATI']),
      client_table_name: 'up_telephony_input_r1',
      output1_table_name: 'up_telephony_output_r1_1',
      output2_table_name: 'up_telephony_output_r1_2',
      status: 'ACTIVE',
      created_at: new Date(),
      updated_at: new Date(),
    });
  });

  afterAll(async () => {
    // Clean up created projects
    if (capiProjectId) {
      await db('campaign_leads').where('project_id', capiProjectId).delete();
      await db('submissions').where('project_id', capiProjectId).delete();
      await db('project_vendor_assignments').where('project_id', capiProjectId).delete();
      await db('projects').where('id', capiProjectId).delete();
    }
    if (catiProjectId) {
      await db('campaign_leads').where('project_id', catiProjectId).delete();
      await db('submissions').where('project_id', catiProjectId).delete();
      await db('project_vendor_assignments').where('project_id', catiProjectId).delete();
      await db('projects').where('id', catiProjectId).delete();
    }
  });

  describe('1. Channel Designation in pullCampaignData', () => {
    it('should assign source_channel FIELD_CAPI and capi_status PENDING for CAPI projects', async () => {
      const res = await clientDbSyncService.pullCampaignData(
        {
          projectId: capiProjectId,
          tableName: 'mh_zone_audit_input_r1',
          limit: 10,
        },
        { organizationId: orgId, isMasterAdmin: true }
      );

      expect(res.success).toBe(true);
      expect(res.sourceChannel).toBe('FIELD_CAPI');
      expect(res.tableName).toBe('mh_zone_audit_input_r1');
      expect(res.recordsPulled).toBeGreaterThan(0);

      // Verify records in submissions table
      const sub = await db('submissions').where('project_id', capiProjectId).first();
      expect(sub).toBeDefined();
      expect(sub.source_channel).toBe('FIELD_CAPI');
      expect(sub.capi_status).toBe('PENDING');
    });

    it('should assign source_channel REMOTE_CATI for CATI projects', async () => {
      const res = await clientDbSyncService.pullCampaignData(
        {
          projectId: catiProjectId,
          tableName: 'up_telephony_input_r1',
          limit: 10,
        },
        { organizationId: orgId, isMasterAdmin: true }
      );

      expect(res.success).toBe(true);
      expect(res.sourceChannel).toBe('REMOTE_CATI');
      expect(res.tableName).toBe('up_telephony_input_r1');

      const sub = await db('submissions').where('project_id', catiProjectId).first();
      expect(sub).toBeDefined();
      expect(sub.source_channel).toBe('REMOTE_CATI');
    });
  });

  describe('2. Multi-Vendor Equal Split Lead Allocation', () => {
    it('should equally split leads across active vendors using allocateLeadsEqualSplit', async () => {
      // Allocate leads equally across vendor1 and vendor2
      const splitResult = await projectsService.allocateLeadsEqualSplit(
        capiProjectId,
        [vendor1Id, vendor2Id],
        { reallocateAll: true },
        { organizationId: orgId, isMasterAdmin: true }
      );

      expect(splitResult.vendorCount).toBe(2);
      expect(splitResult.allocatedVendors.length).toBe(2);
      expect(splitResult.perVendorCount).toBeGreaterThan(0);
      expect(splitResult.allocatedVendors[0].allocatedCount).toBe(splitResult.perVendorCount);
      expect(splitResult.allocatedVendors[1].allocatedCount).toBe(splitResult.perVendorCount);

      // Remainder leads should remain in pending pool if any
      const totalAllocated = splitResult.perVendorCount * 2;
      expect(splitResult.totalLeads - totalAllocated).toBe(splitResult.remainderCount);

      const pendingLeads = await db('campaign_leads')
        .where('project_id', capiProjectId)
        .whereNull('vendor_id');
      expect(pendingLeads.length).toBe(splitResult.remainderCount);
    });

    it('should auto-allocate newly pulled leads equally when vendor assignments already exist', async () => {
      // Contract vendor1 and vendor2 on catiProjectId
      await db('project_vendor_assignments').insert([
        {
          id: uuidv4(),
          project_id: catiProjectId,
          vendor_id: vendor1Id,
          is_active: true,
          created_at: new Date(),
        },
        {
          id: uuidv4(),
          project_id: catiProjectId,
          vendor_id: vendor2Id,
          is_active: true,
          created_at: new Date(),
        },
      ]);

      // Pull data with assigned vendors present
      const res = await clientDbSyncService.pullCampaignData(
        {
          projectId: catiProjectId,
          tableName: 'up_telephony_input_r1',
          limit: 20,
        },
        { organizationId: orgId, isMasterAdmin: true }
      );

      expect(res.success).toBe(true);
      expect(res.allocationResult).toBeDefined();
      expect(res.allocationResult.vendorCount).toBe(2);
      expect(res.allocationResult.perVendorCount).toBeGreaterThan(0);

      // Verify that leads have assigned vendor_id
      const assignedCount = await db('campaign_leads')
        .where('project_id', catiProjectId)
        .whereNotNull('vendor_id')
        .count('* as count')
        .first();

      expect(parseInt(assignedCount.count, 10)).toBeGreaterThan(0);
    });
  });

  describe('3. Strict Multi-Vendor Data Isolation', () => {
    it('should only return Vendor 1 leads when accessed by Vendor 1', async () => {
      const v1Context = {
        organizationId: orgId,
        vendorId: vendor1Id,
        isMasterAdmin: false,
      };

      const result = await projectsService.getCampaignLeads(capiProjectId, {}, v1Context);
      expect(result.leads.length).toBeGreaterThan(0);

      // Every returned lead MUST belong to vendor1Id
      for (const lead of result.leads) {
        expect(lead.vendor_id).toBe(vendor1Id);
      }
    });

    it('should only return Vendor 2 leads when accessed by Vendor 2', async () => {
      const v2Context = {
        organizationId: orgId,
        vendorId: vendor2Id,
        isMasterAdmin: false,
      };

      const result = await projectsService.getCampaignLeads(capiProjectId, {}, v2Context);
      expect(result.leads.length).toBeGreaterThan(0);

      // Every returned lead MUST belong to vendor2Id
      for (const lead of result.leads) {
        expect(lead.vendor_id).toBe(vendor2Id);
      }
    });

    it('should forbid Vendor 1 from surveying Vendor 2 leads', async () => {
      // Find a lead belonging to Vendor 2
      const v2Lead = await db('campaign_leads')
        .where({ project_id: capiProjectId, vendor_id: vendor2Id })
        .first();

      expect(v2Lead).toBeDefined();

      const v1Context = {
        organizationId: orgId,
        vendorId: vendor1Id,
        isMasterAdmin: false,
        email: 'agent@vendor1.com',
      };

      await expect(
        projectsService.surveyCampaignLead(
          v2Lead.id,
          { responses: { q1: 'ANSWER' }, disposition: 'PASS' },
          v1Context
        )
      ).rejects.toThrow(/Multi-Vendor Isolation/);
    });
  });
});
