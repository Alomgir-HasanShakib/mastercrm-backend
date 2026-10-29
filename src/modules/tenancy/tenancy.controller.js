/**
 * @file tenancy.controller.js
 * @description Controller handling tenancy domain HTTP requests: Organizations, Clients, Vendors, Projects.
 */

const { success, paginated } = require('../../utils/response');
const { parsePagination, buildPaginationMeta } = require('../../utils/pagination');
const { auditLog } = require('../../services/auditLog');
const tenancyService = require('./tenancy.service');

// ==========================================
// ORGANIZATIONS
// ==========================================

const listOrganizations = async (req, res, next) => {
  try {
    const pagination = parsePagination(req.query);
    const filters = { search: req.query.search, status: req.query.status };
    const { organizations, total } = await tenancyService.listOrganizations(filters, pagination, req.tenantContext);
    const meta = buildPaginationMeta(total, pagination.page, pagination.limit);

    return paginated(res, organizations, meta, 'Organizations retrieved successfully', 200);
  } catch (err) {
    return next(err);
  }
};

const getOrganization = async (req, res, next) => {
  try {
    const organization = await tenancyService.getOrganizationById(req.params.id, req.tenantContext);
    return success(res, organization, 'Organization retrieved successfully', 200);
  } catch (err) {
    return next(err);
  }
};

const createOrganization = async (req, res, next) => {
  try {
    const created = await tenancyService.createOrganization(req.body, req.tenantContext);

    await auditLog({
      userId: req.user?.userId || req.user?.id,
      organizationId: created.id,
      action: 'CREATE_ORGANIZATION',
      resource: 'organizations',
      resourceId: created.id,
      details: { name: created.name, code: created.code },
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'],
    });

    return success(res, created, 'Organization created successfully', 201);
  } catch (err) {
    return next(err);
  }
};

const updateOrganization = async (req, res, next) => {
  try {
    const updated = await tenancyService.updateOrganization(req.params.id, req.body, req.tenantContext);

    await auditLog({
      userId: req.user?.userId || req.user?.id,
      organizationId: req.params.id,
      action: 'UPDATE_ORGANIZATION',
      resource: 'organizations',
      resourceId: req.params.id,
      details: req.body,
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'],
    });

    return success(res, updated, 'Organization updated successfully', 200);
  } catch (err) {
    return next(err);
  }
};

const updateOrganizationModules = async (req, res, next) => {
  try {
    const modules = req.body.enabled_modules || req.body.enabledModules || req.body.modules || req.body;
    const updated = await tenancyService.updateOrganizationModules(req.params.id, modules, req.tenantContext);

    await auditLog({
      userId: req.user?.userId || req.user?.id,
      organizationId: req.params.id,
      action: 'UPDATE_ORGANIZATION_MODULES',
      resource: 'organizations',
      resourceId: req.params.id,
      details: { enabled_modules: updated?.enabled_modules },
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'],
    });

    return success(res, updated, 'Organization modules updated successfully', 200);
  } catch (err) {
    return next(err);
  }
};

// ==========================================
// CLIENTS
// ==========================================

const listClients = async (req, res, next) => {
  try {
    const pagination = parsePagination(req.query);
    const filters = {
      search: req.query.search,
      status: req.query.status,
      organizationId: req.query.organizationId,
    };
    const { clients, total } = await tenancyService.listClients(filters, pagination, req.tenantContext);
    const meta = buildPaginationMeta(total, pagination.page, pagination.limit);

    return paginated(res, clients, meta, 'Clients retrieved successfully', 200);
  } catch (err) {
    return next(err);
  }
};

const getClient = async (req, res, next) => {
  try {
    const client = await tenancyService.getClientById(req.params.id, req.tenantContext);
    return success(res, client, 'Client retrieved successfully', 200);
  } catch (err) {
    return next(err);
  }
};

const createClient = async (req, res, next) => {
  try {
    const created = await tenancyService.createClient(req.body, req.tenantContext);

    await auditLog({
      userId: req.user?.userId || req.user?.id,
      organizationId: created.organization_id,
      action: 'CREATE_CLIENT',
      resource: 'clients',
      resourceId: created.id,
      details: { name: created.name, code: created.code },
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'],
    });

    return success(res, created, 'Client created successfully', 201);
  } catch (err) {
    return next(err);
  }
};

const updateClient = async (req, res, next) => {
  try {
    const updated = await tenancyService.updateClient(req.params.id, req.body, req.tenantContext);

    await auditLog({
      userId: req.user?.userId || req.user?.id,
      organizationId: updated.organization_id,
      action: 'UPDATE_CLIENT',
      resource: 'clients',
      resourceId: req.params.id,
      details: req.body,
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'],
    });

    return success(res, updated, 'Client updated successfully', 200);
  } catch (err) {
    return next(err);
  }
};

const toggleClientStatus = async (req, res, next) => {
  try {
    const updated = await tenancyService.toggleClientStatus(req.params.id, req.body, req.tenantContext);

    await auditLog({
      userId: req.user?.userId || req.user?.id,
      organizationId: updated.organization_id,
      action: 'TOGGLE_CLIENT_STATUS',
      resource: 'clients',
      resourceId: req.params.id,
      details: { status: updated.status },
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'],
    });

    return success(res, updated, 'Client status updated successfully', 200);
  } catch (err) {
    return next(err);
  }
};

// ==========================================
// VENDORS
// ==========================================

const listVendors = async (req, res, next) => {
  try {
    const pagination = parsePagination(req.query);
    const filters = {
      search: req.query.search,
      status: req.query.status,
      organizationId: req.query.organizationId,
    };
    const { vendors, total } = await tenancyService.listVendors(filters, pagination, req.tenantContext);
    const meta = buildPaginationMeta(total, pagination.page, pagination.limit);

    return paginated(res, vendors, meta, 'Vendors retrieved successfully', 200);
  } catch (err) {
    return next(err);
  }
};

const getVendor = async (req, res, next) => {
  try {
    const vendor = await tenancyService.getVendorById(req.params.id, req.tenantContext);
    return success(res, vendor, 'Vendor retrieved successfully', 200);
  } catch (err) {
    return next(err);
  }
};

const createVendor = async (req, res, next) => {
  try {
    const created = await tenancyService.createVendor(req.body, req.tenantContext);

    await auditLog({
      userId: req.user?.userId || req.user?.id,
      organizationId: created.organization_id,
      action: 'CREATE_VENDOR',
      resource: 'vendors',
      resourceId: created.id,
      details: { name: created.name, code: created.code },
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'],
    });

    return success(res, created, 'Vendor created successfully', 201);
  } catch (err) {
    return next(err);
  }
};

const updateVendor = async (req, res, next) => {
  try {
    const updated = await tenancyService.updateVendor(req.params.id, req.body, req.tenantContext);

    await auditLog({
      userId: req.user?.userId || req.user?.id,
      organizationId: updated.organization_id,
      action: 'UPDATE_VENDOR',
      resource: 'vendors',
      resourceId: req.params.id,
      details: req.body,
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'],
    });

    return success(res, updated, 'Vendor updated successfully', 200);
  } catch (err) {
    return next(err);
  }
};

const toggleVendorStatus = async (req, res, next) => {
  try {
    const updated = await tenancyService.toggleVendorStatus(req.params.id, req.body, req.tenantContext);

    await auditLog({
      userId: req.user?.userId || req.user?.id,
      organizationId: updated.organization_id,
      action: 'TOGGLE_VENDOR_STATUS',
      resource: 'vendors',
      resourceId: req.params.id,
      details: { status: updated.status },
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'],
    });

    return success(res, updated, 'Vendor status updated successfully', 200);
  } catch (err) {
    return next(err);
  }
};

// ==========================================
// PROJECTS / CAMPAIGNS
// ==========================================

const listProjects = async (req, res, next) => {
  try {
    const pagination = parsePagination(req.query);
    const filters = {
      search: req.query.search,
      status: req.query.status,
      clientId: req.query.clientId,
      organizationId: req.query.organizationId,
    };
    const { projects, total } = await tenancyService.listProjects(filters, pagination, req.tenantContext);
    const meta = buildPaginationMeta(total, pagination.page, pagination.limit);

    return paginated(res, projects, meta, 'Projects retrieved successfully', 200);
  } catch (err) {
    return next(err);
  }
};

const getProject = async (req, res, next) => {
  try {
    const project = await tenancyService.getProjectById(req.params.id, req.tenantContext);
    return success(res, project, 'Project retrieved successfully', 200);
  } catch (err) {
    return next(err);
  }
};

const createProject = async (req, res, next) => {
  try {
    const created = await tenancyService.createProject(req.body, req.tenantContext);

    await auditLog({
      userId: req.user?.userId || req.user?.id,
      organizationId: created.organization_id,
      action: 'CREATE_PROJECT',
      resource: 'projects',
      resourceId: created.id,
      details: { name: created.name, code: created.code, clientId: created.client_id },
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'],
    });

    return success(res, created, 'Project created successfully', 201);
  } catch (err) {
    return next(err);
  }
};

const updateProject = async (req, res, next) => {
  try {
    const updated = await tenancyService.updateProject(req.params.id, req.body, req.tenantContext);

    await auditLog({
      userId: req.user?.userId || req.user?.id,
      organizationId: updated.organization_id,
      action: 'UPDATE_PROJECT',
      resource: 'projects',
      resourceId: req.params.id,
      details: req.body,
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'],
    });

    return success(res, updated, 'Project updated successfully', 200);
  } catch (err) {
    return next(err);
  }
};

const updateProjectStatus = async (req, res, next) => {
  try {
    const updated = await tenancyService.updateProjectStatus(req.params.id, req.body.status, req.tenantContext);

    await auditLog({
      userId: req.user?.userId || req.user?.id,
      organizationId: updated.organization_id,
      action: 'UPDATE_PROJECT_STATUS',
      resource: 'projects',
      resourceId: req.params.id,
      details: { status: req.body.status },
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'],
    });

    return success(res, updated, `Project status changed to ${req.body.status}`, 200);
  } catch (err) {
    return next(err);
  }
};

const assignProjectVendor = async (req, res, next) => {
  try {
    const assignment = await tenancyService.assignVendorToProject(
      req.params.id,
      req.body.vendorId,
      req.body.status,
      req.tenantContext
    );

    await auditLog({
      userId: req.user?.userId || req.user?.id,
      organizationId: req.tenantContext?.organizationId,
      action: 'ASSIGN_PROJECT_VENDOR',
      resource: 'project_vendor_assignments',
      resourceId: req.params.id,
      details: { vendorId: req.body.vendorId, status: req.body.status },
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'],
    });

    return success(res, assignment, 'Vendor assigned to project successfully', 201);
  } catch (err) {
    return next(err);
  }
};

const removeProjectVendor = async (req, res, next) => {
  try {
    await tenancyService.removeVendorFromProject(req.params.id, req.params.vendorId, req.tenantContext);

    await auditLog({
      userId: req.user?.userId || req.user?.id,
      organizationId: req.tenantContext?.organizationId,
      action: 'REMOVE_PROJECT_VENDOR',
      resource: 'project_vendor_assignments',
      resourceId: req.params.id,
      details: { vendorId: req.params.vendorId },
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'],
    });

    return success(res, null, 'Vendor removed from project successfully', 200);
  } catch (err) {
    return next(err);
  }
};

const configureModules = async (req, res, next) => {
  try {
    const updated = await tenancyService.configureProjectModules(
      req.params.id,
      req.body.modules,
      req.tenantContext
    );

    await auditLog({
      userId: req.user?.userId || req.user?.id,
      organizationId: req.tenantContext?.organizationId,
      action: 'CONFIGURE_PROJECT_MODULES',
      resource: 'projects',
      resourceId: req.params.id,
      details: { modules: req.body.modules },
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'],
    });

    return success(res, updated, 'Project modules configured successfully', 200);
  } catch (err) {
    return next(err);
  }
};

const configureLanguages = async (req, res, next) => {
  try {
    const configured = await tenancyService.configureProjectLanguages(
      req.params.id,
      req.body.languages,
      req.tenantContext
    );

    await auditLog({
      userId: req.user?.userId || req.user?.id,
      organizationId: req.tenantContext?.organizationId,
      action: 'CONFIGURE_PROJECT_LANGUAGES',
      resource: 'project_languages',
      resourceId: req.params.id,
      details: { count: req.body.languages?.length },
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'],
    });

    return success(res, configured, 'Project languages configured successfully', 200);
  } catch (err) {
    return next(err);
  }
};

const getProjectVendors = async (req, res, next) => {
  try {
    const vendors = await tenancyService.getProjectVendors(req.params.id, req.tenantContext);
    return success(res, vendors, 'Project vendors retrieved successfully', 200);
  } catch (err) {
    return next(err);
  }
};

const getProjectModules = async (req, res, next) => {
  try {
    const modules = await tenancyService.getProjectModules(req.params.id, req.tenantContext);
    return success(res, modules, 'Project modules retrieved successfully', 200);
  } catch (err) {
    return next(err);
  }
};

const getProjectLanguages = async (req, res, next) => {
  try {
    const languages = await tenancyService.getProjectLanguages(req.params.id, req.tenantContext);
    return success(res, languages, 'Project languages retrieved successfully', 200);
  } catch (err) {
    return next(err);
  }
};

const deleteOrganization = async (req, res, next) => {
  try {
    await tenancyService.deleteOrganization(req.params.id, req.tenantContext);

    await auditLog({
      userId: req.user?.userId || req.user?.id,
      organizationId: req.params.id,
      action: 'DELETE_ORGANIZATION',
      resource: 'organizations',
      resourceId: req.params.id,
      details: {},
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'],
    });

    return success(res, null, 'Organization deleted successfully', 200);
  } catch (err) {
    return next(err);
  }
};

const deleteClient = async (req, res, next) => {
  try {
    await tenancyService.deleteClient(req.params.id, req.tenantContext);

    await auditLog({
      userId: req.user?.userId || req.user?.id,
      organizationId: req.tenantContext?.organizationId,
      action: 'DELETE_CLIENT',
      resource: 'clients',
      resourceId: req.params.id,
      details: {},
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'],
    });

    return success(res, null, 'Client deleted successfully', 200);
  } catch (err) {
    return next(err);
  }
};

const deleteVendor = async (req, res, next) => {
  try {
    await tenancyService.deleteVendor(req.params.id, req.tenantContext);

    await auditLog({
      userId: req.user?.userId || req.user?.id,
      organizationId: req.tenantContext?.organizationId,
      action: 'DELETE_VENDOR',
      resource: 'vendors',
      resourceId: req.params.id,
      details: {},
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'],
    });

    return success(res, null, 'Vendor deleted successfully', 200);
  } catch (err) {
    return next(err);
  }
};

const deleteProject = async (req, res, next) => {
  try {
    await tenancyService.deleteProject(req.params.id, req.tenantContext);

    await auditLog({
      userId: req.user?.userId || req.user?.id,
      organizationId: req.tenantContext?.organizationId,
      action: 'DELETE_PROJECT',
      resource: 'projects',
      resourceId: req.params.id,
      details: {},
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'],
    });

    return success(res, null, 'Project deleted successfully', 200);
  } catch (err) {
    return next(err);
  }
};

module.exports = {
  listOrganizations,
  getOrganization,
  createOrganization,
  updateOrganization,
  updateOrganizationModules,
  deleteOrganization,

  listClients,
  getClient,
  createClient,
  updateClient,
  toggleClientStatus,
  deleteClient,

  listVendors,
  getVendor,
  createVendor,
  updateVendor,
  toggleVendorStatus,
  deleteVendor,

  listProjects,
  getProject,
  createProject,
  updateProject,
  updateProjectStatus,
  deleteProject,

  getProjectVendors,
  assignProjectVendor,
  removeProjectVendor,
  getProjectModules,
  configureModules,
  getProjectLanguages,
  configureLanguages,
};
