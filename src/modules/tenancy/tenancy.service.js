/**
 * @file tenancy.service.js
 * @description Business logic layer for tenancy domain: Organizations, Clients, Vendors, Projects, Modules, Languages.
 */

const { ConflictError, NotFoundError, AuthorizationError } = require('../../utils/errors');
const tenancyModel = require('./tenancy.model');
const usersModel = require('../users/users.model');
const { hashPassword } = require('../../utils/crypto');
const db = require('../../database/connection');
const mockStore = require('../../database/mockStore');

// ==========================================
// ORGANIZATIONS
// ==========================================

/**
 * Lists organizations with pagination.
 *
 * @param {object} filters
 * @param {object} pagination
 * @returns {Promise<{ organizations: Array<object>, total: number }>}
 */
const listOrganizations = async (filters = {}, pagination = {}, tenantContext = {}) => {
  const scopedFilters = { ...filters };
  // Non-Master Admin can ONLY see their own organization!
  if (!tenantContext.isMasterAdmin && tenantContext.organizationId) {
    scopedFilters.id = tenantContext.organizationId;
  }
  const [organizations, total] = await Promise.all([
    tenancyModel.findAllOrganizations(scopedFilters, pagination),
    tenancyModel.countOrganizations(scopedFilters),
  ]);

  return { organizations, total };
};

/**
 * Retrieves a single organization by ID with tenant access control.
 *
 * @param {string|number} id
 * @param {object} tenantContext
 * @returns {Promise<object>}
 */
const getOrganizationById = async (id, tenantContext = {}) => {
  if (!tenantContext.isMasterAdmin && (!tenantContext.organizationId || String(tenantContext.organizationId) !== String(id))) {
    throw new AuthorizationError('Forbidden: Access denied to organization outside your tenant.');
  }

  const org = await tenancyModel.findOrganizationById(id);
  if (!org) {
    throw new NotFoundError(`Organization with ID '${id}' was not found.`);
  }
  return org;
};

/**
 * Creates a new organization and automatically generates an Organization Admin user.
 *
 * @param {object} data
 * @returns {Promise<object>}
 */
const createOrganization = async (data, tenantContext = {}) => {
  if (tenantContext && !tenantContext.isMasterAdmin) {
    throw new AuthorizationError('Forbidden: Only Platform Super Admin (Master Admin) can create new tenant organizations.');
  }

  const code = (data.code || data.slug || '').toUpperCase();
  const existing = await tenancyModel.findOrganizationByCode(code);
  if (existing) {
    throw new ConflictError(`Organization with code '${code}' already exists.`);
  }

  // 1. Create Organization in Database
  const createdOrg = await tenancyModel.createOrganization({
    ...data,
    code,
  });

  // 2. Automatically create Organization Admin user
  const adminEmail = (data.adminEmail || data.email || `${code.toLowerCase()}@${data.domain || 'mastercrm.io'}`).toLowerCase().trim();
  const defaultPassword = data.adminPassword || 'Admin@123';
  const adminName = data.adminName || `${createdOrg.name} Admin`;

  try {
    let orgAdminRole = null;
    try {
      orgAdminRole = await db('roles')
        .where('slug', 'ORGANIZATION_ADMIN')
        .orWhere('slug', 'ORG_ADMIN')
        .first();

      if (!orgAdminRole) {
        const { randomUUID } = require('crypto');
        const [inserted] = await db('roles')
          .insert({
            id: randomUUID(),
            name: 'Organization Administrator',
            slug: 'ORGANIZATION_ADMIN',
            display_name: 'Organization Admin',
            description: 'Tenant Organization Administrator managing organization vendors, users, campaigns, and operations.',
            is_system: true,
            permissions: JSON.stringify([
              'tenancy:*',
              'organizations:read',
              'clients:*',
              'vendors:*',
              'projects:*',
              'users:*',
              'questionnaires:*',
              'submissions:*',
              'capi:*',
              'super_audit:*',
              'tvc:*',
              'fa:*',
              'reports:*',
              'audit_logs:read',
            ]),
            created_at: new Date(),
            updated_at: new Date(),
          })
          .returning('*');
        orgAdminRole = inserted;
      }
    } catch (_) {
      const rolesList = mockStore.data?.roles || [];
      orgAdminRole = rolesList.find((r) => r.slug === 'ORGANIZATION_ADMIN') || {
        id: '55555555-5555-5555-5555-555555555520',
        slug: 'ORGANIZATION_ADMIN',
        name: 'Organization Administrator',
      };
    }

    const passwordHash = await hashPassword(defaultPassword);
    const nameParts = adminName.trim().split(' ');
    const firstName = nameParts[0] || 'Org';
    const lastName = nameParts.slice(1).join(' ') || 'Admin';

    const existingUser = await usersModel.findByEmail(adminEmail);
    if (!existingUser) {
      const newAdminUser = await usersModel.create({
        email: adminEmail,
        password_hash: passwordHash,
        first_name: firstName,
        last_name: lastName,
        phone: data.phone || data.contact_phone || null,
        role_id: orgAdminRole?.id || null,
        organization_id: createdOrg.id,
        vendor_id: null,
        status: 'ACTIVE',
      });

      createdOrg.adminUser = {
        id: newAdminUser.id,
        email: adminEmail,
        firstName,
        lastName,
        role: orgAdminRole?.slug || 'ORGANIZATION_ADMIN',
        defaultPassword,
        note: 'Organization Administrator account successfully provisioned with full tenant rights.',
      };
    } else {
      // If user exists, update their organization, role and password so login is guaranteed to work!
      await usersModel.update(existingUser.id, {
        organization_id: createdOrg.id,
        role_id: orgAdminRole?.id || existingUser.role_id,
        password_hash: passwordHash,
        status: 'ACTIVE',
        deleted_at: null,
      });

      createdOrg.adminUser = {
        id: existingUser.id,
        email: adminEmail,
        firstName: existingUser.first_name || firstName,
        lastName: existingUser.last_name || lastName,
        role: orgAdminRole?.slug || 'ORGANIZATION_ADMIN',
        defaultPassword,
        note: 'Existing user updated with Organization Administrator rights.',
      };
    }
  } catch (userErr) {
    console.error('Error auto-creating organization admin user:', userErr);
  }

  return createdOrg;
};

/**
 * Updates an organization.
 *
 * @param {string|number} id
 * @param {object} data
 * @returns {Promise<object>}
 */
const updateOrganization = async (id, data, tenantContext = {}) => {
  await getOrganizationById(id, tenantContext);

  if (data.code) {
    const existing = await tenancyModel.findOrganizationByCode(data.code);
    if (existing && String(existing.id) !== String(id)) {
      throw new ConflictError(`Organization with code '${data.code}' already exists.`);
    }
  }

  const updatePayload = { ...data };
  if (updatePayload.enableAiAudit !== undefined) {
    updatePayload.enable_ai_audit = Boolean(updatePayload.enableAiAudit);
    delete updatePayload.enableAiAudit;
  }
  if (updatePayload.enable_ai_audit !== undefined) {
    updatePayload.enable_ai_audit = Boolean(updatePayload.enable_ai_audit);
  }

  return tenancyModel.updateOrganization(id, updatePayload);
};


// ==========================================
// CLIENTS
// ==========================================

/**
 * Lists clients scoped to active tenant.
 *
 * @param {object} filters
 * @param {object} pagination
 * @param {object} tenantContext
 * @returns {Promise<{ clients: Array<object>, total: number }>}
 */
const listClients = async (filters = {}, pagination = {}, tenantContext = {}) => {
  const scopedFilters = { ...filters };
  if (!tenantContext.isMasterAdmin && tenantContext.organizationId) {
    scopedFilters.organizationId = tenantContext.organizationId;
  }

  const [clients, total] = await Promise.all([
    tenancyModel.findAllClients(scopedFilters, pagination),
    tenancyModel.countClients(scopedFilters),
  ]);

  return { clients, total };
};

/**
 * Retrieves a client by ID.
 *
 * @param {string|number} id
 * @param {object} tenantContext
 * @returns {Promise<object>}
 */
const getClientById = async (id, tenantContext = {}) => {
  const orgFilter = !tenantContext.isMasterAdmin ? tenantContext.organizationId : null;
  const client = await tenancyModel.findClientById(id, orgFilter);
  if (!client) {
    throw new NotFoundError(`Client with ID '${id}' was not found.`);
  }
  return client;
};

/**
 * Creates a new client.
 *
 * @param {object} data
 * @param {object} tenantContext
 * @returns {Promise<object>}
 */
const createClient = async (data, tenantContext = {}) => {
  let organizationId = data.organizationId;
  if (!tenantContext.isMasterAdmin || !organizationId) {
    organizationId = tenantContext.organizationId;
  }

  const existing = await tenancyModel.findClientByCode(data.code, organizationId);
  if (existing) {
    throw new ConflictError(`Client with code '${data.code}' already exists in this organization.`);
  }

  return tenancyModel.createClient({ ...data, organizationId });
};

/**
 * Updates an existing client.
 *
 * @param {string|number} id
 * @param {object} data
 * @param {object} tenantContext
 * @returns {Promise<object>}
 */
const updateClient = async (id, data, tenantContext = {}) => {
  const client = await getClientById(id, tenantContext);

  if (data.code) {
    const existing = await tenancyModel.findClientByCode(data.code, client.organization_id);
    if (existing && String(existing.id) !== String(id)) {
      throw new ConflictError(`Client with code '${data.code}' already exists in this organization.`);
    }
  }

  return tenancyModel.updateClient(id, data);
};

/**
 * Toggles or updates client active status.
 *
 * @param {string|number} id
 * @param {object} statusPayload
 * @param {object} tenantContext
 * @returns {Promise<object>}
 */
const toggleClientStatus = async (id, statusPayload, tenantContext = {}) => {
  await getClientById(id, tenantContext);

  let newStatus = statusPayload.status;
  if (!newStatus && statusPayload.isActive !== undefined) {
    newStatus = statusPayload.isActive ? 'ACTIVE' : 'INACTIVE';
  }

  return tenancyModel.updateClient(id, { status: newStatus || 'ACTIVE' });
};

// ==========================================
// VENDORS
// ==========================================

/**
 * Lists vendors scoped to tenant.
 *
 * @param {object} filters
 * @param {object} pagination
 * @param {object} tenantContext
 * @returns {Promise<{ vendors: Array<object>, total: number }>}
 */
const listVendors = async (filters = {}, pagination = {}, tenantContext = {}) => {
  const scopedFilters = { ...filters };
  if (!tenantContext.isMasterAdmin && tenantContext.organizationId) {
    scopedFilters.organizationId = tenantContext.organizationId;
  }

  // If vendor admin or vendor staff, only see their own vendor
  if (tenantContext.vendorId) {
    scopedFilters.id = tenantContext.vendorId;
  }

  const [vendors, total] = await Promise.all([
    tenancyModel.findAllVendors(scopedFilters, pagination),
    tenancyModel.countVendors(scopedFilters),
  ]);

  return { vendors, total };
};

/**
 * Retrieves vendor by ID.
 *
 * @param {string|number} id
 * @param {object} tenantContext
 * @returns {Promise<object>}
 */
const getVendorById = async (id, tenantContext = {}) => {
  if (tenantContext.vendorId && String(tenantContext.vendorId) !== String(id)) {
    throw new AuthorizationError('Forbidden: Access denied to vendor record outside your organization.');
  }

  const orgFilter = !tenantContext.isMasterAdmin ? tenantContext.organizationId : null;
  const vendor = await tenancyModel.findVendorById(id, orgFilter);
  if (!vendor) {
    throw new NotFoundError(`Vendor with ID '${id}' was not found.`);
  }
  return vendor;
};

/**
 * Creates a new vendor.
 *
 * @param {object} data
 * @param {object} tenantContext
 * @returns {Promise<object>}
 */
const createVendor = async (data, tenantContext = {}) => {
  let organizationId = data.organizationId;
  if (!tenantContext.isMasterAdmin || !organizationId) {
    organizationId = tenantContext.organizationId;
  }
  if (!organizationId) {
    const orgs = await tenancyModel.findAllOrganizations({}, { limit: 1 });
    organizationId = orgs[0]?.id;
  }

  const vendorCode = (data.code || `VEN_${Date.now().toString().slice(-4)}`).toUpperCase();
  const existing = await tenancyModel.findVendorByCode(vendorCode, organizationId);
  if (existing) {
    throw new ConflictError(`Vendor with code '${vendorCode}' already exists in this organization.`);
  }

  // Strict AI Entitlement Check: If parent organization has AI disabled or 0 licenses, force vendor enable_ai_audit to false
  if (organizationId) {
    const parentOrg = await tenancyModel.findOrganizationById(organizationId);
    if (parentOrg && (!parentOrg.enable_ai_audit || parentOrg.audit_ai_licenses < 1)) {
      data.enable_ai_audit = false;
    }
  }

  return tenancyModel.createVendor({ ...data, code: vendorCode, organizationId });
};

/**
 * Updates a vendor.
 *
 * @param {string|number} id
 * @param {object} data
 * @param {object} tenantContext
 * @returns {Promise<object>}
 */
const updateVendor = async (id, data, tenantContext = {}) => {
  const vendor = await getVendorById(id, tenantContext);

  if (data.code) {
    const existing = await tenancyModel.findVendorByCode(data.code, vendor.organization_id);
    if (existing && String(existing.id) !== String(id)) {
      throw new ConflictError(`Vendor with code '${data.code}' already exists in this organization.`);
    }
  }

  // Strict AI Entitlement Check: If parent organization has AI disabled or 0 licenses, force vendor enable_ai_audit to false
  const targetOrgId = data.organizationId || vendor.organization_id;
  if (targetOrgId) {
    const parentOrg = await tenancyModel.findOrganizationById(targetOrgId);
    if (parentOrg && (!parentOrg.enable_ai_audit || parentOrg.audit_ai_licenses < 1)) {
      data.enable_ai_audit = false;
    }
  }

  return tenancyModel.updateVendor(id, data);
};

/**
 * Toggles or updates vendor active status.
 *
 * @param {string|number} id
 * @param {object} statusPayload
 * @param {object} tenantContext
 * @returns {Promise<object>}
 */
const toggleVendorStatus = async (id, statusPayload, tenantContext = {}) => {
  await getVendorById(id, tenantContext);

  let newStatus = statusPayload.status;
  if (!newStatus && statusPayload.isActive !== undefined) {
    newStatus = statusPayload.isActive ? 'ACTIVE' : 'INACTIVE';
  }

  return tenancyModel.updateVendor(id, { status: newStatus || 'ACTIVE' });
};

// ==========================================
// PROJECTS / CAMPAIGNS
// ==========================================

/**
 * Lists projects scoped to tenant.
 *
 * @param {object} filters
 * @param {object} pagination
 * @param {object} tenantContext
 * @returns {Promise<{ projects: Array<object>, total: number }>}
 */
const listProjects = async (filters = {}, pagination = {}, tenantContext = {}) => {
  const scopedFilters = { ...filters };
  if (!tenantContext.isMasterAdmin && tenantContext.organizationId) {
    scopedFilters.organizationId = tenantContext.organizationId;
  }
  if (!tenantContext.isMasterAdmin && tenantContext.vendorId) {
    scopedFilters.vendorId = tenantContext.vendorId;
  }

  const [projects, total] = await Promise.all([
    tenancyModel.findAllProjects(scopedFilters, pagination),
    tenancyModel.countProjects(scopedFilters),
  ]);

  return { projects, total };
};

/**
 * Retrieves a project by ID along with full configuration, vendors, and languages.
 *
 * @param {string|number} id
 * @param {object} tenantContext
 * @returns {Promise<object>}
 */
const getProjectById = async (id, tenantContext = {}) => {
  const orgFilter = !tenantContext.isMasterAdmin ? tenantContext.organizationId : null;
  const project = await tenancyModel.findProjectById(id, orgFilter);
  if (!project) {
    throw new NotFoundError(`Project with ID '${id}' was not found.`);
  }

  const [vendors, languages] = await Promise.all([
    tenancyModel.findProjectVendors(id),
    tenancyModel.findProjectLanguages(id),
  ]);

  let parsedConfig = {};
  if (typeof project.config === 'string') {
    try {
      parsedConfig = JSON.parse(project.config || '{}');
    } catch {
      parsedConfig = {};
    }
  } else if (typeof project.config === 'object' && project.config !== null) {
    parsedConfig = project.config;
  }

  return {
    ...project,
    config: parsedConfig,
    vendors: vendors || [],
    languages: languages || [],
  };
};

/**
 * Creates a new project.
 *
 * @param {object} data
 * @param {object} tenantContext
 * @returns {Promise<object>}
 */
const createProject = async (data, tenantContext = {}) => {
  const role = (tenantContext.role || tenantContext.roleName || tenantContext.role_name || '').toUpperCase().replace(/\s+/g, '_');
  if (role === 'VENDOR_ADMIN' || role.includes('VENDOR') || tenantContext.vendorId) {
    throw new AuthorizationError('Permission Denied: Vendors are not permitted to create campaigns.');
  }

  let organizationId = data.organizationId;
  if (!tenantContext.isMasterAdmin || !organizationId) {
    organizationId = tenantContext.organizationId;
  }
  if (!organizationId) {
    const orgs = await tenancyModel.findAllOrganizations({}, { limit: 1 });
    organizationId = orgs[0]?.id;
  }

  // Ensure client exists in tenant, or find/create default client
  let client = null;
  if (data.clientId) {
    client = await tenancyModel.findClientById(data.clientId, organizationId);
  }
  if (!client) {
    const clients = await tenancyModel.findAllClients({ organizationId }, { limit: 1 });
    if (clients && clients.length > 0) {
      client = clients[0];
    } else {
      client = await tenancyModel.createClient({
        name: data.clientName || 'General Sponsoring Client',
        code: 'GEN-CLIENT',
        organizationId,
      });
    }
  }

  const projectCode = (data.code || data.project_code || `PRJ_${Date.now().toString().slice(-4)}`).toUpperCase();
  const existing = await tenancyModel.findProjectByCode(projectCode, organizationId);
  if (existing) {
    throw new ConflictError(`Project with code '${projectCode}' already exists in this organization.`);
  }

  const inputTbl = (
    data.client_table_name ||
    data.input_table_name ||
    data.input_table ||
    data.source_table ||
    data.tableName ||
    data.table_name ||
    data.metadata?.client_table_name ||
    data.metadata?.input_table ||
    data.metadata?.source_table ||
    ''
  ).trim() || null;
  const out1Tbl = (data.output1_table_name?.trim() || data.client_output1_table?.trim()) || null;
  const out2Tbl = (data.output2_table_name?.trim() || data.client_output2_table?.trim()) || null;

  const projectRecord = await tenancyModel.createProject({
    ...data,
    clientId: client ? client.id : null,
    code: projectCode,
    project_code: projectCode,
    client_table_name: inputTbl,
    output1_table_name: out1Tbl,
    output2_table_name: out2Tbl,
    organizationId,
  });

  // Assign vendor(s) immediately if specified during creation (SINGLE vs EQUAL)
  const distMethod = data.distributionMethod || data.distribution_method || (data.vendorId ? 'SINGLE' : 'EQUAL');
  const targetVendorId = data.vendorId || (Array.isArray(data.vendorIds) && data.vendorIds.length === 1 ? data.vendorIds[0] : null);

  if ((distMethod === 'SINGLE' || distMethod === 'SINGLE_VENDOR') && targetVendorId) {
    try {
      await db('project_vendor_assignments').insert({
        id: uuidv4(),
        project_id: projectRecord.id,
        vendor_id: targetVendorId,
        is_active: true,
        quota: JSON.stringify({ mode: 'SINGLE_100_PERCENT' }),
        created_at: new Date(),
      }).catch(() => null);

      await db('projects').where('id', projectRecord.id).update({
        distribution_method: 'SINGLE',
        assigned_single_vendor_id: targetVendorId,
      }).catch(() => null);
    } catch (_) {}
  } else if (Array.isArray(data.vendorIds) && data.vendorIds.length > 0) {
    try {
      for (const vId of data.vendorIds) {
        await db('project_vendor_assignments').insert({
          id: uuidv4(),
          project_id: projectRecord.id,
          vendor_id: vId,
          is_active: true,
          quota: JSON.stringify({ mode: 'EQUAL_SPLIT' }),
          created_at: new Date(),
        }).catch(() => null);
      }
      await db('projects').where('id', projectRecord.id).update({
        distribution_method: 'EQUAL',
        assigned_single_vendor_id: null,
      }).catch(() => null);
    } catch (_) {}
  }

  // Automatically provision dynamic tables ONLY if client_table_name was actually provided by the user!
  if (inputTbl) {
    try {
      const schemaEngine = require('../schema-engine/schema-engine.service');
      if (data.inputColumns || data.output1Columns || data.schemaConfig) {
        await schemaEngine.createTablesFromSchema({
          inputTable: { name: inputTbl, columns: data.inputColumns || data.schemaConfig?.inputColumns },
          outputTable1: out1Tbl ? { name: out1Tbl, columns: data.output1Columns || data.schemaConfig?.output1Columns } : null,
          outputTable2: out2Tbl ? { name: out2Tbl, columns: data.output2Columns || data.schemaConfig?.output2Columns } : null,
        });
      } else {
        const superAuditTables = require('../super-audit/superAuditTables.service');
        await superAuditTables.ensureDynamicTables(inputTbl, out1Tbl, out2Tbl);
      }

      // Auto-pull data from client table immediately upon campaign creation
      const hourlySyncService = require('../../services/hourlyCampaignSync.service');
      hourlySyncService.syncCampaignLeads(
        projectRecord.id,
        { tableName: inputTbl, triggeredBy: 'CAMPAIGN_CREATE' },
        { organizationId, isMasterAdmin: !!tenantContext.isMasterAdmin }
      ).catch((pullErr) => {
        console.warn('[CAMPAIGN_AUTO_PULL] Note on initial table data pull:', pullErr.message);
      });
    } catch (tableErr) {
      console.warn('[CAMPAIGN_TABLE_INIT] Note on auto triplet table provisioning:', tableErr.message);
    }
  }

  return projectRecord;
};

/**
 * Updates a project.
 *
 * @param {string|number} id
 * @param {object} data
 * @param {object} tenantContext
 * @returns {Promise<object>}
 */
const updateProject = async (id, data, tenantContext = {}) => {
  const role = (tenantContext.role || tenantContext.roleName || tenantContext.role_name || '').toUpperCase().replace(/\s+/g, '_');
  if (role === 'VENDOR_ADMIN' || role.includes('VENDOR') || tenantContext.vendorId) {
    throw new AuthorizationError('Permission Denied: Vendors are not permitted to edit campaigns.');
  }

  const project = await getProjectById(id, tenantContext);

  if (data.clientId) {
    const client = await tenancyModel.findClientById(data.clientId, project.organization_id);
    if (!client) {
      throw new NotFoundError(`Client with ID '${data.clientId}' does not exist in this organization.`);
    }
  }

  if (data.code) {
    const existing = await tenancyModel.findProjectByCode(data.code, project.organization_id);
    if (existing && String(existing.id) !== String(id)) {
      throw new ConflictError(`Project with code '${data.code}' already exists in this organization.`);
    }
  }

  const updatedRecord = await tenancyModel.updateProject(id, data);

  // If user is adding/updating table names and schema in edit section, provision/update dynamic tables!
  const targetInputTbl = (
    data.client_table_name ||
    data.input_table_name ||
    data.input_table ||
    data.source_table ||
    data.tableName ||
    data.table_name ||
    data.metadata?.client_table_name ||
    data.metadata?.input_table ||
    data.metadata?.source_table ||
    updatedRecord?.client_table_name ||
    project?.client_table_name ||
    ''
  ).trim() || null;
  const targetOut1Tbl = data.output1_table_name?.trim() || data.client_output1_table?.trim() || updatedRecord?.output1_table_name;
  const targetOut2Tbl = data.output2_table_name?.trim() || data.client_output2_table?.trim() || updatedRecord?.output2_table_name;

  if (targetInputTbl && (data.inputColumns || data.output1Columns || data.schemaConfig)) {
    try {
      const schemaEngine = require('../schema-engine/schema-engine.service');
      await schemaEngine.createTablesFromSchema({
        inputTable: { name: targetInputTbl, columns: data.inputColumns || data.schemaConfig?.inputColumns },
        outputTable1: targetOut1Tbl ? { name: targetOut1Tbl, columns: data.output1Columns || data.schemaConfig?.output1Columns } : null,
        outputTable2: targetOut2Tbl ? { name: targetOut2Tbl, columns: data.output2Columns || data.schemaConfig?.output2Columns } : null,
      });
    } catch (tableErr) {
      console.warn('[CAMPAIGN_TABLE_UPDATE] Note on auto triplet table update:', tableErr.message);
    }
  }

  // Auto-pull data immediately from client table upon update if table is provided or updated
  if (targetInputTbl && (
    data.client_table_name ||
    data.input_table ||
    data.input_table_name ||
    data.source_table ||
    data.tableName ||
    data.table_name ||
    data.metadata?.client_table_name ||
    data.metadata?.input_table ||
    data.metadata?.source_table ||
    data.autoPullData ||
    data.pullDataOnUpdate
  )) {
    try {
      const hourlySyncService = require('../../services/hourlyCampaignSync.service');
      hourlySyncService.syncCampaignLeads(
        id,
        { tableName: targetInputTbl, triggeredBy: 'CAMPAIGN_UPDATE' },
        { organizationId: project.organization_id, isMasterAdmin: true }
      ).catch((pullErr) => {
        console.warn('[CAMPAIGN_AUTO_PULL] Note on update table data pull:', pullErr.message);
      });
    } catch (pullInitErr) {
      console.warn('[CAMPAIGN_AUTO_PULL] Init error:', pullInitErr.message);
    }
  }

  return updatedRecord;
};

/**
 * Changes project status (DRAFT, ACTIVE, PAUSED, COMPLETED, ARCHIVED).
 *
 * @param {string|number} id
 * @param {string} status
 * @param {object} tenantContext
 * @returns {Promise<object>}
 */
const updateProjectStatus = async (id, status, tenantContext = {}) => {
  await getProjectById(id, tenantContext);
  return tenancyModel.updateProjectStatus(id, status);
};

/**
 * Assigns a vendor to a project.
 *
 * @param {string|number} projectId
 * @param {string|number} vendorId
 * @param {string} status
 * @param {object} tenantContext
 * @returns {Promise<object>}
 */
const assignVendorToProject = async (projectId, vendorId, status = 'ACTIVE', tenantContext = {}) => {
  const project = await getProjectById(projectId, tenantContext);

  const vendor = await tenancyModel.findVendorById(vendorId, project.organization_id);
  if (!vendor) {
    throw new NotFoundError(`Vendor with ID '${vendorId}' not found in this organization.`);
  }

  return tenancyModel.assignVendorToProject(projectId, vendorId, status);
};

/**
 * Removes a vendor from a project.
 *
 * @param {string|number} projectId
 * @param {string|number} vendorId
 * @param {object} tenantContext
 * @returns {Promise<boolean>}
 */
const removeVendorFromProject = async (projectId, vendorId, tenantContext = {}) => {
  await getProjectById(projectId, tenantContext);
  await tenancyModel.removeVendorFromProject(projectId, vendorId);
  return true;
};

/**
 * Configures active modules for a project.
 *
 * @param {string|number} projectId
 * @param {Array<string>} modules
 * @param {object} tenantContext
 * @returns {Promise<object>}
 */
const configureProjectModules = async (projectId, modules, tenantContext = {}) => {
  await getProjectById(projectId, tenantContext);
  return tenancyModel.updateProjectModules(projectId, modules);
};

/**
 * Gets active modules for a project.
 *
 * @param {string|number} projectId
 * @param {object} tenantContext
 * @returns {Promise<Array<string>>}
 */
const getProjectModules = async (projectId, tenantContext = {}) => {
  const project = await getProjectById(projectId, tenantContext);
  let modules = [];
  if (typeof project.config === 'string') {
    try {
      const parsed = JSON.parse(project.config || '{}');
      modules = parsed.modules || [];
    } catch {
      modules = [];
    }
  } else if (typeof project.config === 'object' && project.config !== null) {
    modules = project.config.modules || [];
  }
  return modules;
};

/**
 * Configures languages for a project.
 *
 * @param {string|number} projectId
 * @param {Array<object>} languages
 * @param {object} tenantContext
 * @returns {Promise<Array<object>>}
 */
const configureProjectLanguages = async (projectId, languages, tenantContext = {}) => {
  await getProjectById(projectId, tenantContext);
  return tenancyModel.configureProjectLanguages(projectId, languages);
};

/**
 * Retrieves configured languages for a project.
 *
 * @param {string|number} projectId
 * @param {object} tenantContext
 * @returns {Promise<Array<object>>}
 */
const getProjectLanguages = async (projectId, tenantContext = {}) => {
  await getProjectById(projectId, tenantContext);
  return tenancyModel.findProjectLanguages(projectId);
};

/**
 * Retrieves all vendors assigned to a project.
 *
 * @param {string|number} projectId
 * @param {object} tenantContext
 * @returns {Promise<Array<object>>}
 */
const getProjectVendors = async (projectId, tenantContext = {}) => {
  await getProjectById(projectId, tenantContext);
  return tenancyModel.findProjectVendors(projectId);
};

/**
 * Deletes an organization.
 *
 * @param {string|number} id
 * @returns {Promise<boolean>}
 */
const deleteOrganization = async (id, tenantContext = {}) => {
  if (tenantContext && !tenantContext.isMasterAdmin) {
    throw new AuthorizationError('Forbidden: Only Platform Super Admin (Master Admin) can delete organizations.');
  }
  await getOrganizationById(id, tenantContext);
  await tenancyModel.deleteOrganization(id);
  return true;
};

/**
 * Deletes a client.
 *
 * @param {string|number} id
 * @param {object} tenantContext
 * @returns {Promise<boolean>}
 */
const deleteClient = async (id, tenantContext = {}) => {
  await getClientById(id, tenantContext);
  await tenancyModel.deleteClient(id);
  return true;
};

/**
 * Deletes a vendor.
 *
 * @param {string|number} id
 * @param {object} tenantContext
 * @returns {Promise<boolean>}
 */
const deleteVendor = async (id, tenantContext = {}) => {
  await getVendorById(id, tenantContext);
  await tenancyModel.deleteVendor(id);
  return true;
};

/**
 * Deletes a project.
 *
 * @param {string|number} id
 * @param {object} tenantContext
 * @returns {Promise<boolean>}
 */
const deleteProject = async (id, tenantContext = {}) => {
  const role = (tenantContext.role || tenantContext.roleName || tenantContext.role_name || '').toUpperCase().replace(/\s+/g, '_');
  if (role === 'VENDOR_ADMIN' || role.includes('VENDOR') || tenantContext.vendorId) {
    throw new AuthorizationError('Permission Denied: Vendors are not permitted to delete campaigns.');
  }

  await getProjectById(id, tenantContext);
  await tenancyModel.deleteProject(id);
  return true;
};

/**
 * Updates enabled operational modules for an organization.
 * Only Super Admin (Master Admin) can update module entitlements.
 *
 * @param {string|number} id
 * @param {Array<string>|object} modules
 * @param {object} tenantContext
 * @returns {Promise<object>}
 */
const updateOrganizationModules = async (id, modules, tenantContext = {}) => {
  if (tenantContext && !tenantContext.isMasterAdmin) {
    throw new AuthorizationError('Forbidden: Only Platform Super Admin can configure module entitlements.');
  }

  await getOrganizationById(id, tenantContext);

  const normalizedModules = Array.isArray(modules)
    ? modules
    : (modules?.enabled_modules || modules?.enabledModules || modules?.modules || []);

  return tenancyModel.updateOrganization(id, {
    enabled_modules: normalizedModules,
  });
};

module.exports = {
  listOrganizations,
  getOrganizationById,
  createOrganization,
  updateOrganization,
  updateOrganizationModules,
  deleteOrganization,

  listClients,
  getClientById,
  createClient,
  updateClient,
  toggleClientStatus,
  deleteClient,

  listVendors,
  getVendorById,
  createVendor,
  updateVendor,
  toggleVendorStatus,
  deleteVendor,

  listProjects,
  getProjectById,
  createProject,
  updateProject,
  updateProjectStatus,
  deleteProject,

  getProjectVendors,
  assignVendorToProject,
  removeVendorFromProject,
  getProjectModules,
  configureProjectModules,
  getProjectLanguages,
  configureProjectLanguages,
};
