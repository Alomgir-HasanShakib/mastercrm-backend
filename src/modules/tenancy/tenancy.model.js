/**
 * @file tenancy.model.js
 * @description Knex database query methods for organizations, clients, vendors, projects, and configurations with mockStore resilience.
 */

const db = require('../../database/connection');
const { withDbFallback } = db;
const mockStore = require('../../database/mockStore');

const DEFAULT_MODULES = ['CAPI', 'CATI', 'TVC', 'FA', 'SUPER_AUDIT'];

const normalizeOrgModules = (modules) => {
  if (!modules) return [...DEFAULT_MODULES];
  let list = modules;
  if (typeof modules === 'string') {
    try {
      list = JSON.parse(modules);
    } catch {
      list = modules.split(',').map((s) => s.trim());
    }
  }
  if (!Array.isArray(list)) return [...DEFAULT_MODULES];

  const map = {
    capi: 'CAPI',
    capi_audit: 'CAPI',
    audit: 'CAPI',
    cati: 'CATI',
    field_cati: 'CATI',
    remote_cati: 'CATI',
    telephony: 'CATI',
    tvc: 'TVC',
    tele_verification: 'TVC',
    fa: 'FA',
    feedback: 'FA',
    feedback_audit: 'FA',
    field_audit: 'FA',
    super_audit: 'SUPER_AUDIT',
    superaudit: 'SUPER_AUDIT',
    'super-audit': 'SUPER_AUDIT',
  };

  const normalized = new Set();
  list.forEach((item) => {
    if (!item) return;
    const str = String(item).trim().toLowerCase();
    if (map[str]) {
      normalized.add(map[str]);
    } else {
      normalized.add(String(item).trim().toUpperCase());
    }
  });

  return Array.from(normalized);
};

// ==========================================
// ORGANIZATIONS
// ==========================================

/**
 * Lists organizations with pagination and optional search filter.
 *
 * @param {object} filters
 * @param {object} pagination
 * @returns {Promise<Array<object>>}
 */
const findAllOrganizations = async (filters = {}, pagination = {}) => {
  return withDbFallback(
    async () => {
      const { limit = 20, offset = 0, sortBy = 'created_at', sortOrder = 'desc' } = pagination;
      let query = db('organizations');

      if (filters.id) {
        query = query.where('id', filters.id);
      }

      if (filters.search) {
        const term = `%${filters.search.toLowerCase()}%`;
        query = query.where((b) => {
          b.whereRaw('LOWER(name) LIKE ?', [term]).orWhereRaw('LOWER(slug) LIKE ?', [term]);
        });
      }

      if (filters.status) {
        const isActive = filters.status === 'ACTIVE';
        query = query.where('is_active', isActive);
      }

      const validSorts = ['id', 'name', 'created_at', 'code', 'status'];
      const sort = validSorts.includes(sortBy) ? sortBy : 'created_at';

      const rows = await query.orderBy(sort, sortOrder.toLowerCase()).limit(limit).offset(offset);
      return rows.map((r) => ({
        ...r,
        code: r.code || r.slug,
        status: r.status || (r.is_active ? 'ACTIVE' : 'INACTIVE'),
        enabled_modules: normalizeOrgModules(r.enabled_modules || r.settings?.enabled_modules),
      }));
    },
    () => {
      const orgs = mockStore.find('organizations', filters, pagination) || [];
      return orgs.map((r) => ({
        ...r,
        code: r.code || r.slug,
        status: r.status || (r.is_active ? 'ACTIVE' : 'INACTIVE'),
        enabled_modules: normalizeOrgModules(r.enabled_modules || r.settings?.enabled_modules),
      }));
    }
  );
};

/**
 * Counts total organizations matching filters.
 *
 * @param {object} filters
 * @returns {Promise<number>}
 */
const countOrganizations = async (filters = {}) => {
  return withDbFallback(
    async () => {
      let query = db('organizations');
      if (filters.id) {
        query = query.where('id', filters.id);
      }

      if (filters.search) {
        const term = `%${filters.search.toLowerCase()}%`;
        query = query.where((b) => {
          b.whereRaw('LOWER(name) LIKE ?', [term]).orWhereRaw('LOWER(slug) LIKE ?', [term]);
        });
      }
      if (filters.status) {
        query = query.where('is_active', filters.status === 'ACTIVE');
      }
      const res = await query.count('id as total').first();
      return res ? parseInt(res.total, 10) : 0;
    },
    () => mockStore.count('organizations', filters)
  );
};

/**
 * Finds an organization by primary ID.
 *
 * @param {string|number} id
 * @returns {Promise<object|null>}
 */
const findOrganizationById = async (id) => {
  return withDbFallback(
    async () => {
      const org = await db('organizations').where('id', id).first();
      return org ? {
        ...org,
        code: org.code || org.slug,
        status: org.status || (org.is_active ? 'ACTIVE' : 'INACTIVE'),
        enabled_modules: normalizeOrgModules(org.enabled_modules || org.settings?.enabled_modules),
      } : null;
    },
    () => {
      const org = mockStore.findById('organizations', id);
      return org ? {
        ...org,
        code: org.code || org.slug,
        status: org.status || (org.is_active ? 'ACTIVE' : 'INACTIVE'),
        enabled_modules: normalizeOrgModules(org.enabled_modules || org.settings?.enabled_modules),
      } : null;
    }
  );
};

/**
 * Finds an organization by its unique code.
 *
 * @param {string} code
 * @returns {Promise<object|null>}
 */
const findOrganizationByCode = async (code) => {
  return withDbFallback(
    async () => {
      const upper = (code || '').toUpperCase();
      const lower = (code || '').toLowerCase();
      const org = await db('organizations')
        .whereRaw('UPPER(code) = ?', [upper])
        .orWhereRaw('UPPER(slug) = ?', [upper])
        .orWhereRaw('LOWER(slug) = ?', [lower])
        .first();
      return org ? {
        ...org,
        code: org.code || org.slug,
        status: org.status || (org.is_active ? 'ACTIVE' : 'INACTIVE'),
        enabled_modules: normalizeOrgModules(org.enabled_modules || org.settings?.enabled_modules),
      } : null;
    },
    () => {
      const org = mockStore.findOne('organizations', { code: (code || '').toUpperCase() });
      return org ? {
        ...org,
        code: org.code || org.slug,
        status: org.status || (org.is_active ? 'ACTIVE' : 'INACTIVE'),
        enabled_modules: normalizeOrgModules(org.enabled_modules || org.settings?.enabled_modules),
      } : null;
    }
  );
};

/**
 * Inserts a new organization record.
 *
 * @param {object} data
 * @returns {Promise<object>}
 */
const createOrganization = async (data) => {
  return withDbFallback(
    async () => {
      const orgSlug = (data.code || data.slug || data.name || 'org').toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
      const payload = {
        name: data.name,
        slug: orgSlug,
        code: (data.code || orgSlug).toUpperCase(),
        domain: data.domain || null,
        email: data.email || data.adminEmail || null,
        phone: data.phone || null,
        address: data.address || null,
        contact_person: data.contactPerson || data.contact_person || null,
        status: data.status || 'ACTIVE',
        is_active: data.status ? data.status === 'ACTIVE' : (data.isActive !== undefined ? Boolean(data.isActive) : true),
        max_users: data.maxUsers !== undefined ? data.maxUsers : 50,
        max_created_users: data.maxCreatedUsers !== undefined ? data.maxCreatedUsers : (data.max_created_users || 200),
        enable_ai_audit: data.enableAiAudit !== undefined ? data.enableAiAudit : true,
        enabled_modules: JSON.stringify(normalizeOrgModules(data.enabledModules || data.enabled_modules)),
        settings: JSON.stringify(data.settings || {}),
        created_at: new Date(),
        updated_at: new Date(),
      };
      const [created] = await db('organizations').insert(payload).returning('*');
      return {
        ...created,
        code: created.code || created.slug,
        status: created.status || (created.is_active ? 'ACTIVE' : 'INACTIVE'),
        enabled_modules: normalizeOrgModules(created.enabled_modules || payload.enabled_modules),
      };
    },
    () => {
      const normalizedModules = normalizeOrgModules(data.enabledModules || data.enabled_modules);
      return mockStore.insert('organizations', {
        name: data.name,
        code: (data.code || 'ORG').toUpperCase(),
        slug: (data.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        status: data.status || 'ACTIVE',
        max_users: data.maxUsers !== undefined ? data.maxUsers : 50,
        enable_ai_audit: data.enableAiAudit !== undefined ? data.enableAiAudit : true,
        enabled_modules: normalizedModules,
        settings: typeof data.settings === 'object' ? JSON.stringify(data.settings) : data.settings,
      });
    }
  );
};

/**
 * Updates an organization record.
 *
 * @param {string|number} id
 * @param {object} data
 * @returns {Promise<object>}
 */
const updateOrganization = async (id, data) => {
  return withDbFallback(
    async () => {
      const payload = {};
      if (data.name !== undefined) payload.name = data.name;
      if (data.code !== undefined) {
        payload.code = data.code.toUpperCase();
        payload.slug = data.code.toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
      }
      if (data.domain !== undefined) payload.domain = data.domain || null;
      if (data.email !== undefined || data.adminEmail !== undefined) payload.email = data.email || data.adminEmail || null;
      if (data.phone !== undefined) payload.phone = data.phone || null;
      if (data.address !== undefined) payload.address = data.address || null;
      if (data.contactPerson !== undefined || data.contact_person !== undefined) {
        payload.contact_person = data.contactPerson || data.contact_person || null;
      }
      if (data.status !== undefined) {
        payload.status = data.status;
        payload.is_active = data.status === 'ACTIVE';
      }
      if (data.isActive !== undefined) {
        payload.is_active = Boolean(data.isActive);
        if (data.status === undefined) payload.status = data.isActive ? 'ACTIVE' : 'INACTIVE';
      }
      if (data.maxUsers !== undefined) payload.max_users = data.maxUsers;
      if (data.maxCreatedUsers !== undefined || data.max_created_users !== undefined) {
        payload.max_created_users = data.maxCreatedUsers || data.max_created_users;
      }
      if (data.enableAiAudit !== undefined) payload.enable_ai_audit = Boolean(data.enableAiAudit);
      if (data.enable_ai_audit !== undefined) payload.enable_ai_audit = Boolean(data.enable_ai_audit);
      if (data.enabled_modules !== undefined || data.enabledModules !== undefined) {
        payload.enabled_modules = JSON.stringify(normalizeOrgModules(data.enabled_modules || data.enabledModules));
      }
      if (data.settings !== undefined) {
        payload.settings = typeof data.settings === 'object' ? JSON.stringify(data.settings) : data.settings;
      }
      payload.updated_at = new Date();

      const [updated] = await db('organizations').where('id', id).update(payload).returning('*');
      return updated ? {
        ...updated,
        code: updated.code || updated.slug,
        status: updated.status || (updated.is_active ? 'ACTIVE' : 'INACTIVE'),
        enabled_modules: normalizeOrgModules(updated.enabled_modules || payload.enabled_modules),
      } : null;
    },
    () => {
      const updatePayload = { ...data };
      if (data.enabled_modules !== undefined || data.enabledModules !== undefined) {
        updatePayload.enabled_modules = normalizeOrgModules(data.enabled_modules || data.enabledModules);
      }
      return mockStore.update('organizations', id, updatePayload);
    }
  );
};


// ==========================================
// CLIENTS
// ==========================================

/**
 * Lists clients with pagination, searching, and tenant scoping.
 *
 * @param {object} filters
 * @param {object} pagination
 * @returns {Promise<Array<object>>}
 */
const findAllClients = async (filters = {}, pagination = {}) => {
  return withDbFallback(
    async () => {
      const { limit = 20, offset = 0, sortBy = 'created_at', sortOrder = 'desc' } = pagination;
      let query = db('clients').leftJoin('organizations', 'clients.organization_id', 'organizations.id');

      if (filters.organizationId) {
        query = query.where('clients.organization_id', filters.organizationId);
      }

      if (filters.status) {
        query = query.where('clients.status', filters.status);
      }

      if (filters.id) {
        query = query.where('id', filters.id);
      }

      if (filters.search) {
        const term = `%${filters.search.toLowerCase()}%`;
        query = query.where((b) => {
          b.whereRaw('LOWER(clients.name) LIKE ?', [term])
            .orWhereRaw('LOWER(clients.code) LIKE ?', [term])
            .orWhereRaw('LOWER(clients.email) LIKE ?', [term]);
        });
      }

      return query
        .select('clients.*', 'organizations.name as organization_name')
        .orderBy(`clients.${sortBy}`, sortOrder.toLowerCase())
        .limit(limit)
        .offset(offset);
    },
    () => {
      const clients = mockStore.find('clients', filters, pagination);
      return clients.map((c) => {
        const org = mockStore.findById('organizations', c.organization_id) || {};
        return { ...c, organization_name: org.name };
      });
    }
  );
};

/**
 * Counts total clients matching criteria.
 *
 * @param {object} filters
 * @returns {Promise<number>}
 */
const countClients = async (filters = {}) => {
  return withDbFallback(
    async () => {
      let query = db('clients');
      if (filters.organizationId) {
        query = query.where('organization_id', filters.organizationId);
      }
      if (filters.status) {
        query = query.where('status', filters.status);
      }
      if (filters.id) {
        query = query.where('id', filters.id);
      }

      if (filters.search) {
        const term = `%${filters.search.toLowerCase()}%`;
        query = query.where((b) => {
          b.whereRaw('LOWER(name) LIKE ?', [term])
            .orWhereRaw('LOWER(code) LIKE ?', [term])
            .orWhereRaw('LOWER(email) LIKE ?', [term]);
        });
      }
      const res = await query.count('id as total').first();
      return res ? parseInt(res.total, 10) : 0;
    },
    () => mockStore.count('clients', filters)
  );
};

/**
 * Finds a client by ID with organization details.
 *
 * @param {string|number} id
 * @param {string|number} [organizationId]
 * @returns {Promise<object|null>}
 */
const findClientById = async (id, organizationId = null) => {
  return withDbFallback(
    async () => {
      let query = db('clients')
        .leftJoin('organizations', 'clients.organization_id', 'organizations.id')
        .select('clients.*', 'organizations.name as organization_name')
        .where('clients.id', id);

      if (organizationId) {
        query = query.where('clients.organization_id', organizationId);
      }

      const client = await query.first();
      return client || null;
    },
    () => {
      const client = mockStore.findById('clients', id);
      if (!client) return null;
      if (organizationId && client.organization_id !== organizationId) return null;
      const org = mockStore.findById('organizations', client.organization_id) || {};
      return { ...client, organization_name: org.name };
    }
  );
};

/**
 * Finds a client by code within an organization.
 *
 * @param {string} code
 * @param {string|number} [organizationId]
 * @returns {Promise<object|null>}
 */
const findClientByCode = async (code, organizationId = null) => {
  return withDbFallback(
    async () => {
      let query = db('clients').whereRaw('UPPER(code) = ?', [code.toUpperCase()]);
      if (organizationId) {
        query = query.where('organization_id', organizationId);
      }
      const client = await query.first();
      return client || null;
    },
    () => {
      const client = mockStore.findOne('clients', { code: code.toUpperCase() });
      if (!client) return null;
      if (organizationId && client.organization_id !== organizationId) return null;
      return client;
    }
  );
};

/**
 * Creates a new client record.
 *
 * @param {object} data
 * @returns {Promise<object>}
 */
const createClient = async (data) => {
  return withDbFallback(
    async () => {
      const cCode = (data.code || data.name || 'CLIENT').toUpperCase().replace(/[^A-Z0-9_-]+/g, '_');
      const payload = {
        organization_id: data.organizationId || data.organization_id,
        name: data.name,
        code: cCode,
        email: data.email || null,
        phone: data.phone || null,
        address: data.address || null,
        status: data.status || (data.isActive === false ? 'INACTIVE' : 'ACTIVE'),
        is_active: data.status ? data.status === 'ACTIVE' : (data.isActive !== undefined ? Boolean(data.isActive) : true),
        created_at: new Date(),
        updated_at: new Date(),
      };
      const [created] = await db('clients').insert(payload).returning('*');
      return created;
    },
    () =>
      mockStore.insert('clients', {
        organization_id: data.organizationId || data.organization_id,
        name: data.name,
        code: (data.code || 'CLIENT').toUpperCase(),
        email: data.email || null,
        phone: data.phone || null,
        address: data.address || null,
        status: data.status || 'ACTIVE',
      })
  );
};

/**
 * Updates a client record.
 *
 * @param {string|number} id
 * @param {object} data
 * @returns {Promise<object>}
 */
const updateClient = async (id, data) => {
  return withDbFallback(
    async () => {
      const payload = { ...data, updated_at: new Date() };
      if (payload.code) payload.code = payload.code.toUpperCase();
      if (payload.organizationId !== undefined) {
        payload.organization_id = payload.organizationId;
        delete payload.organizationId;
      }
      const [updated] = await db('clients').where('id', id).update(payload).returning('*');
      return updated;
    },
    () => mockStore.update('clients', id, data)
  );
};

// ==========================================
// VENDORS
// ==========================================

/**
 * Lists vendors with pagination and filters.
 *
 * @param {object} filters
 * @param {object} pagination
 * @returns {Promise<Array<object>>}
 */
const findAllVendors = async (filters = {}, pagination = {}) => {
  return withDbFallback(
    async () => {
      const { limit = 20, offset = 0, sortBy = 'created_at', sortOrder = 'desc' } = pagination;
      let query = db('vendors').leftJoin('organizations', 'vendors.organization_id', 'organizations.id');

      if (filters.organizationId) {
        query = query.where('vendors.organization_id', filters.organizationId);
      }
      if (filters.status) {
        query = query.where('vendors.status', filters.status);
      }
      if (filters.id) {
        query = query.where('id', filters.id);
      }

      if (filters.search) {
        const term = `%${filters.search.toLowerCase()}%`;
        query = query.where((b) => {
          b.whereRaw('LOWER(vendors.name) LIKE ?', [term])
            .orWhereRaw('LOWER(vendors.code) LIKE ?', [term])
            .orWhereRaw('LOWER(vendors.email) LIKE ?', [term])
            .orWhereRaw('LOWER(vendors.contact_person) LIKE ?', [term]);
        });
      }

      return query
        .select('vendors.*', 'organizations.name as organization_name')
        .orderBy(`vendors.${sortBy}`, sortOrder.toLowerCase())
        .limit(limit)
        .offset(offset);
    },
    () => {
      const vendors = mockStore.find('vendors', filters, pagination);
      return vendors.map((v) => {
        const org = mockStore.findById('organizations', v.organization_id) || {};
        return { ...v, organization_name: org.name };
      });
    }
  );
};

/**
 * Counts total vendors matching filters.
 *
 * @param {object} filters
 * @returns {Promise<number>}
 */
const countVendors = async (filters = {}) => {
  return withDbFallback(
    async () => {
      let query = db('vendors');
      if (filters.organizationId) {
        query = query.where('organization_id', filters.organizationId);
      }
      if (filters.status) {
        query = query.where('status', filters.status);
      }
      if (filters.id) {
        query = query.where('id', filters.id);
      }

      if (filters.search) {
        const term = `%${filters.search.toLowerCase()}%`;
        query = query.where((b) => {
          b.whereRaw('LOWER(name) LIKE ?', [term])
            .orWhereRaw('LOWER(code) LIKE ?', [term])
            .orWhereRaw('LOWER(email) LIKE ?', [term]);
        });
      }
      const res = await query.count('id as total').first();
      return res ? parseInt(res.total, 10) : 0;
    },
    () => mockStore.count('vendors', filters)
  );
};

/**
 * Finds a vendor by ID.
 *
 * @param {string|number} id
 * @param {string|number} [organizationId]
 * @returns {Promise<object|null>}
 */
const findVendorById = async (id, organizationId = null) => {
  return withDbFallback(
    async () => {
      let query = db('vendors')
        .leftJoin('organizations', 'vendors.organization_id', 'organizations.id')
        .select('vendors.*', 'organizations.name as organization_name')
        .where('vendors.id', id);

      if (organizationId) {
        query = query.where('vendors.organization_id', organizationId);
      }

      const vendor = await query.first();
      return vendor || null;
    },
    () => {
      const vendor = mockStore.findById('vendors', id);
      if (!vendor) return null;
      if (organizationId && vendor.organization_id !== organizationId) return null;
      const org = mockStore.findById('organizations', vendor.organization_id) || {};
      return { ...vendor, organization_name: org.name };
    }
  );
};

/**
 * Finds a vendor by code.
 *
 * @param {string} code
 * @param {string|number} [organizationId]
 * @returns {Promise<object|null>}
 */
const findVendorByCode = async (code, organizationId = null) => {
  return withDbFallback(
    async () => {
      let query = db('vendors').whereRaw('UPPER(code) = ?', [code.toUpperCase()]);
      if (organizationId) {
        query = query.where('organization_id', organizationId);
      }
      const vendor = await query.first();
      return vendor || null;
    },
    () => {
      const vendor = mockStore.findOne('vendors', { code: code.toUpperCase() });
      if (!vendor) return null;
      if (organizationId && vendor.organization_id !== organizationId) return null;
      return vendor;
    }
  );
};

/**
 * Creates a new vendor.
 *
 * @param {object} data
 * @returns {Promise<object>}
 */
const createVendor = async (data) => {
  return withDbFallback(
    async () => {
      const vCode = (data.code || data.name || 'VENDOR').toUpperCase().replace(/[^A-Z0-9_-]+/g, '_');
      const payload = {
        organization_id: data.organizationId || data.organization_id,
        name: data.name,
        code: vCode,
        email: data.email || null,
        phone: data.phone || null,
        contact_person: data.contactPerson || data.contact_person || null,
        status: data.status || (data.isActive === false ? 'INACTIVE' : 'ACTIVE'),
        is_active: data.status ? data.status === 'ACTIVE' : (data.isActive !== undefined ? Boolean(data.isActive) : true),
        enable_ai_audit: data.enableAiAudit !== undefined ? data.enableAiAudit : true,
        created_at: new Date(),
        updated_at: new Date(),
      };
      const [created] = await db('vendors').insert(payload).returning('*');
      return created;
    },
    () =>
      mockStore.insert('vendors', {
        organization_id: data.organizationId || data.organization_id,
        name: data.name,
        code: (data.code || 'VENDOR').toUpperCase(),
        email: data.email || null,
        phone: data.phone || null,
        contact_person: data.contactPerson || data.contact_person || null,
        status: data.status || 'ACTIVE',
        enable_ai_audit: data.enableAiAudit !== undefined ? data.enableAiAudit : true,
      })
  );
};

/**
 * Updates a vendor.
 *
 * @param {string|number} id
 * @param {object} data
 * @returns {Promise<object>}
 */
const updateVendor = async (id, data) => {
  return withDbFallback(
    async () => {
      const payload = { ...data, updated_at: new Date() };
      if (payload.code) payload.code = payload.code.toUpperCase();
      if (payload.contactPerson !== undefined) {
        payload.contact_person = payload.contactPerson;
        delete payload.contactPerson;
      }
      if (payload.organizationId !== undefined) {
        payload.organization_id = payload.organizationId;
        delete payload.organizationId;
      }
      const [updated] = await db('vendors').where('id', id).update(payload).returning('*');
      return updated;
    },
    () => mockStore.update('vendors', id, data)
  );
};

// ==========================================
// PROJECTS / CAMPAIGNS
// ==========================================

/**
 * Lists projects with pagination, joins, and filters.
 *
 * @param {object} filters
 * @param {object} pagination
 * @returns {Promise<Array<object>>}
 */
const findAllProjects = async (filters = {}, pagination = {}) => {
  return withDbFallback(
    async () => {
      const { limit = 20, offset = 0, sortBy = 'created_at', sortOrder = 'desc' } = pagination;
      let query = db('projects')
        .leftJoin('clients', 'projects.client_id', 'clients.id')
        .leftJoin('organizations', 'projects.organization_id', 'organizations.id');

      if (filters.organizationId) {
        query = query.where('projects.organization_id', filters.organizationId);
      }
      if (filters.clientId) {
        query = query.where('projects.client_id', filters.clientId);
      }
      if (filters.status) {
        query = query.where('projects.status', filters.status);
      }
      if (filters.id) {
        query = query.where('projects.id', filters.id);
      }
      if (filters.vendorId) {
        query = query.where((qb) => {
          qb.whereIn('projects.id', function () {
            this.select('project_id')
              .from('project_vendor_assignments')
              .where('vendor_id', filters.vendorId);
          }).orWhereIn('projects.id', function () {
            this.select('project_id')
              .from('campaign_leads')
              .where('vendor_id', filters.vendorId);
          });
        });
      }

      if (filters.type) {
        query = query.where((qb) => {
          qb.where('projects.type', filters.type)
            .orWhereRaw('projects.enabled_modules::text LIKE ?', [`%${filters.type}%`]);
        });
      }
      if (filters.module) {
        query = query.where((qb) => {
          qb.where('projects.type', filters.module)
            .orWhereRaw('projects.enabled_modules::text LIKE ?', [`%${filters.module}%`]);
        });
      }

      if (filters.search) {
        const term = `%${filters.search.toLowerCase()}%`;
        query = query.where((b) => {
          b.whereRaw('LOWER(projects.name) LIKE ?', [term])
            .orWhereRaw('LOWER(projects.code) LIKE ?', [term])
            .orWhereRaw('LOWER(clients.name) LIKE ?', [term]);
        });
      }

      return query
        .select(
          'projects.*',
          'clients.name as client_name',
          'clients.code as client_code',
          'organizations.name as organization_name',
          db.raw('(SELECT COUNT(*)::int FROM submissions WHERE submissions.project_id = projects.id) as total_submissions'),
          db.raw('(SELECT COUNT(*)::int FROM submissions WHERE submissions.project_id = projects.id) as "totalSubmissions"'),
          db.raw('(SELECT COUNT(*)::int FROM campaign_leads WHERE campaign_leads.project_id = projects.id) as total_leads'),
          db.raw('(SELECT COUNT(*)::int FROM campaign_leads WHERE campaign_leads.project_id = projects.id) as "totalLeads"'),
          db.raw('(SELECT COUNT(DISTINCT vendor_id)::int FROM project_vendor_assignments WHERE project_vendor_assignments.project_id = projects.id) as "vendorsCount"'),
          db.raw('(SELECT json_agg(json_build_object(\'id\', vendors.id, \'name\', vendors.name, \'code\', vendors.code)) FROM project_vendor_assignments JOIN vendors ON project_vendor_assignments.vendor_id = vendors.id WHERE project_vendor_assignments.project_id = projects.id) as assigned_vendors')
        )
        .orderBy(`projects.${sortBy}`, sortOrder.toLowerCase())
        .limit(limit)
        .offset(offset);
    },
    () => {
      let projects = mockStore.find('projects', filters, pagination);
      if (filters.vendorId) {
        const assignments = mockStore.find('project_vendor_assignments', { vendor_id: filters.vendorId });
        const assignedIds = new Set(assignments.map((a) => a.project_id));
        const leads = mockStore.find('campaign_leads', { vendor_id: filters.vendorId });
        leads.forEach((l) => assignedIds.add(l.project_id));
        projects = projects.filter((p) => assignedIds.has(p.id));
      }
      return projects.map((p) => {
        const client = mockStore.findById('clients', p.client_id) || {};
        const org = mockStore.findById('organizations', p.organization_id) || {};
        return {
          ...p,
          client_name: client.name,
          client_code: client.code,
          organization_name: org.name,
        };
      });
    }
  );
};

/**
 * Counts total projects matching filters.
 *
 * @param {object} filters
 * @returns {Promise<number>}
 */
const countProjects = async (filters = {}) => {
  return withDbFallback(
    async () => {
      let query = db('projects');
      if (filters.organizationId) {
        query = query.where('organization_id', filters.organizationId);
      }
      if (filters.clientId) {
        query = query.where('client_id', filters.clientId);
      }
      if (filters.status) {
        query = query.where('status', filters.status);
      }
      if (filters.id) {
        query = query.where('id', filters.id);
      }
      if (filters.vendorId) {
        query = query.where((qb) => {
          qb.whereIn('id', function () {
            this.select('project_id')
              .from('project_vendor_assignments')
              .where('vendor_id', filters.vendorId);
          }).orWhereIn('id', function () {
            this.select('project_id')
              .from('campaign_leads')
              .where('vendor_id', filters.vendorId);
          });
        });
      }

      if (filters.type) {
        query = query.where((qb) => {
          qb.where('projects.type', filters.type)
            .orWhereRaw('projects.enabled_modules::text LIKE ?', [`%${filters.type}%`]);
        });
      }
      if (filters.module) {
        query = query.where((qb) => {
          qb.where('projects.type', filters.module)
            .orWhereRaw('projects.enabled_modules::text LIKE ?', [`%${filters.module}%`]);
        });
      }

      if (filters.search) {
        const term = `%${filters.search.toLowerCase()}%`;
        query = query.where((b) => {
          b.whereRaw('LOWER(name) LIKE ?', [term]).orWhereRaw('LOWER(code) LIKE ?', [term]);
        });
      }
      const res = await query.count('id as total').first();
      return res ? parseInt(res.total, 10) : 0;
    },
    () => {
      let projects = mockStore.find('projects', filters);
      if (filters.vendorId) {
        const assignments = mockStore.find('project_vendor_assignments', { vendor_id: filters.vendorId });
        const assignedIds = new Set(assignments.map((a) => a.project_id));
        const leads = mockStore.find('campaign_leads', { vendor_id: filters.vendorId });
        leads.forEach((l) => assignedIds.add(l.project_id));
        projects = projects.filter((p) => assignedIds.has(p.id));
      }
      return projects.length;
    }
  );
};

/**
 * Finds a project by ID with client and organization details.
 *
 * @param {string|number} id
 * @param {string|number} [organizationId]
 * @returns {Promise<object|null>}
 */
const findProjectById = async (id, organizationId = null) => {
  return withDbFallback(
    async () => {
      let query = db('projects')
        .leftJoin('clients', 'projects.client_id', 'clients.id')
        .leftJoin('organizations', 'projects.organization_id', 'organizations.id')
        .select(
          'projects.*',
          'clients.name as client_name',
          'clients.code as client_code',
          'organizations.name as organization_name',
          db.raw('(SELECT COUNT(*)::int FROM submissions WHERE submissions.project_id = projects.id) as total_submissions'),
          db.raw('(SELECT COUNT(*)::int FROM submissions WHERE submissions.project_id = projects.id) as "totalSubmissions"'),
          db.raw('(SELECT COUNT(*)::int FROM campaign_leads WHERE campaign_leads.project_id = projects.id) as total_leads'),
          db.raw('(SELECT COUNT(*)::int FROM campaign_leads WHERE campaign_leads.project_id = projects.id) as "totalLeads"'),
          db.raw('(SELECT COUNT(DISTINCT vendor_id)::int FROM project_vendor_assignments WHERE project_vendor_assignments.project_id = projects.id) as "vendorsCount"'),
          db.raw('(SELECT json_agg(json_build_object(\'id\', vendors.id, \'name\', vendors.name, \'code\', vendors.code)) FROM project_vendor_assignments JOIN vendors ON project_vendor_assignments.vendor_id = vendors.id WHERE project_vendor_assignments.project_id = projects.id) as assigned_vendors')
        )
        .where('projects.id', id);

      if (organizationId) {
        query = query.where('projects.organization_id', organizationId);
      }

      const project = await query.first();
      if (!project) {
        const mockProject = mockStore.findById('projects', id);
        if (mockProject) {
          if (organizationId && mockProject.organization_id !== organizationId) return null;
          const client = mockStore.findById('clients', mockProject.client_id) || {};
          const org = mockStore.findById('organizations', mockProject.organization_id) || {};
          return {
            ...mockProject,
            client_name: client.name,
            client_code: client.code,
            organization_name: org.name,
          };
        }
      }
      return project || null;
    },
    () => {
      const project = mockStore.findById('projects', id);
      if (!project) return null;
      if (organizationId && project.organization_id !== organizationId) return null;
      const client = mockStore.findById('clients', project.client_id) || {};
      const org = mockStore.findById('organizations', project.organization_id) || {};
      return {
        ...project,
        client_name: client.name,
        client_code: client.code,
        organization_name: org.name,
      };
    }
  );
};

/**
 * Finds a project by code.
 *
 * @param {string} code
 * @param {string|number} [organizationId]
 * @returns {Promise<object|null>}
 */
const findProjectByCode = async (code, organizationId = null) => {
  return withDbFallback(
    async () => {
      let query = db('projects').whereRaw('UPPER(code) = ?', [code.toUpperCase()]);
      if (organizationId) {
        query = query.where('organization_id', organizationId);
      }
      const project = await query.first();
      if (!project) {
        const mockProject = mockStore.findOne('projects', { code: code.toUpperCase() });
        if (mockProject) {
          if (organizationId && mockProject.organization_id !== organizationId) return null;
          const client = mockStore.findById('clients', mockProject.client_id) || {};
          const org = mockStore.findById('organizations', mockProject.organization_id) || {};
          return {
            ...mockProject,
            client_name: client.name,
            client_code: client.code,
            organization_name: org.name,
          };
        }
      }
      return project || null;
    },
    () => {
      const project = mockStore.findOne('projects', { code: code.toUpperCase() });
      if (!project) return null;
      if (organizationId && project.organization_id !== organizationId) return null;
      return project;
    }
  );
};

/**
 * Creates a project record.
 *
 * @param {object} data
 * @returns {Promise<object>}
 */
const createProject = async (data) => {
  return withDbFallback(
    async () => {
      const pCode = (data.project_code || data.code || `PRJ_${Date.now().toString().slice(-4)}`).toUpperCase();
      const clientTableName = (
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
      const output1TableName = data.output1_table_name?.trim() || data.client_output1_table?.trim() || null;
      const output2TableName = data.output2_table_name?.trim() || data.client_output2_table?.trim() || null;

      const selectedCampaignTypes = Array.isArray(data.campaign_types) && data.campaign_types.length > 0
        ? data.campaign_types
        : (Array.isArray(data.enabled_modules) && data.enabled_modules.length > 0 ? data.enabled_modules : ['CATI', 'CAPI']);
      const primaryType = selectedCampaignTypes.length === 1 ? selectedCampaignTypes[0] : (data.type || 'MULTI_CHANNEL');

      const configObj = {
        ...(data.config || {}),
        campaign_types: selectedCampaignTypes,
        client_table_name: clientTableName,
        output1_table_name: output1TableName,
        output2_table_name: output2TableName,
        schemaConfig: data.schemaConfig || undefined,
      };

      const payload = {
        organization_id: data.organizationId || data.organization_id || null,
        client_id: data.clientId || data.client_id || null,
        name: data.name,
        code: pCode,
        project_code: pCode,
        client_table_name: clientTableName,
        output1_table_name: output1TableName,
        output2_table_name: output2TableName,
        questionnaire_id: data.questionnaireId || data.questionnaire_id || null,
        description: data.description || null,
        type: primaryType,
        status: data.status || 'DRAFT',
        languages: JSON.stringify(data.languages || ['hi']),
        enabled_modules: JSON.stringify(selectedCampaignTypes),
        start_date: data.start_date || data.startDate || null,
        end_date: data.end_date || data.endDate || null,
        config: JSON.stringify(configObj),
        created_at: new Date(),
        updated_at: new Date(),
      };

      const [created] = await db('projects').insert(payload).returning('*');
      return created;
    },
    () =>
      mockStore.insert('projects', {
        organization_id: data.organizationId || data.organization_id,
        client_id: data.clientId || data.client_id,
        name: data.name,
        code: (data.code || data.project_code || 'PRJ_01').toUpperCase(),
        project_code: (data.code || data.project_code || 'PRJ_01').toUpperCase(),
        client_table_name: data.client_table_name?.trim() || data.input_table_name?.trim() || null,
        output1_table_name: data.output1_table_name?.trim() || null,
        output2_table_name: data.output2_table_name?.trim() || null,
        questionnaire_id: data.questionnaireId || data.questionnaire_id || null,
        description: data.description || null,
        type: data.type || 'SURVEY',
        status: data.status || 'DRAFT',
        enabled_modules: JSON.stringify(data.enabledModules || ['CATI', 'CAPI', 'SUPER_AUDIT', 'TVC', 'FA', 'EXAM']),
        states: JSON.stringify(data.states || []),
        languages: JSON.stringify(data.languages || ['en']),
        config: JSON.stringify({
          ...(data.config || {}),
          client_table_name: data.client_table_name?.trim() || null,
          output1_table_name: data.output1_table_name?.trim() || null,
          output2_table_name: data.output2_table_name?.trim() || null,
        }),
      })
  );
};

/**
 * Updates a project record.
 *
 * @param {string|number} id
 * @param {object} data
 * @returns {Promise<object>}
 */
const updateProject = async (id, data) => {
  return withDbFallback(
    async () => {
      const payload = { updated_at: new Date() };
      if (data.name !== undefined) payload.name = data.name;
      if (data.code || data.project_code) {
        const c = (data.project_code || data.code).toUpperCase();
        payload.code = c;
        payload.project_code = c;
      }
      const incomingClientTbl = (
        data.client_table_name ||
        data.input_table_name ||
        data.input_table ||
        data.source_table ||
        data.tableName ||
        data.table_name ||
        data.metadata?.client_table_name ||
        data.metadata?.input_table ||
        data.metadata?.source_table
      );
      if (incomingClientTbl !== undefined) {
        payload.client_table_name = incomingClientTbl?.trim() || null;
      }
      if (data.output1_table_name !== undefined || data.client_output1_table !== undefined) {
        payload.output1_table_name = (data.output1_table_name || data.client_output1_table)?.trim() || null;
      }
      if (data.output2_table_name !== undefined || data.client_output2_table !== undefined) {
        payload.output2_table_name = (data.output2_table_name || data.client_output2_table)?.trim() || null;
      }
      if (data.startDate !== undefined || data.start_date !== undefined) {
        payload.start_date = data.startDate || data.start_date || null;
      }
      if (data.endDate !== undefined || data.end_date !== undefined) {
        payload.end_date = data.endDate || data.end_date || null;
      }
      if (data.campaign_types !== undefined || data.campaignTypes !== undefined) {
        const types = data.campaign_types || data.campaignTypes;
        payload.enabled_modules = Array.isArray(types) ? JSON.stringify(types) : types;
        if (Array.isArray(types)) {
          payload.type = types.length === 1 ? types[0] : (data.type || 'MULTI_CHANNEL');
        }
      }
      if (data.questionnaireId !== undefined || data.questionnaire_id !== undefined) {
        payload.questionnaire_id = data.questionnaireId || data.questionnaire_id || null;
      }
      if (data.description !== undefined) payload.description = data.description;
      if (data.type !== undefined) payload.type = data.type;
      if (data.status !== undefined) payload.status = data.status;
      if (data.clientId !== undefined || data.client_id !== undefined) {
        payload.client_id = data.clientId || data.client_id;
      }
      if (data.organizationId !== undefined || data.organization_id !== undefined) {
        payload.organization_id = data.organizationId || data.organization_id;
      }
      if (data.languages !== undefined) {
        payload.languages = Array.isArray(data.languages) ? JSON.stringify(data.languages) : data.languages;
      }
      if (data.enabled_modules !== undefined) {
        payload.enabled_modules = Array.isArray(data.enabled_modules) ? JSON.stringify(data.enabled_modules) : data.enabled_modules;
      }

      // Keep project.config synchronized with table names and campaign types
      try {
        const project = await findProjectById(id);
        let existingConfig = {};
        if (project) {
          if (typeof project.config === 'string') {
            try { existingConfig = JSON.parse(project.config || '{}'); } catch { existingConfig = {}; }
          } else if (typeof project.config === 'object' && project.config !== null) {
            existingConfig = { ...project.config };
          }
        }
        if (payload.client_table_name !== undefined) existingConfig.client_table_name = payload.client_table_name;
        if (payload.output1_table_name !== undefined) existingConfig.output1_table_name = payload.output1_table_name;
        if (payload.output2_table_name !== undefined) existingConfig.output2_table_name = payload.output2_table_name;
        if (data.campaign_types || data.campaignTypes) existingConfig.campaign_types = data.campaign_types || data.campaignTypes;
        if (data.schemaConfig) existingConfig.schemaConfig = data.schemaConfig;
        if (data.config && typeof data.config === 'object') existingConfig = { ...existingConfig, ...data.config };
        payload.config = JSON.stringify(existingConfig);
      } catch (_) {
        if (data.config !== undefined) {
          payload.config = typeof data.config === 'object' ? JSON.stringify(data.config) : data.config;
        }
      }

      const [updated] = await db('projects').where('id', id).update(payload).returning('*');
      return updated;
    },
    () => mockStore.update('projects', id, data)
  );
};

/**
 * Updates project status.
 *
 * @param {string|number} id
 * @param {string} status
 * @returns {Promise<object>}
 */
const updateProjectStatus = async (id, status) => {
  return withDbFallback(
    async () => {
      const [updated] = await db('projects')
        .where('id', id)
        .update({ status, updated_at: new Date() })
        .returning('*');
      return updated;
    },
    () => mockStore.update('projects', id, { status })
  );
};

// ==========================================
// PROJECT VENDOR ASSIGNMENTS
// ==========================================

/**
 * Lists all vendors assigned to a project.
 *
 * @param {string|number} projectId
 * @returns {Promise<Array<object>>}
 */
const findProjectVendors = async (projectId) => {
  return withDbFallback(
    async () => {
      return db('project_vendor_assignments')
        .leftJoin('vendors', 'project_vendor_assignments.vendor_id', 'vendors.id')
        .select(
          'project_vendor_assignments.*',
          'vendors.name as vendor_name',
          'vendors.code as vendor_code',
          'vendors.email as vendor_email',
          'vendors.phone as vendor_phone'
        )
        .where('project_vendor_assignments.project_id', projectId);
    },
    () => {
      const assignments = mockStore.find('project_vendor_assignments', { project_id: projectId });
      return assignments.map((a) => {
        const v = mockStore.findById('vendors', a.vendor_id) || {};
        return {
          ...a,
          vendor_name: v.name,
          vendor_code: v.code,
          vendor_email: v.email,
          vendor_phone: v.phone,
        };
      });
    }
  );
};

/**
 * Finds a single project vendor assignment.
 *
 * @param {string|number} projectId
 * @param {string|number} vendorId
 * @returns {Promise<object|null>}
 */
const findProjectVendorAssignment = async (projectId, vendorId) => {
  return withDbFallback(
    async () => {
      const assignment = await db('project_vendor_assignments')
        .where({ project_id: projectId, vendor_id: vendorId })
        .first();
      return assignment || null;
    },
    () => mockStore.findOne('project_vendor_assignments', { project_id: projectId, vendor_id: vendorId })
  );
};

/**
 * Assigns a vendor to a project or updates the status if already assigned.
 *
 * @param {string|number} projectId
 * @param {string|number} vendorId
 * @param {string} [status='ACTIVE']
 * @returns {Promise<object>}
 */
const assignVendorToProject = async (projectId, vendorId, status = 'ACTIVE') => {
  return withDbFallback(
    async () => {
      const existing = await findProjectVendorAssignment(projectId, vendorId);
      if (existing) {
        const [updated] = await db('project_vendor_assignments')
          .where({ id: existing.id })
          .update({ status, updated_at: new Date() })
          .returning('*');
        return updated;
      }

      const [created] = await db('project_vendor_assignments')
        .insert({
          project_id: projectId,
          vendor_id: vendorId,
          status,
          created_at: new Date(),
          updated_at: new Date(),
        })
        .returning('*');
      return created;
    },
    () => {
      const existing = mockStore.findOne('project_vendor_assignments', { project_id: projectId, vendor_id: vendorId });
      if (existing) {
        return mockStore.update('project_vendor_assignments', existing.id, { status });
      }
      return mockStore.insert('project_vendor_assignments', {
        project_id: projectId,
        vendor_id: vendorId,
        status,
        is_active: status === 'ACTIVE',
      });
    }
  );
};

/**
 * Removes a vendor from a project.
 *
 * @param {string|number} projectId
 * @param {string|number} vendorId
 * @returns {Promise<number>}
 */
const removeVendorFromProject = async (projectId, vendorId) => {
  return withDbFallback(
    async () => {
      return db('project_vendor_assignments')
        .where({ project_id: projectId, vendor_id: vendorId })
        .del();
    },
    () => {
      const existing = mockStore.findOne('project_vendor_assignments', { project_id: projectId, vendor_id: vendorId });
      if (existing) {
        return mockStore.delete('project_vendor_assignments', existing.id);
      }
      return 0;
    }
  );
};

// ==========================================
// PROJECT MODULES & LANGUAGES
// ==========================================

/**
 * Updates configured modules on a project.
 *
 * @param {string|number} projectId
 * @param {Array<string>} modules
 * @returns {Promise<object>}
 */
const updateProjectModules = async (projectId, modules) => {
  return withDbFallback(
    async () => {
      const project = await findProjectById(projectId);
      if (!project) return null;

      let currentConfig = {};
      if (typeof project.config === 'string') {
        try {
          currentConfig = JSON.parse(project.config || '{}');
        } catch {
          currentConfig = {};
        }
      } else if (typeof project.config === 'object' && project.config !== null) {
        currentConfig = { ...project.config };
      }

      currentConfig.modules = modules;

      const [updated] = await db('projects')
        .where('id', projectId)
        .update({
          config: JSON.stringify(currentConfig),
          updated_at: new Date(),
        })
        .returning('*');

      return updated;
    },
    () => mockStore.update('projects', projectId, { enabled_modules: JSON.stringify(modules) })
  );
};

/**
 * Retrieves all configured languages for a project.
 *
 * @param {string|number} projectId
 * @returns {Promise<Array<object>>}
 */
const findProjectLanguages = async (projectId) => {
  return withDbFallback(
    async () => {
      return db('project_languages')
        .where('project_id', projectId)
        .orderBy('is_default', 'desc')
        .orderBy('language_code', 'asc');
    },
    () => mockStore.find('project_languages', { project_id: projectId })
  );
};

/**
 * Replaces or configures languages for a project.
 *
 * @param {string|number} projectId
 * @param {Array<object>} languages
 * @returns {Promise<Array<object>>}
 */
const configureProjectLanguages = async (projectId, languages) => {
  return withDbFallback(
    async () => {
      return db.transaction(async (trx) => {
        await trx('project_languages').where('project_id', projectId).del();

        const insertRecords = languages.map((lang) => ({
          project_id: projectId,
          language_code: typeof lang === 'string' ? lang : (lang.languageCode || lang.language_code),
          is_default: !!lang.isDefault,
          is_active: lang.isActive !== false,
          created_at: new Date(),
          updated_at: new Date(),
        }));

        if (insertRecords.length > 0) {
          return trx('project_languages').insert(insertRecords).returning('*');
        }

        return [];
      });
    },
    () => {
      mockStore.data.project_languages = mockStore.data.project_languages.filter((l) => l.project_id !== projectId);
      const inserted = languages.map((lang) =>
        mockStore.insert('project_languages', {
          project_id: projectId,
          language_code: lang.languageCode,
          language_name: lang.languageName,
          is_default: !!lang.isDefault,
          is_active: lang.isActive !== false,
        })
      );
      return inserted;
    }
  );
};

const deleteOrganization = async (id) => {
  return withDbFallback(
    async () => {
      await db('organizations').where('id', id).del();
      return true;
    },
    () => {
      mockStore.delete('organizations', id);
      return true;
    }
  );
};

const deleteClient = async (id) => {
  return withDbFallback(
    async () => {
      await db('clients').where('id', id).del();
      return true;
    },
    () => {
      mockStore.delete('clients', id);
      return true;
    }
  );
};

const deleteVendor = async (id) => {
  return withDbFallback(
    async () => {
      await db('vendors').where('id', id).del();
      return true;
    },
    () => {
      mockStore.delete('vendors', id);
      return true;
    }
  );
};

const deleteProject = async (id) => {
  return withDbFallback(
    async () => {
      await db('projects').where('id', id).del();
      return true;
    },
    () => {
      mockStore.delete('projects', id);
      return true;
    }
  );
};

module.exports = {
  findAllOrganizations,
  countOrganizations,
  findOrganizationById,
  findOrganizationByCode,
  createOrganization,
  updateOrganization,
  deleteOrganization,

  findAllClients,
  countClients,
  findClientById,
  findClientByCode,
  createClient,
  updateClient,
  deleteClient,

  findAllVendors,
  countVendors,
  findVendorById,
  findVendorByCode,
  createVendor,
  updateVendor,
  deleteVendor,

  findAllProjects,
  countProjects,
  findProjectById,
  findProjectByCode,
  createProject,
  updateProject,
  updateProjectStatus,
  deleteProject,

  findProjectVendors,
  findProjectVendorAssignment,
  assignVendorToProject,
  removeVendorFromProject,

  updateProjectModules,
  findProjectLanguages,
  configureProjectLanguages,
};
