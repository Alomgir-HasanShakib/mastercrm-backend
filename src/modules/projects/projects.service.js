/**
 * @file projects.service.js
 * @description Business logic layer for Campaign & Projects Management, Multi-Vendor Equal Split Allocation,
 * Strict Multi-Vendor Data Isolation, and Campaign-Questionnaire Binding Studio.
 */

const { v4: uuidv4 } = require('uuid');
const db = require('../../database/connection');
const mockStore = require('../../database/mockStore');
const { NotFoundError, ValidationError, AuthorizationError } = require('../../utils/errors');
const logger = require('../../utils/logger');
const tenancyService = require('../tenancy/tenancy.service');
const questionnaireService = require('../questionnaire/questionnaire.service');

/**
 * Checks whether PostgreSQL is online and has table.
 */
const withDbFallback = async (dbOperation, mockFallback) => {
  try {
    return await dbOperation();
  } catch (err) {
    if (err instanceof AuthorizationError || err.statusCode === 403) {
      throw err;
    }
    logger.warn(`Database operation fell back to mockStore: ${err.message}`);
    return mockFallback();
  }
};

/**
 * Determines whether a project exists in live PostgreSQL DB.
 */
const isDbProject = async (projectId) => {
  try {
    const p = await db('projects').where('id', projectId).first();
    return Boolean(p);
  } catch {
    return false;
  }
};

class ProjectsService {
  /**
   * List all projects / campaigns.
   */
  async listProjects(filters = {}, pagination = {}, tenantContext = {}) {
    return tenancyService.listProjects(filters, pagination, tenantContext);
  }

  /**
   * Get single project by ID with bound questionnaire and vendor stats.
   */
  async getProjectById(projectId, tenantContext = {}) {
    const project = await tenancyService.getProjectById(projectId, tenantContext);

    // Attach bound questionnaire info
    const boundQuestionnaires = await this.getBoundQuestionnaires(projectId, tenantContext);
    const activeQuestionnaire =
      boundQuestionnaires.find((q) => q.is_current_active) ||
      boundQuestionnaires.find((q) => q.is_primary) ||
      boundQuestionnaires[0] ||
      null;

    // Attach leads allocation metrics
    const leadsMetrics = await this.getLeadAllocationMetrics(projectId, tenantContext);

    return {
      ...project,
      boundQuestionnaires,
      activeQuestionnaire,
      leadsMetrics,
    };
  }

  /**
   * Create new campaign.
   */
  async createProject(data, tenantContext = {}) {
    const role = (tenantContext.role || tenantContext.roleName || tenantContext.role_name || '').toUpperCase().replace(/\s+/g, '_');
    if (role === 'VENDOR_ADMIN' || role.includes('VENDOR') || tenantContext.vendorId) {
      throw new AuthorizationError('Permission Denied: Vendors are not permitted to create campaigns.');
    }

    const project = await tenancyService.createProject(data, tenantContext);

    // If initial questionnaire is selected, bind it
    if (data.questionnaireId || data.questionnaire_id) {
      const qId = data.questionnaireId || data.questionnaire_id;
      await this.bindQuestionnaire(project.id, qId, { isPrimary: true }, tenantContext);
    }

    return project;
  }

  /**
   * Update campaign details.
   */
  async updateProject(projectId, data, tenantContext = {}) {
    const role = (tenantContext.role || tenantContext.roleName || tenantContext.role_name || '').toUpperCase().replace(/\s+/g, '_');
    if (role === 'VENDOR_ADMIN' || role.includes('VENDOR') || tenantContext.vendorId) {
      throw new AuthorizationError('Permission Denied: Vendors are not permitted to edit campaigns.');
    }

    return tenancyService.updateProject(projectId, data, tenantContext);
  }

  /**
   * Delete campaign.
   */
  async deleteProject(projectId, tenantContext = {}) {
    const role = (tenantContext.role || tenantContext.roleName || tenantContext.role_name || '').toUpperCase().replace(/\s+/g, '_');
    if (role === 'VENDOR_ADMIN' || role.includes('VENDOR') || tenantContext.vendorId) {
      throw new AuthorizationError('Permission Denied: Vendors are not permitted to delete campaigns.');
    }

    return tenancyService.deleteProject(projectId, tenantContext);
  }

  // ==========================================================================
  // MULTI-VENDOR ALLOCATION & STRICT DATA ISOLATION
  // ==========================================================================

  /**
   * Universal lead allocation method supporting both SINGLE VENDOR (100% of leads)
   * and EQUAL split distribution across multiple vendors.
   *
   * @param {string} projectId
   * @param {object} payload - { method: 'SINGLE'|'EQUAL_SPLIT', vendorId, vendorIds, reallocateAll, distributeRemainder }
   * @param {object} tenantContext
   */
  async allocateLeads(projectId, payload = {}, tenantContext = {}) {
    const {
      vendorId,
      vendorIds = [],
      method = (vendorId && (!vendorIds || vendorIds.length <= 1) ? 'SINGLE' : 'EQUAL_SPLIT'),
      reallocateAll = false,
      distributeRemainder = false,
    } = payload;

    const isSingle = method === 'SINGLE' || method === 'SINGLE_VENDOR' || Boolean(vendorId && (!vendorIds || vendorIds.length <= 1));

    if (isSingle) {
      const targetVendorId = vendorId || (Array.isArray(vendorIds) && vendorIds[0]);
      if (!targetVendorId) {
        throw new ValidationError('A vendor ID is required when SINGLE vendor allocation method is selected.');
      }
      return this.allocateLeadsSingleVendor(projectId, targetVendorId, { reallocateAll }, tenantContext);
    }

    return this.allocateLeadsEqually(
      projectId,
      Array.isArray(vendorIds) && vendorIds.length > 0 ? vendorIds : (vendorId ? [vendorId] : []),
      { reallocateAll, distributeRemainder, method },
      tenantContext
    );
  }

  /**
   * Allocate 100% of campaign leads to a single designated vendor.
   *
   * @param {string} projectId
   * @param {string} vendorId - Target vendor ID to receive all leads
   * @param {object} options - { reallocateAll }
   * @param {object} tenantContext
   */
  async allocateLeadsSingleVendor(projectId, vendorId, options = {}, tenantContext = {}) {
    await tenancyService.getProjectById(projectId, tenantContext);

    if (!vendorId) {
      throw new ValidationError('A valid vendor ID is required for single vendor assignment.');
    }

    if (!(await isDbProject(projectId))) {
      return mockStore.allocateCampaignLeadsSingle(projectId, vendorId, options);
    }

    return withDbFallback(
      async () => {
        return db.transaction(async (trx) => {
          // 1. Verify vendor exists
          const vendorRecord = await trx('vendors').where('id', vendorId).first();
          if (!vendorRecord) {
            throw new NotFoundError(`Vendor with ID '${vendorId}' not found.`);
          }

          // 2. Query candidate leads
          let leadQuery = trx('campaign_leads').where('project_id', projectId);
          if (!options.reallocateAll) {
            leadQuery = leadQuery.whereNull('vendor_id');
          }
          const candidateLeads = await leadQuery.orderBy('created_at', 'asc').orderBy('id', 'asc');
          const totalLeads = candidateLeads.length;
          const leadIds = candidateLeads.map((l) => l.id);

          // 3. Assign 100% of candidate leads to this single vendor
          if (leadIds.length > 0) {
            await trx('campaign_leads')
              .whereIn('id', leadIds)
              .update({
                vendor_id: vendorId,
                status: 'ASSIGNED',
                allocated_at: new Date(),
                updated_at: new Date(),
              });

            // Associate matching unassigned submissions with this vendor
            const phoneNumbers = candidateLeads.map((l) => l.phone_number).filter(Boolean);
            if (phoneNumbers.length > 0) {
              await trx('submissions')
                .where('project_id', projectId)
                .whereIn('respondent_phone', phoneNumbers)
                .whereNull('vendor_id')
                .update({
                  vendor_id: vendorId,
                  updated_at: new Date(),
                });
            }
          }

          // 4. Contract/assign vendor to this campaign
          const existingAsg = await trx('project_vendor_assignments')
            .where({ project_id: projectId, vendor_id: vendorId })
            .first();

          if (existingAsg) {
            await trx('project_vendor_assignments')
              .where({ id: existingAsg.id })
              .update({
                is_active: true,
                quota: JSON.stringify({ target: totalLeads, mode: 'SINGLE_100_PERCENT' }),
              });
          } else {
            await trx('project_vendor_assignments').insert({
              id: uuidv4(),
              project_id: projectId,
              vendor_id: vendorId,
              quota: JSON.stringify({ target: totalLeads, mode: 'SINGLE_100_PERCENT' }),
              is_active: true,
              created_at: new Date(),
            });
          }

          // If reallocateAll is true, deactivate any other vendors
          if (options.reallocateAll) {
            await trx('project_vendor_assignments')
              .where('project_id', projectId)
              .whereNot('vendor_id', vendorId)
              .update({ is_active: false });
          }

          // 5. Update project distribution metadata
          await trx('projects')
            .where('id', projectId)
            .update({
              distribution_method: 'SINGLE',
              assigned_single_vendor_id: vendorId,
              updated_at: new Date(),
            });

          return {
            projectId,
            totalLeads,
            vendorCount: 1,
            method: 'SINGLE',
            perVendorCount: totalLeads,
            remainderCount: 0,
            allocatedVendors: [
              {
                vendorId,
                vendorName: vendorRecord.name,
                vendorCode: vendorRecord.code,
                allocatedCount: totalLeads,
                percentage: 100,
              },
            ],
            allocatedAt: new Date().toISOString(),
            message: `100% of campaign leads (${totalLeads}) assigned to single vendor '${vendorRecord.name}'.`,
          };
        });
      },
      () => mockStore.allocateCampaignLeadsSingle(projectId, vendorId, options)
    );
  }

  /**
   * Allocate leads to multiple vendors using equal split (e.g. 65 leads across 5 vendors -> 13 each).
   * Remainder leads stay in the pending pool for automatic reassignment.
   *
   * @param {string} projectId
   * @param {Array<string>} vendorIds - List of vendor IDs to receive leads
   * @param {object} options - { reallocateAll, method, distributeRemainder }
   * @param {object} tenantContext
   */
  async allocateLeadsEqually(projectId, vendorIds = [], options = {}, tenantContext = {}) {
    if (options.method === 'SINGLE' || options.method === 'SINGLE_VENDOR') {
      const singleVendorId = (Array.isArray(vendorIds) && vendorIds[0]) || options.vendorId;
      return this.allocateLeadsSingleVendor(projectId, singleVendorId, options, tenantContext);
    }

    await tenancyService.getProjectById(projectId, tenantContext);

    if (!Array.isArray(vendorIds) || vendorIds.length === 0) {
      const assigned = await tenancyService.getProjectVendors(projectId, tenantContext);
      vendorIds = assigned.map((a) => a.vendor_id || a.id);
    }

    // If no vendors are contracted yet, automatically contract all active vendors belonging to this campaign's organization
    if (vendorIds.length === 0) {
      const prj = await db('projects').where('id', projectId).first();
      const orgId = prj?.organization_id || tenantContext.organizationId;
      if (orgId) {
        const orgVendors = await db('vendors').where('organization_id', orgId);
        if (orgVendors && orgVendors.length > 0) {
          for (const v of orgVendors) {
            const exists = await db('project_vendor_assignments').where({ project_id: projectId, vendor_id: v.id }).first();
            if (!exists) {
              await db('project_vendor_assignments').insert({
                id: uuidv4(),
                project_id: projectId,
                vendor_id: v.id,
                is_active: true,
                created_at: new Date(),
              });
            }
          }
          vendorIds = orgVendors.map((v) => v.id);
        }
      }
    }

    if (vendorIds.length === 0) {
      throw new ValidationError('At least one vendor must be selected or available in the organization for lead allocation.');
    }

    if (!(await isDbProject(projectId))) {
      return mockStore.allocateCampaignLeads(projectId, vendorIds, options);
    }

    return withDbFallback(
      async () => {
        return db.transaction(async (trx) => {
          let leadQuery = trx('campaign_leads').where('project_id', projectId);
          if (!options.reallocateAll) {
            leadQuery = leadQuery.whereNull('vendor_id');
          }
          const candidateLeads = await leadQuery.orderBy('created_at', 'asc').orderBy('id', 'asc');
          const totalLeads = candidateLeads.length;
          const vendorCount = vendorIds.length;
          const perVendorCount = Math.floor(totalLeads / vendorCount);
          const remainderCount = totalLeads % vendorCount;

          const allocationSummary = [];

          for (let i = 0; i < vendorCount; i++) {
            const vId = vendorIds[i];
            const startIdx = i * perVendorCount;
            const endIdx = startIdx + perVendorCount;
            const vendorLeads = candidateLeads.slice(startIdx, endIdx);
            const leadIds = vendorLeads.map((l) => l.id);

            if (leadIds.length > 0) {
              await trx('campaign_leads')
                .whereIn('id', leadIds)
                .update({
                  vendor_id: vId,
                  status: 'ASSIGNED',
                  allocated_at: new Date(),
                  updated_at: new Date(),
                });

              // Also associate matching unassigned submissions with this vendor
              const phoneNumbers = vendorLeads.map((l) => l.phone_number).filter(Boolean);
              if (phoneNumbers.length > 0) {
                await trx('submissions')
                  .where('project_id', projectId)
                  .whereIn('respondent_phone', phoneNumbers)
                  .whereNull('vendor_id')
                  .update({
                    vendor_id: vId,
                    updated_at: new Date(),
                  });
              }
            }

            const existingAsg = await trx('project_vendor_assignments')
              .where({ project_id: projectId, vendor_id: vId })
              .first();

            if (existingAsg) {
              await trx('project_vendor_assignments')
                .where({ id: existingAsg.id })
                .update({
                  is_active: true,
                  quota: JSON.stringify({ target: perVendorCount }),
                });
            } else {
              await trx('project_vendor_assignments').insert({
                id: uuidv4(),
                project_id: projectId,
                vendor_id: vId,
                quota: JSON.stringify({ target: perVendorCount }),
                is_active: true,
                created_at: new Date(),
              });
            }

            const vendorRecord = await trx('vendors').where('id', vId).first();
            allocationSummary.push({
              vendorId: vId,
              vendorName: vendorRecord ? vendorRecord.name : 'Vendor',
              allocatedCount: vendorLeads.length,
            });
          }

          const remainderLeads = candidateLeads.slice(vendorCount * perVendorCount);
          const remainderIds = remainderLeads.map((l) => l.id);
          if (options.distributeRemainder && remainderLeads.length > 0) {
            for (let r = 0; r < remainderLeads.length; r++) {
              const targetVendorId = vendorIds[r % vendorCount];
              await trx('campaign_leads')
                .where('id', remainderLeads[r].id)
                .update({
                  vendor_id: targetVendorId,
                  status: 'ASSIGNED',
                  allocated_at: new Date(),
                  updated_at: new Date(),
                });
              const vSummary = allocationSummary.find((s) => s.vendorId === targetVendorId);
              if (vSummary) vSummary.allocatedCount += 1;
            }
          } else if (remainderIds.length > 0) {
            await trx('campaign_leads')
              .whereIn('id', remainderIds)
              .update({
                vendor_id: null,
                status: 'PENDING',
                allocated_at: null,
                updated_at: new Date(),
              });
          }

          // Update project distribution metadata
          await trx('projects')
            .where('id', projectId)
            .update({
              distribution_method: 'EQUAL',
              assigned_single_vendor_id: null,
              updated_at: new Date(),
            });

          return {
            projectId,
            totalLeads,
            vendorCount,
            perVendorCount,
            remainderCount: options.distributeRemainder ? 0 : remainderCount,
            allocatedVendors: allocationSummary,
            allocatedAt: new Date().toISOString(),
          };
        });
      },
      () => mockStore.allocateCampaignLeads(projectId, vendorIds, options)
    );
  }

  /**
   * Explicit alias for allocateLeadsEqually.
   * Allocate leads to multiple vendors using equal split with deterministic remainder handling.
   *
   * @param {string} projectId
   * @param {Array<string>} vendorIds
   * @param {object} options
   * @param {object} tenantContext
   */
  async allocateLeadsEqualSplit(projectId, vendorIds = [], options = {}, tenantContext = {}) {
    return this.allocateLeadsEqually(projectId, vendorIds, options, tenantContext);
  }

  /**
   * Auto-assign remaining leads in the pending pool across active campaign vendors.
   * "jodi kono lead bad thake tahole seitaa pore abr auto assign hoye jabee"
   */
  async autoAssignPendingLeads(projectId, tenantContext = {}) {
    await tenancyService.getProjectById(projectId, tenantContext);

    if (!(await isDbProject(projectId))) {
      return mockStore.autoAssignPendingLeads(projectId);
    }

    return withDbFallback(
      async () => {
        return db.transaction(async (trx) => {
          const pendingLeads = await trx('campaign_leads')
            .where({ project_id: projectId })
            .whereNull('vendor_id')
            .orderBy('created_at', 'asc');

          if (pendingLeads.length === 0) {
            return {
              projectId,
              assignedCount: 0,
              remainderCount: 0,
              message: 'No pending leads in campaign pool to reassign.',
            };
          }

          const assignments = await trx('project_vendor_assignments')
            .where({ project_id: projectId, is_active: true });

          const vendorIds = assignments.map((a) => a.vendor_id);
          if (vendorIds.length === 0) {
            throw new ValidationError('No active vendors assigned to this campaign.');
          }

          for (let i = 0; i < pendingLeads.length; i++) {
            const assignedVendorId = vendorIds[i % vendorIds.length];
            await trx('campaign_leads')
              .where('id', pendingLeads[i].id)
              .update({
                vendor_id: assignedVendorId,
                status: 'ASSIGNED',
                allocated_at: new Date(),
                updated_at: new Date(),
              });
          }

          // Update project distribution metadata
          await trx('projects')
            .where('id', projectId)
            .update({
              distribution_method: 'EQUAL',
              assigned_single_vendor_id: null,
              updated_at: new Date(),
            });

          return {
            projectId,
            assignedCount: pendingLeads.length,
            remainderCount: 0,
            activeVendorsCount: vendorIds.length,
            message: `Successfully auto-assigned ${pendingLeads.length} pending lead(s) across ${vendorIds.length} vendor agencies.`,
          };
        });
      },
      () => mockStore.autoAssignPendingLeads(projectId)
    );
  }

  /**
   * Reallocate leads from one vendor to another.
   * Allows campaign managers / admins to migrate workload between contracted agencies.
   *
   * @param {string} projectId
   * @param {string} fromVendorId
   * @param {string} toVendorId
   * @param {object} options - { status: 'ALL' | 'PENDING' | 'ASSIGNED' }
   * @param {object} tenantContext
   * @returns {Promise<object>}
   */
  async reallocateVendorLeads(projectId, fromVendorId, toVendorId, options = {}, tenantContext = {}) {
    await tenancyService.getProjectById(projectId, tenantContext);

    if (fromVendorId === toVendorId) {
      throw new ValidationError('Source vendor and target vendor must be different.');
    }

    const filterStatus = options.status || 'PENDING';

    return withDbFallback(
      async () => {
        return db.transaction(async (trx) => {
          let leadQuery = trx('campaign_leads')
            .where({ project_id: projectId, vendor_id: fromVendorId });

          if (filterStatus === 'PENDING') {
            leadQuery = leadQuery.whereIn('status', ['PENDING', 'ASSIGNED']);
          } else if (filterStatus !== 'ALL') {
            leadQuery = leadQuery.where('status', filterStatus);
          }

          const leadsToMove = await leadQuery;
          const leadIds = leadsToMove.map((l) => l.id);

          if (leadIds.length > 0) {
            await trx('campaign_leads')
              .whereIn('id', leadIds)
              .update({
                vendor_id: toVendorId,
                allocated_at: new Date(),
                updated_at: new Date(),
              });
          }

          const fromVendor = await trx('vendors').where('id', fromVendorId).first();
          const toVendor = await trx('vendors').where('id', toVendorId).first();

          return {
            projectId,
            fromVendorId,
            fromVendorName: fromVendor?.name || fromVendorId,
            toVendorId,
            toVendorName: toVendor?.name || toVendorId,
            reallocatedCount: leadIds.length,
            message: `Successfully reallocated ${leadIds.length} lead(s) from ${fromVendor?.name || 'Vendor A'} to ${toVendor?.name || 'Vendor B'}.`,
          };
        });
      },
      () => {
        const fromVendor = mockStore.findById('vendors', fromVendorId) || {};
        const toVendor = mockStore.findById('vendors', toVendorId) || {};

        let movedCount = 0;
        if (Array.isArray(mockStore.campaign_leads)) {
          mockStore.campaign_leads.forEach((l) => {
            if (l.project_id === projectId && l.vendor_id === fromVendorId) {
              if (filterStatus === 'ALL' || l.status === 'PENDING' || l.status === 'ASSIGNED' || l.status === filterStatus) {
                l.vendor_id = toVendorId;
                l.allocated_at = new Date().toISOString();
                l.updated_at = new Date().toISOString();
                movedCount++;
              }
            }
          });
        }

        return {
          projectId,
          fromVendorId,
          fromVendorName: fromVendor.name || fromVendorId,
          toVendorId,
          toVendorName: toVendor.name || toVendorId,
          reallocatedCount: movedCount,
          message: `Successfully reallocated ${movedCount} lead(s) from ${fromVendor.name || 'Vendor A'} to ${toVendor.name || 'Vendor B'}.`,
        };
      }
    );
  }

  /**
   * Get campaign leads with STRICT multi-vendor data isolation.
   * Vendor A can NEVER see or access leads belonging to Vendor B!
   */
  async getCampaignLeads(projectId, filters = {}, tenantContext = {}) {
    await tenancyService.getProjectById(projectId, tenantContext);

    const effectiveContext = { ...tenantContext };
    if (tenantContext.vendorId) {
      effectiveContext.vendorId = tenantContext.vendorId;
    }

    if (!(await isDbProject(projectId))) {
      return mockStore.getCampaignLeadsIsolated(projectId, filters, effectiveContext);
    }

    return withDbFallback(
      async () => {
        let query = db('campaign_leads')
          .leftJoin('vendors', 'campaign_leads.vendor_id', 'vendors.id')
          .select(
            'campaign_leads.*',
            'vendors.name as vendor_name',
            'vendors.code as vendor_code'
          )
          .where('campaign_leads.project_id', projectId);

        if (effectiveContext.vendorId) {
          query = query.where('campaign_leads.vendor_id', effectiveContext.vendorId);
        } else if (filters.vendorId) {
          query = query.where('campaign_leads.vendor_id', filters.vendorId);
        }

        if (filters.status) {
          query = query.where('campaign_leads.status', filters.status);
        }
        if (filters.search) {
          const s = `%${filters.search}%`;
          query = query.where((b) => {
            b.whereILike('campaign_leads.respondent_name', s)
              .orWhereILike('campaign_leads.phone_number', s)
              .orWhereILike('campaign_leads.constituency', s);
          });
        }

        const leads = await query.orderBy('campaign_leads.created_at', 'asc');
        const metrics = await this.getLeadAllocationMetrics(projectId, tenantContext);

        return {
          leads,
          total: leads.length,
          metrics,
        };
      },
      () => mockStore.getCampaignLeadsIsolated(projectId, filters, effectiveContext)
    );
  }

  /**
   * Survey a campaign lead with strict multi-vendor isolation verification.
   * If Vendor A attempts to survey Vendor B's lead, request is rejected with 403 Forbidden!
   */
  async surveyCampaignLead(leadId, surveyData = {}, tenantContext = {}) {
    return withDbFallback(
      async () => {
        const lead = await db('campaign_leads').where('id', leadId).first();
        if (!lead) {
          return mockStore.surveyCampaignLead(leadId, tenantContext, surveyData);
        }

        if (tenantContext.vendorId && lead.vendor_id && String(lead.vendor_id) !== String(tenantContext.vendorId)) {
          throw new AuthorizationError('Multi-Vendor Isolation: You are forbidden from accessing or surveying leads allocated to another vendor agency.');
        }

        let assignedAgentId = lead.assigned_agent_id || null;
        if (tenantContext.userId) {
          const userExists = await db('users').where('id', tenantContext.userId).first().catch(() => null);
          if (userExists) {
            assignedAgentId = tenantContext.userId;
          }
        }

        const auditStatusVal = (surveyData.outputData?.audit_status || surveyData.outputData?.decision || 'COMPLETED').toUpperCase();

        const [updated] = await db('campaign_leads')
          .where('id', leadId)
          .whereNot('status', 'COMPLETED')
          .update({
            status: 'COMPLETED',
            audit_status: auditStatusVal,
            locked_by_auditor: null,
            locked_at: null,
            surveyed_at: new Date(),
            updated_at: new Date(),
            assigned_agent_id: assignedAgentId,
            metadata: JSON.stringify({
              ...(typeof lead.metadata === 'object' && lead.metadata !== null ? lead.metadata : JSON.parse(lead.metadata || '{}')),
              surveyResponses: surveyData.responses || {},
              outputData: surveyData.outputData || {},
              completedBy: tenantContext.email || 'agent',
              audit_status: auditStatusVal,
              locked_by_auditor: null,
            }),
          })
          .returning('*');

        if (!updated) {
          logger.warn(`[Projects Service] Lead ${leadId} was already completed concurrently. Idempotently returning.`);
          const latestLead = await db('campaign_leads').where('id', leadId).first();
          return latestLead || lead;
        }

        // 1. Ingest/Update submissions table
        const project = await db('projects').where('id', lead.project_id).first();
        const leadMeta = typeof lead.metadata === 'string' ? JSON.parse(lead.metadata || '{}') : (lead.metadata || {});
        const submissionId = leadMeta.submission_id || `SUB-SURVEY-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;

        let sourceAgentId = assignedAgentId;
        const existingSub = await db('submissions').where('submission_id', submissionId).first();
        if (existingSub) {
          await db('submissions').where('id', existingSub.id).update({
            source_status: 'SUBMITTED',
            source_agent_id: sourceAgentId,
            respondent_metadata: JSON.stringify(surveyData.responses || {}),
            updated_at: new Date(),
          });
        } else {
          await db('submissions').insert({
            id: (await db.raw('SELECT uuid_generate_v4() as id')).rows[0].id,
            submission_id: submissionId,
            project_id: lead.project_id,
            vendor_id: lead.vendor_id || null,
            source_channel: 'FIELD_CATI',
            source_status: 'SUBMITTED',
            source_agent_id: sourceAgentId,
            capi_status: 'PENDING',
            super_audit_status: 'PENDING',
            tvc_status: 'PENDING',
            fa_status: 'PENDING',
            respondent_name: lead.respondent_name,
            respondent_phone: lead.phone_number,
            respondent_metadata: JSON.stringify(surveyData.responses || {}),
            priority: 50,
            risk_score: 0.00,
            created_at: new Date(),
            updated_at: new Date(),
          });
        }

        // 2. Synchronize to local Output 1 table (e.g. mh_zone_audit_output_r1_1)
        const outputTable1 = project?.output1_table_name || 'mh_zone_audit_output_r1_1';
        const hasOut1 = await db.schema.hasTable(outputTable1);
        const surveyResp = surveyData.responses || {};

        if (hasOut1) {
          const colInfo = await db(outputTable1).columnInfo();
          const tableCols = Object.keys(colInfo);
          const outRow = {};
          for (const col of tableCols) {
            if (leadMeta[col] !== undefined) outRow[col] = leadMeta[col];
            if (surveyResp[col] !== undefined) outRow[col] = surveyResp[col];
          }
          outRow.submission_id = submissionId;
          if (tableCols.includes('phone_no')) outRow.phone_no = lead.phone_number;
          if (tableCols.includes('phone_number')) outRow.phone_number = lead.phone_number;
          if (tableCols.includes('full_name')) outRow.full_name = lead.respondent_name;
          if (tableCols.includes('ac_name') && lead.constituency) outRow.ac_name = lead.constituency;
          if (tableCols.includes('audit_status')) outRow.audit_status = surveyData.disposition || 'PASS';
          if (tableCols.includes('agent_id')) outRow.agent_id = tenantContext.email || 'agent';
          if (tableCols.includes('assignment_time')) outRow.assignment_time = new Date();
          if (tableCols.includes('pushed')) outRow.pushed = true;
          if (tableCols.includes('created_at')) outRow.created_at = new Date();
          if (tableCols.includes('updated_at')) outRow.updated_at = new Date();

          const existingOut = await db(outputTable1).where('submission_id', submissionId).first().catch(() => null);
          if (existingOut) {
            await db(outputTable1).where('submission_id', submissionId).update(outRow).catch(() => null);
          } else {
            await db(outputTable1).insert(outRow).catch(() => null);
          }
        }

        // 3. Synchronize to local Output 2 table (exact 128-column format from test.csv)
        const outputTable2 = project?.output2_table_name || 'mh_zone_audit_output_r1_2';
        try {
          const capiOutput2Formatter = require('../capi/capiOutput2Formatter');
          const out2Row = capiOutput2Formatter.formatLeadToOutput2Row(
            { ...lead, metadata: { ...leadMeta, surveyResponses: surveyData.responses, outputData: surveyData.outputData } },
            {
              decision: surveyData.outputData?.audit_status || surveyData.disposition,
              score: surveyData.outputData?.score,
              audioDisposition: surveyData.outputData?.audio_disposition,
              feedback: surveyData.outputData?.remarks,
              items: surveyData.responses,
            },
            {
              email: tenantContext.email,
              id: tenantContext.userId,
            }
          );
          await capiOutput2Formatter.syncOutput2Table(outputTable2, out2Row);
        } catch (out2Err) {
          logger.warn(`[OUTPUT2_SYNC_NOTE] Failed to sync to ${outputTable2}: ${out2Err.message}`);
        }

        // Output is retained exclusively within internal system database (no external client DB push)
        logger.info(`[SURVEY_SAVED_INTERNAL_DB] Lead '${leadId}' / Submission '${submissionId}' saved strictly to internal DB.`);

        return updated;
      },
      () => mockStore.surveyCampaignLead(leadId, tenantContext, surveyData)
    );
  }

  /**
   * Get metrics on campaign leads allocation.
   */
  async getLeadAllocationMetrics(projectId, tenantContext = {}) {
    if (!(await isDbProject(projectId))) {
      const res = mockStore.getCampaignLeadsIsolated(projectId, {}, tenantContext);
      return res.metrics;
    }

    return withDbFallback(
      async () => {
        const total = await db('campaign_leads').where('project_id', projectId).count('* as count').first();
        const assigned = await db('campaign_leads')
          .where('project_id', projectId)
          .whereNotNull('vendor_id')
          .count('* as count')
          .first();
        const pending = await db('campaign_leads')
          .where('project_id', projectId)
          .whereNull('vendor_id')
          .count('* as count')
          .first();
        const completed = await db('campaign_leads')
          .where({ project_id: projectId, status: 'COMPLETED' })
          .count('* as count')
          .first();

        let vendorMetrics = null;
        if (tenantContext && tenantContext.vendorId) {
          const vTotal = await db('campaign_leads')
            .where({ project_id: projectId, vendor_id: tenantContext.vendorId })
            .count('* as count')
            .first();
          const vCompleted = await db('campaign_leads')
            .where({ project_id: projectId, vendor_id: tenantContext.vendorId, status: 'COMPLETED' })
            .count('* as count')
            .first();
          const vInProgress = await db('campaign_leads')
            .where({ project_id: projectId, vendor_id: tenantContext.vendorId, status: 'IN_PROGRESS' })
            .count('* as count')
            .first();
          const vPending = await db('campaign_leads')
            .where({ project_id: projectId, vendor_id: tenantContext.vendorId })
            .whereIn('status', ['PENDING', 'ASSIGNED'])
            .count('* as count')
            .first();

          vendorMetrics = {
            allocatedLeads: parseInt(vTotal?.count || 0, 10),
            completedLeads: parseInt(vCompleted?.count || 0, 10),
            inProgressLeads: parseInt(vInProgress?.count || 0, 10),
            pendingLeads: parseInt(vPending?.count || 0, 10),
          };
        }

        return {
          totalLeads: parseInt(total?.count || 0, 10),
          assignedLeads: parseInt(assigned?.count || 0, 10),
          pendingLeads: parseInt(pending?.count || 0, 10),
          completedLeads: parseInt(completed?.count || 0, 10),
          isVendorScoped: Boolean(tenantContext && tenantContext.vendorId),
          vendorMetrics,
        };
      },
      () => {
        const res = mockStore.getCampaignLeadsIsolated(projectId, {}, tenantContext);
        return res.metrics;
      }
    );
  }

  // ==========================================================================
  // CAMPAIGN - QUESTIONNAIRE BINDING
  // ==========================================================================

  /**
   * Bind an existing questionnaire from Question Builder to a campaign.
   * One questionnaire can be bound to multiple campaigns simultaneously.
   * Users can switch questionnaire at any time.
   */
  async bindQuestionnaire(projectId, questionnaireId, options = {}, tenantContext = {}) {
    await tenancyService.getProjectById(projectId, tenantContext);

    const { module = 'CATI', isPrimary = true } = options;

    if (!(await isDbProject(projectId))) {
      return mockStore.bindQuestionnaireToCampaign(projectId, questionnaireId, options);
    }

    return withDbFallback(
      async () => {
        const qv = await db('questionnaire_versions').where('id', questionnaireId).first();
        if (!qv) {
          return mockStore.bindQuestionnaireToCampaign(projectId, questionnaireId, options);
        }

        if (isPrimary) {
          await db('projects').where('id', projectId).update({
            questionnaire_id: questionnaireId,
            updated_at: new Date(),
          });
          await db('campaign_questionnaires')
            .where('project_id', projectId)
            .update({ is_primary: false });
        }

        const existing = await db('campaign_questionnaires')
          .where({ project_id: projectId, questionnaire_id: questionnaireId })
          .first();

        if (existing) {
          const [updated] = await db('campaign_questionnaires')
            .where('id', existing.id)
            .update({
              module: module || qv.module,
              is_primary: isPrimary,
            })
            .returning('*');
          return updated;
        }

        const [created] = await db('campaign_questionnaires')
          .insert({
            id: uuidv4(),
            project_id: projectId,
            questionnaire_id: questionnaireId,
            module: module || qv.module,
            is_primary: isPrimary,
            bound_at: new Date(),
          })
          .returning('*');

        return created;
      },
      () => mockStore.bindQuestionnaireToCampaign(projectId, questionnaireId, options)
    );
  }

  /**
   * Unbind questionnaire from a campaign.
   */
  async unbindQuestionnaire(projectId, questionnaireId, tenantContext = {}) {
    await tenancyService.getProjectById(projectId, tenantContext);

    if (!(await isDbProject(projectId))) {
      return mockStore.unbindQuestionnaireFromCampaign(projectId, questionnaireId);
    }

    return withDbFallback(
      async () => {
        await db('campaign_questionnaires')
          .where({ project_id: projectId, questionnaire_id: questionnaireId })
          .del();

        const project = await db('projects').where('id', projectId).first();
        if (project && project.questionnaire_id === questionnaireId) {
          const remaining = await db('campaign_questionnaires').where('project_id', projectId).first();
          await db('projects')
            .where('id', projectId)
            .update({ questionnaire_id: remaining ? remaining.questionnaire_id : null });
        }
        return true;
      },
      () => mockStore.unbindQuestionnaireFromCampaign(projectId, questionnaireId)
    );
  }

  /**
   * Get all questionnaires bound to a campaign.
   */
  async getBoundQuestionnaires(projectId, tenantContext = {}) {
    await tenancyService.getProjectById(projectId, tenantContext);

    if (!(await isDbProject(projectId))) {
      return mockStore.getCampaignQuestionnaires(projectId);
    }

    return withDbFallback(
      async () => {
        const project = await db('projects').where('id', projectId).first();
        const bindings = await db('campaign_questionnaires')
          .join('questionnaire_versions', 'campaign_questionnaires.questionnaire_id', 'questionnaire_versions.id')
          .select(
            'campaign_questionnaires.*',
            'questionnaire_versions.name as questionnaire_name',
            'questionnaire_versions.version_number',
            'questionnaire_versions.status',
            'questionnaire_versions.checksum'
          )
          .where('campaign_questionnaires.project_id', projectId);

        if (bindings.length === 0) {
          const mockBindings = mockStore.getCampaignQuestionnaires(projectId);
          if (mockBindings.length > 0) return mockBindings;
        }

        return bindings.map((b) => ({
          ...b,
          is_current_active: project ? project.questionnaire_id === b.questionnaire_id : false,
        }));
      },
      () => mockStore.getCampaignQuestionnaires(projectId)
    );
  }

  /**
   * Get all questionnaire templates available in Question Builder for campaign binding.
   */
  async getAvailableQuestionnaires(tenantContext = {}) {
    return withDbFallback(
      async () => {
        const versions = await questionnaireService.listVersions();
        if (versions.length === 0) {
          return mockStore.getAvailableQuestionnaires();
        }
        return versions.map((v) => ({
          id: v.id,
          name: v.name,
          module: v.module,
          versionNumber: v.version_number,
          status: v.status,
          publishedAt: v.published_at,
          sectionsCount: v.sections_count || 0,
          questionsCount: v.questions_count || 0,
        }));
      },
      () => mockStore.getAvailableQuestionnaires()
    );
  }

  /**
   * Build/create a new questionnaire specifically for this campaign and bind it immediately.
   */
  async createCampaignQuestionnaire(projectId, data, tenantContext = {}) {
    await tenancyService.getProjectById(projectId, tenantContext);

    const versionData = {
      projectId,
      name: data.name || `${data.title || 'Custom Campaign'} Questionnaire`,
      module: data.module || 'CATI',
      versionNumber: 1,
      status: data.status || 'DRAFT',
    };

    if (!(await isDbProject(projectId))) {
      const newVersion = mockStore.insert('questionnaire_versions', {
        id: uuidv4(),
        project_id: projectId,
        name: versionData.name,
        module: versionData.module,
        version_number: 1,
        status: versionData.status || 'DRAFT',
        created_by: tenantContext.userId,
        created_at: new Date(),
        updated_at: new Date(),
      });
      mockStore.bindQuestionnaireToCampaign(projectId, newVersion.id, {
        module: newVersion.module,
        isPrimary: true,
      });
      return newVersion;
    }

    let newVersion;
    try {
      newVersion = await questionnaireService.createVersion(versionData, tenantContext.userId);
    } catch {
      newVersion = mockStore.insert('questionnaire_versions', {
        id: uuidv4(),
        project_id: projectId,
        name: versionData.name,
        module: versionData.module,
        version_number: 1,
        status: 'DRAFT',
        created_by: tenantContext.userId,
        created_at: new Date(),
        updated_at: new Date(),
      });
    }

    if (newVersion && !mockStore.findById('questionnaire_versions', newVersion.id)) {
      mockStore.insert('questionnaire_versions', {
        id: newVersion.id,
        project_id: projectId,
        name: newVersion.name,
        module: newVersion.module,
        version_number: newVersion.version_number || 1,
        status: newVersion.status || 'DRAFT',
        created_by: tenantContext.userId,
        created_at: new Date(),
        updated_at: new Date(),
      });
    }

    // Automatically bind newly built questionnaire to this campaign
    await this.bindQuestionnaire(projectId, newVersion.id, {
      module: newVersion.module,
      isPrimary: true,
    }, tenantContext);

    return newVersion;
  }
}

module.exports = new ProjectsService();
