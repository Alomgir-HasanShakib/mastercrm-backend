/**
 * @file projects.controller.js
 * @description Controller for Campaign & Projects Management, Multi-Vendor Equal Split Allocation,
 * Strict Multi-Vendor Data Isolation, and Campaign-Questionnaire Binding Studio.
 */

const projectsService = require('./projects.service');
const { success } = require('../../utils/response');
const { logOperation } = require('../../middlewares/auditLog.middleware');

class ProjectsController {
  async listProjects(req, res, next) {
    try {
      const result = await projectsService.listProjects(req.query, req.pagination, req.tenantContext);
      return success(res, result.projects, 'Campaigns retrieved successfully', 200, { total: result.total });
    } catch (err) {
      return next(err);
    }
  }

  async getProject(req, res, next) {
    try {
      const project = await projectsService.getProjectById(req.params.id, req.tenantContext);
      return success(res, project, 'Campaign details retrieved successfully');
    } catch (err) {
      return next(err);
    }
  }

  async createProject(req, res, next) {
    try {
      const project = await projectsService.createProject(req.body, req.tenantContext);

      logOperation({
        req,
        action: 'CREATE_PROJECT',
        module: 'PROJECTS',
        entityType: 'projects',
        entityId: project.id,
        newValues: req.body,
        metadata: { name: project.name, code: project.code },
      });

      return success(res, project, 'Campaign created successfully', 201);
    } catch (err) {
      return next(err);
    }
  }

  async updateProject(req, res, next) {
    try {
      const project = await projectsService.updateProject(req.params.id, req.body, req.tenantContext);

      logOperation({
        req,
        action: 'UPDATE_PROJECT',
        module: 'PROJECTS',
        entityType: 'projects',
        entityId: req.params.id,
        newValues: req.body,
        metadata: { name: project?.name },
      });

      return success(res, project, 'Campaign updated successfully');
    } catch (err) {
      return next(err);
    }
  }

  async deleteProject(req, res, next) {
    try {
      await projectsService.deleteProject(req.params.id, req.tenantContext);

      logOperation({
        req,
        action: 'DELETE_PROJECT',
        module: 'PROJECTS',
        entityType: 'projects',
        entityId: req.params.id,
        metadata: { deletedId: req.params.id },
      });

      return success(res, null, 'Campaign deleted successfully');
    } catch (err) {
      return next(err);
    }
  }

  // ==========================================================================
  // MULTI-VENDOR ALLOCATION & STRICT DATA ISOLATION
  // ==========================================================================

  /**
   * Split campaign leads evenly among multiple vendors OR assign 100% to a single vendor.
   * e.g., 65 leads across 5 vendors -> 13 leads per vendor, OR 100% leads to 1 vendor.
   */
  async allocateLeads(req, res, next) {
    try {
      const { vendorId, vendorIds, reallocateAll, method, distributeRemainder } = req.body;
      const result = await projectsService.allocateLeads(
        req.params.id,
        { vendorId, vendorIds, reallocateAll, method, distributeRemainder },
        req.tenantContext
      );

      const isSingle = result?.method === 'SINGLE' || method === 'SINGLE' || method === 'SINGLE_VENDOR';

      logOperation({
        req,
        action: isSingle ? 'ALLOCATE_LEADS_SINGLE_VENDOR' : 'ALLOCATE_LEADS_EQUAL_SPLIT',
        module: 'PROJECTS',
        entityType: 'projects',
        entityId: req.params.id,
        newValues: { vendorId, vendorIds, method, reallocateAll },
        metadata: { resultSummary: result?.summary || result },
      });

      return success(
        res,
        result,
        result?.message || (isSingle ? '100% of leads assigned to single vendor successfully' : 'Campaign leads split evenly among vendors successfully')
      );
    } catch (err) {
      return next(err);
    }
  }

  /**
   * Auto-assign remaining leads in pending pool across active vendors.
   */
  async autoAssignLeads(req, res, next) {
    try {
      const result = await projectsService.autoAssignPendingLeads(req.params.id, req.tenantContext);

      logOperation({
        req,
        action: 'AUTO_ASSIGN_PENDING_LEADS',
        module: 'PROJECTS',
        entityType: 'projects',
        entityId: req.params.id,
        metadata: { result },
      });

      return success(res, result, 'Pending campaign leads auto-assigned successfully');
    } catch (err) {
      return next(err);
    }
  }

  /**
   * Reallocate leads from one vendor to another.
   */
  async reallocateVendorLeads(req, res, next) {
    try {
      const { fromVendorId, toVendorId, status } = req.body;
      const result = await projectsService.reallocateVendorLeads(
        req.params.id,
        fromVendorId,
        toVendorId,
        { status },
        req.tenantContext
      );

      logOperation({
        req,
        action: 'REALLOCATE_VENDOR_LEADS',
        module: 'PROJECTS',
        entityType: 'projects',
        entityId: req.params.id,
        newValues: { fromVendorId, toVendorId, status },
        metadata: { result },
      });

      return success(res, result, result.message || 'Leads reallocated successfully between vendors');
    } catch (err) {
      return next(err);
    }
  }

  /**
   * Get campaign leads enforcing strict multi-vendor isolation.
   * Vendor A cannot see Vendor B's leads!
   */
  async getCampaignLeads(req, res, next) {
    try {
      const result = await projectsService.getCampaignLeads(
        req.params.id,
        req.query,
        req.tenantContext
      );
      return success(res, result.leads, 'Campaign leads retrieved successfully', 200, {
        total: result.total,
        metrics: result.metrics,
      });
    } catch (err) {
      return next(err);
    }
  }

  /**
   * Survey a campaign lead with strict vendor isolation check.
   */
  async surveyLead(req, res, next) {
    try {
      const lead = await projectsService.surveyCampaignLead(
        req.params.leadId,
        req.body,
        req.tenantContext
      );
      return success(res, lead, 'Campaign lead surveyed successfully');
    } catch (err) {
      return next(err);
    }
  }

  /**
   * Get lead allocation summary & metrics.
   */
  async getLeadMetrics(req, res, next) {
    try {
      const tenantContext = { ...req.tenantContext };
      if (req.query.vendorId) {
        tenantContext.vendorId = req.query.vendorId;
      }
      const metrics = await projectsService.getLeadAllocationMetrics(req.params.id, tenantContext);
      return success(res, metrics, 'Campaign lead allocation metrics retrieved successfully');
    } catch (err) {
      return next(err);
    }
  }

  // ==========================================================================
  // CAMPAIGN - QUESTIONNAIRE BINDING
  // ==========================================================================

  /**
   * Bind existing questionnaire from Question Builder to campaign.
   */
  async bindQuestionnaire(req, res, next) {
    try {
      const { questionnaireId, module, isPrimary } = req.body;
      const result = await projectsService.bindQuestionnaire(
        req.params.id,
        questionnaireId,
        { module, isPrimary },
        req.tenantContext
      );
      return success(res, result, 'Questionnaire bound to campaign successfully');
    } catch (err) {
      return next(err);
    }
  }

  /**
   * Unbind questionnaire from campaign.
   */
  async unbindQuestionnaire(req, res, next) {
    try {
      await projectsService.unbindQuestionnaire(
        req.params.id,
        req.params.questionnaireId,
        req.tenantContext
      );
      return success(res, null, 'Questionnaire unbound from campaign successfully');
    } catch (err) {
      return next(err);
    }
  }

  /**
   * Get bound questionnaires for campaign.
   */
  async getBoundQuestionnaires(req, res, next) {
    try {
      const questionnaires = await projectsService.getBoundQuestionnaires(req.params.id, req.tenantContext);
      return success(res, questionnaires, 'Bound questionnaires retrieved successfully');
    } catch (err) {
      return next(err);
    }
  }

  /**
   * List all questionnaires available in Question Builder for campaign binding.
   */
  async getAvailableQuestionnaires(req, res, next) {
    try {
      const list = await projectsService.getAvailableQuestionnaires(req.tenantContext);
      return success(res, list, 'Available questionnaires retrieved successfully');
    } catch (err) {
      return next(err);
    }
  }

  /**
   * Build new questionnaire specifically for this campaign and bind it immediately.
   */
  async createCampaignQuestionnaire(req, res, next) {
    try {
      const questionnaire = await projectsService.createCampaignQuestionnaire(
        req.params.id,
        req.body,
        req.tenantContext
      );
      return success(res, questionnaire, 'Campaign questionnaire built and bound successfully', 201);
    } catch (err) {
      return next(err);
    }
  }

  /**
   * Pull table records from client external DB into this campaign.
   */
  async pullData(req, res, next) {
    try {
      const clientDbSyncService = require('../client-db/clientDbSync.service');
      const payload = {
        ...req.body,
        projectId: req.params.id,
        campaignId: req.params.id,
      };
      const result = await clientDbSyncService.pullCampaignData(payload, req.tenantContext);
      return success(res, result, result.details || 'Campaign data pulled successfully');
    } catch (err) {
      return next(err);
    }
  }

  /**
   * Synchronize leads for campaign from configured client/input table on-demand.
   * Compares against existing records and ingests only new records into campaign_leads.
   *
   * @route POST /api/v1/projects/:id/sync-leads
   */
  async syncLeads(req, res, next) {
    try {
      const hourlySyncService = require('../../services/hourlyCampaignSync.service');
      const payload = {
        tableName: req.body?.tableName || req.body?.client_table_name || req.body?.input_table,
        triggeredBy: 'MANUAL_TRIGGER',
      };
      const result = await hourlySyncService.syncCampaignLeads(req.params.id, payload, req.tenantContext);
      return success(res, {
        newLeadsPulled: result.newLeadsPulled || 0,
        totalLeads: result.totalLeads || 0,
        syncedAt: result.syncedAt || new Date(),
        tableName: result.tableName,
        projectId: result.projectId,
        details: result.details,
      }, result.details || 'Campaign leads synchronized successfully');
    } catch (err) {
      return next(err);
    }
  }

  async syncAllCampaigns(req, res, next) {
    try {
      const hourlySyncService = require('../../services/hourlyCampaignSync.service');
      const result = await hourlySyncService.syncAllActiveCampaigns({ triggeredBy: 'MANUAL_TRIGGER' });
      return success(res, result, `Sweep completed: ${result.totalNewLeads} new leads ingested across ${result.campaignsProcessed} campaigns.`);
    } catch (err) {
      return next(err);
    }
  }
}

module.exports = new ProjectsController();
