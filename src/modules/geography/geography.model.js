/**
 * @file geography.model.js
 * @description Knex database query methods and table schemas for Geography Versions and Hierarchy Nodes with mockStore resilience.
 */

const { db, withDbFallback, isDbHealthy } = require('../../database/connection');
const mockStore = require('../../database/mockStore');
const logger = require('../../utils/logger');

let tablesInitialized = false;

/**
 * Ensures table existence dynamically so geography hierarchy and mapping features
 * function reliably across all database environments.
 */
const ensureTablesExist = async () => {
  if (tablesInitialized || !isDbHealthy()) return;

  try {
    // 1. geography_versions
    const hasVersionsTable = await db.schema.hasTable('geography_versions');
    if (!hasVersionsTable) {
      await db.schema.createTable('geography_versions', (table) => {
        table.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
        table.string('version_code', 64).unique().notNullable();
        table.string('name', 255).notNullable();
        table.text('description').nullable();
        table.uuid('project_id').nullable();
        table.boolean('is_active').defaultTo(true);
        table.uuid('imported_by').nullable();
        table.string('file_name', 255).nullable();
        table.integer('total_nodes').defaultTo(0);
        table.timestamps(true, true);
        table.index(['project_id', 'is_active']);
      });
    }

    // 2. geography_nodes
    const hasNodesTable = await db.schema.hasTable('geography_nodes');
    if (!hasNodesTable) {
      await db.schema.createTable('geography_nodes', (table) => {
        table.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
        table.uuid('version_id').nullable();
        table.uuid('project_id').nullable();
        table.string('node_type', 32).notNullable();
        table.string('code', 64).notNullable();
        table.string('name', 255).notNullable();
        table.uuid('parent_id').nullable();
        table.string('state_code', 32).nullable();
        table.string('pc_code', 64).nullable();
        table.string('ac_code', 64).nullable();
        table.string('district_name', 128).nullable();
        table.decimal('latitude', 10, 7).nullable();
        table.decimal('longitude', 10, 7).nullable();
        table.jsonb('metadata').defaultTo('{}');
        table.timestamps(true, true);
        table.index(['node_type', 'code']);
        table.index(['state_code', 'pc_code', 'ac_code']);
        table.index(['version_id', 'project_id']);
      });
    }

    tablesInitialized = true;
  } catch (err) {
    logger.warn('Dynamic table check or creation handled for geography module:', { error: err.message });
    tablesInitialized = true;
  }
};

const geographyModel = {
  /**
   * Initializes prerequisite schemas on-demand
   */
  async init() {
    await ensureTablesExist();
  },

  /**
   * Create a new geography version record
   * @param {object} data
   * @param {import('knex').Knex.Transaction} [trx]
   * @returns {Promise<object>}
   */
  async createVersion(data, trx = null) {
    return withDbFallback(
      async () => {
        await ensureTablesExist();
        const query = db('geography_versions').insert(data).returning('*');
        if (trx) query.transacting(trx);
        const [created] = await query;
        return created;
      },
      () => mockStore.insert('geography_versions', data)
    );
  },

  /**
   * List geography versions
   * @param {object} filters
   * @returns {Promise<Array<object>>}
   */
  async getVersions(filters = {}) {
    return withDbFallback(
      async () => {
        await ensureTablesExist();
        let query = db('geography_versions').orderBy('created_at', 'desc');

        if (filters.projectId) {
          query = query.where((qb) => {
            qb.where('project_id', filters.projectId).orWhereNull('project_id');
          });
        }
        if (typeof filters.isActive === 'boolean') {
          query = query.where('is_active', filters.isActive);
        }

        return query;
      },
      () => {
        let versions = mockStore.data.geography_versions || [];
        if (filters.projectId) {
          versions = versions.filter((v) => !v.project_id || v.project_id === filters.projectId);
        }
        if (typeof filters.isActive === 'boolean') {
          versions = versions.filter((v) => v.is_active === filters.isActive);
        }
        return versions;
      }
    );
  },

  /**
   * Get active version for a project or global default
   * @param {string} [projectId]
   * @returns {Promise<object|null>}
   */
  async getActiveVersion(projectId = null) {
    return withDbFallback(
      async () => {
        await ensureTablesExist();
        let query = db('geography_versions')
          .where('is_active', true)
          .orderBy('created_at', 'desc');

        if (projectId) {
          const projectVersion = await query.clone().where('project_id', projectId).first();
          if (projectVersion) return projectVersion;
        }

        return query.first();
      },
      () => {
        const versions = mockStore.data.geography_versions || [];
        if (projectId) {
          const match = versions.find((v) => v.project_id === projectId && v.is_active);
          if (match) return match;
        }
        return versions.find((v) => v.is_active) || versions[0] || null;
      }
    );
  },

  /**
   * Batch insert geography nodes inside a transaction
   * @param {Array<object>} nodes
   * @param {import('knex').Knex.Transaction} [trx]
   * @returns {Promise<number>}
   */
  async batchInsertNodes(nodes, trx = null) {
    return withDbFallback(
      async () => {
        await ensureTablesExist();
        if (!nodes || nodes.length === 0) return 0;

        const runner = trx || db;
        const batchSize = 100;
        let inserted = 0;

        for (let i = 0; i < nodes.length; i += batchSize) {
          const slice = nodes.slice(i, i + batchSize);
          await runner('geography_nodes').insert(slice);
          inserted += slice.length;
        }

        return inserted;
      },
      () => {
        if (!nodes || nodes.length === 0) return 0;
        for (const n of nodes) {
          mockStore.insert('geography_nodes', n);
        }
        return nodes.length;
      }
    );
  },

  /**
   * Query all nodes with flexible filters
   * @param {object} filters
   * @returns {Promise<Array<object>>}
   */
  async getNodes(filters = {}) {
    return withDbFallback(
      async () => {
        await ensureTablesExist();
        let query = db('geography_nodes').orderBy('code', 'asc');

        if (filters.versionId) query = query.where('version_id', filters.versionId);
        if (filters.nodeType) query = query.where('node_type', filters.nodeType);
        if (filters.stateCode) query = query.where('state_code', filters.stateCode);
        if (filters.pcCode) query = query.where('pc_code', filters.pcCode);
        if (filters.acCode) query = query.where('ac_code', filters.acCode);
        if (filters.parentId) query = query.where('parent_id', filters.parentId);

        return query;
      },
      () => {
        let nodes = mockStore.data.geography_nodes || [];
        if (filters.versionId) nodes = nodes.filter((n) => n.version_id === filters.versionId);
        if (filters.nodeType) nodes = nodes.filter((n) => n.node_type === filters.nodeType);
        if (filters.stateCode) nodes = nodes.filter((n) => n.state_code === filters.stateCode);
        if (filters.pcCode) nodes = nodes.filter((n) => n.pc_code === filters.pcCode);
        if (filters.acCode) nodes = nodes.filter((n) => n.ac_code === filters.acCode);
        if (filters.parentId) nodes = nodes.filter((n) => n.parent_id === filters.parentId);
        return nodes;
      }
    );
  },

  /**
   * Get list of unique states
   * @param {string} [versionId]
   * @returns {Promise<Array<object>>}
   */
  async getStates(versionId = null) {
    return withDbFallback(
      async () => {
        await ensureTablesExist();
        let query = db('geography_nodes')
          .where('node_type', 'STATE')
          .orderBy('name', 'asc');

        if (versionId) query = query.where('version_id', versionId);
        return query;
      },
      () => {
        let nodes = (mockStore.data.geography_nodes || []).filter((n) => n.node_type === 'STATE');
        if (versionId) nodes = nodes.filter((n) => n.version_id === versionId);
        return nodes;
      }
    );
  },

  /**
   * Get parliamentary constituencies (PCs) for a state
   * @param {string} stateCode
   * @param {string} [versionId]
   * @returns {Promise<Array<object>>}
   */
  async getPcsByState(stateCode, versionId = null) {
    return withDbFallback(
      async () => {
        await ensureTablesExist();
        let query = db('geography_nodes')
          .where('node_type', 'PC')
          .orderBy('name', 'asc');

        if (stateCode) query = query.where('state_code', stateCode);
        if (versionId) query = query.where('version_id', versionId);
        return query;
      },
      () => {
        let nodes = (mockStore.data.geography_nodes || []).filter((n) => n.node_type === 'PC');
        if (stateCode) nodes = nodes.filter((n) => n.state_code === stateCode);
        if (versionId) nodes = nodes.filter((n) => n.version_id === versionId);
        return nodes;
      }
    );
  },

  /**
   * Get assembly constituencies (ACs) dependent on PC or State
   * @param {string} [pcCode]
   * @param {string} [stateCode]
   * @param {string} [versionId]
   * @returns {Promise<Array<object>>}
   */
  async getAcs(pcCode = null, stateCode = null, versionId = null) {
    return withDbFallback(
      async () => {
        await ensureTablesExist();
        let query = db('geography_nodes')
          .where('node_type', 'AC')
          .orderBy('name', 'asc');

        if (pcCode) query = query.where('pc_code', pcCode);
        if (stateCode) query = query.where('state_code', stateCode);
        if (versionId) query = query.where('version_id', versionId);
        return query;
      },
      () => {
        let nodes = (mockStore.data.geography_nodes || []).filter((n) => n.node_type === 'AC');
        if (pcCode) nodes = nodes.filter((n) => n.pc_code === pcCode);
        if (stateCode) nodes = nodes.filter((n) => n.state_code === stateCode);
        if (versionId) nodes = nodes.filter((n) => n.version_id === versionId);
        return nodes;
      }
    );
  },

  /**
   * Get SEPs/Booths under an Assembly Constituency
   * @param {string} acCode
   * @param {string} [versionId]
   * @returns {Promise<Array<object>>}
   */
  async getSepsByAc(acCode, versionId = null) {
    return withDbFallback(
      async () => {
        await ensureTablesExist();
        let query = db('geography_nodes')
          .whereIn('node_type', ['SEP', 'BOOTH', 'WARD'])
          .where('ac_code', acCode)
          .orderBy('code', 'asc');

        if (versionId) query = query.where('version_id', versionId);
        return query;
      },
      () => {
        let nodes = (mockStore.data.geography_nodes || []).filter((n) =>
          ['SEP', 'BOOTH', 'WARD'].includes(n.node_type)
        );
        if (acCode) nodes = nodes.filter((n) => n.ac_code === acCode);
        if (versionId) nodes = nodes.filter((n) => n.version_id === versionId);
        return nodes;
      }
    );
  },
};

module.exports = geographyModel;
