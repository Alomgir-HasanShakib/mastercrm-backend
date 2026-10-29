/**
 * @file geography.service.js
 * @description Business logic for Administrative & Electoral Geography Mapping, Multi-tier Hierarchy Resolver (State -> PC -> AC -> SEP/Booth), and Excel Delimitation Ingestion.
 */

const xlsx = require('xlsx');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../../database/connection');
const geographyModel = require('./geography.model');
const { ValidationError } = require('../../utils/errors');
const logger = require('../../utils/logger');

const geographyService = {
  /**
   * Resolves nested project-wise hierarchy tree: State -> PC -> AC -> SEP/Booth
   * @param {object} filters
   * @returns {Promise<object>}
   */
  async getHierarchyTree(filters = {}) {
    const { projectId, versionId, search } = filters;

    let targetVersionId = versionId;
    if (!targetVersionId) {
      const activeVersion = await geographyModel.getActiveVersion(projectId);
      if (activeVersion) {
        targetVersionId = activeVersion.id;
      }
    }

    const allNodes = await geographyModel.getNodes({ versionId: targetVersionId });

    // Group nodes by type
    const stateMap = new Map();
    const pcMap = new Map();
    const acMap = new Map();
    const boothList = [];

    allNodes.forEach((node) => {
      const parsedMeta = typeof node.metadata === 'string' ? JSON.parse(node.metadata || '{}') : node.metadata || {};
      const nodeObj = { ...node, metadata: parsedMeta };

      if (node.node_type === 'STATE') {
        stateMap.set(node.code, { ...nodeObj, pcs: [], pcCount: 0, acCount: 0, boothCount: 0 });
      } else if (node.node_type === 'PC') {
        pcMap.set(node.code, { ...nodeObj, acs: [], acCount: 0, boothCount: 0 });
      } else if (node.node_type === 'AC') {
        acMap.set(node.code, { ...nodeObj, booths: [], boothCount: 0 });
      } else {
        boothList.push(nodeObj);
      }
    });

    // Nest Booths into ACs
    boothList.forEach((booth) => {
      if (booth.ac_code && acMap.has(booth.ac_code)) {
        const ac = acMap.get(booth.ac_code);
        ac.booths.push(booth);
        ac.boothCount += 1;
      }
    });

    // Nest ACs into PCs
    acMap.forEach((ac) => {
      if (ac.pc_code && pcMap.has(ac.pc_code)) {
        const pc = pcMap.get(ac.pc_code);
        pc.acs.push(ac);
        pc.acCount += 1;
        pc.boothCount += ac.boothCount;
      }
    });

    // Nest PCs into States
    pcMap.forEach((pc) => {
      if (pc.state_code && stateMap.has(pc.state_code)) {
        const state = stateMap.get(pc.state_code);
        state.pcs.push(pc);
        state.pcCount += 1;
        state.acCount += pc.acCount;
        state.boothCount += pc.boothCount;
      }
    });

    let statesTree = Array.from(stateMap.values());

    // Apply search filter if provided
    if (search && search.trim() !== '') {
      const query = search.trim().toLowerCase();
      statesTree = statesTree
        .map((state) => {
          const stateMatches = state.name.toLowerCase().includes(query) || state.code.toLowerCase().includes(query);
          const filteredPcs = state.pcs
            .map((pc) => {
              const pcMatches = pc.name.toLowerCase().includes(query) || pc.code.toLowerCase().includes(query);
              const filteredAcs = pc.acs.filter(
                (ac) =>
                  ac.name.toLowerCase().includes(query) ||
                  ac.code.toLowerCase().includes(query) ||
                  (ac.district_name && ac.district_name.toLowerCase().includes(query))
              );
              if (pcMatches || filteredAcs.length > 0) {
                return { ...pc, acs: filteredAcs.length > 0 ? filteredAcs : pc.acs };
              }
              return null;
            })
            .filter(Boolean);

          if (stateMatches || filteredPcs.length > 0) {
            return { ...state, pcs: filteredPcs.length > 0 ? filteredPcs : state.pcs };
          }
          return null;
        })
        .filter(Boolean);
    }

    const totalStates = stateMap.size;
    const totalPcs = pcMap.size;
    const totalAcs = acMap.size;
    const totalBooths = boothList.length;

    return {
      versionId: targetVersionId,
      summary: {
        totalStates,
        totalPcs,
        totalAcs,
        totalBooths,
      },
      tree: statesTree,
    };
  },

  /**
   * Get list of Assembly Constituencies dependent on PC or State
   * @param {object} params
   * @returns {Promise<Array<object>>}
   */
  async getDependentAcs(params = {}) {
    const { pcCode, stateCode, versionId } = params;
    return geographyModel.getAcs(pcCode, stateCode, versionId);
  },

  /**
   * Get list of States
   * @param {string} [versionId]
   * @returns {Promise<Array<object>>}
   */
  async getStates(versionId = null) {
    return geographyModel.getStates(versionId);
  },

  /**
   * Get list of Parliamentary Constituencies for a given state
   * @param {string} stateCode
   * @param {string} [versionId]
   * @returns {Promise<Array<object>>}
   */
  async getPcsByState(stateCode, versionId = null) {
    return geographyModel.getPcsByState(stateCode, versionId);
  },

  /**
   * Get list of SEPs / Polling Booths under an Assembly Constituency
   * @param {string} acCode
   * @param {string} [versionId]
   * @returns {Promise<Array<object>>}
   */
  async getSepsByAc(acCode, versionId = null) {
    return geographyModel.getSepsByAc(acCode, versionId);
  },

  /**
   * List all available geography versions
   * @param {object} filters
   * @returns {Promise<Array<object>>}
   */
  async listVersions(filters = {}) {
    return geographyModel.getVersions(filters);
  },

  /**
   * Ingest and parse Excel / CSV file containing State-PC-AC-Booth mapping
   * Generates a new geography version and links parents automatically.
   * @param {Buffer} fileBuffer
   * @param {object} metadata
   * @param {string} userId
   * @returns {Promise<object>}
   */
  async importGeographyExcel(fileBuffer, metadata = {}, userId = null) {
    if (!fileBuffer || fileBuffer.length === 0) {
      throw new ValidationError('Uploaded file buffer is empty or corrupted');
    }

    let workbook;
    try {
      workbook = xlsx.read(fileBuffer, { type: 'buffer' });
    } catch (parseErr) {
      throw new ValidationError(`Failed to parse Excel workbook: ${parseErr.message}`);
    }

    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      throw new ValidationError('Excel workbook does not contain any valid worksheet');
    }

    const worksheet = workbook.Sheets[firstSheetName];
    const rawRows = xlsx.utils.sheet_to_json(worksheet, { defval: '' });

    if (!rawRows || rawRows.length === 0) {
      throw new ValidationError('Worksheet does not contain data rows');
    }

    // Helper: Normalize column name lookup
    const findValue = (row, candidates) => {
      const keys = Object.keys(row);
      for (const cand of candidates) {
        const foundKey = keys.find((k) => k.trim().toLowerCase() === cand.toLowerCase());
        if (foundKey && row[foundKey] !== undefined && row[foundKey] !== '') {
          return String(row[foundKey]).trim();
        }
      }
      return '';
    };

    const uniqueStates = new Map();
    const uniquePcs = new Map();
    const uniqueAcs = new Map();
    const boothRecords = [];

    // First pass: extract rows and organize unique hierarchical entries
    rawRows.forEach((row, idx) => {
      const stateName = findValue(row, ['State Name', 'State', 'State_Name']);
      const stateCode = findValue(row, ['State Code', 'State_Code', 'StateCode']) || stateName.substring(0, 3).toUpperCase();

      const pcName = findValue(row, ['PC Name', 'PC', 'PC_Name', 'Parliamentary Constituency']);
      const pcCode = findValue(row, ['PC Code', 'PC_Code', 'PC No', 'PC_No']) || (pcName ? `${stateCode}-PC-${pcName}` : '');

      const acName = findValue(row, ['AC Name', 'AC', 'AC_Name', 'Assembly Constituency']);
      const acCode = findValue(row, ['AC Code', 'AC_Code', 'AC No', 'AC_No']) || (acName ? `${stateCode}-AC-${acName}` : '');

      const districtName = findValue(row, ['District Name', 'District', 'District_Name']);

      const boothName = findValue(row, ['Booth Name', 'SEP Name', 'Booth', 'SEP', 'Polling Station']);
      const boothCode = findValue(row, ['Booth Code', 'SEP Code', 'Booth No', 'Booth_No', 'SEP_Code']) || (boothName ? `${acCode}-B${idx + 1}` : '');

      const lat = parseFloat(findValue(row, ['Latitude', 'Lat'])) || null;
      const lng = parseFloat(findValue(row, ['Longitude', 'Lng', 'Long'])) || null;

      if (!stateName && !pcName && !acName) return;

      // Register State
      if (stateCode && !uniqueStates.has(stateCode)) {
        uniqueStates.set(stateCode, {
          id: uuidv4(),
          node_type: 'STATE',
          code: stateCode,
          name: stateName || stateCode,
          state_code: stateCode,
          district_name: 'Statewide',
          metadata: JSON.stringify({ imported: true }),
        });
      }

      // Register PC
      if (pcCode && !uniquePcs.has(pcCode)) {
        const stateNode = uniqueStates.get(stateCode);
        uniquePcs.set(pcCode, {
          id: uuidv4(),
          parent_id: stateNode ? stateNode.id : null,
          node_type: 'PC',
          code: pcCode,
          name: pcName || pcCode,
          state_code: stateCode,
          pc_code: pcCode,
          district_name: districtName || stateName,
          metadata: JSON.stringify({ imported: true }),
        });
      }

      // Register AC
      if (acCode && !uniqueAcs.has(acCode)) {
        const pcNode = uniquePcs.get(pcCode);
        uniqueAcs.set(acCode, {
          id: uuidv4(),
          parent_id: pcNode ? pcNode.id : null,
          node_type: 'AC',
          code: acCode,
          name: acName || acCode,
          state_code: stateCode,
          pc_code: pcCode,
          ac_code: acCode,
          district_name: districtName,
          metadata: JSON.stringify({ imported: true }),
        });
      }

      // Register Booth/SEP
      if (boothCode) {
        const acNode = uniqueAcs.get(acCode);
        boothRecords.push({
          id: uuidv4(),
          parent_id: acNode ? acNode.id : null,
          node_type: 'BOOTH',
          code: boothCode,
          name: boothName || boothCode,
          state_code: stateCode,
          pc_code: pcCode,
          ac_code: acCode,
          district_name: districtName,
          latitude: lat,
          longitude: lng,
          metadata: JSON.stringify({ imported: true, original_row: idx + 2 }),
        });
      }
    });

    const allPreparedNodes = [
      ...Array.from(uniqueStates.values()),
      ...Array.from(uniquePcs.values()),
      ...Array.from(uniqueAcs.values()),
      ...boothRecords,
    ];

    if (allPreparedNodes.length === 0) {
      throw new ValidationError('No valid geographic entities identified in Excel headers. Please check sheet columns.');
    }

    const versionCode = `GEO-${new Date().getFullYear()}-M${(new Date().getMonth() + 1).toString().padStart(2, '0')}-${uuidv4().substring(0, 6).toUpperCase()}`;

    // Execute in Knex transaction
    const result = await db.transaction(async (trx) => {
      // 1. Create version record
      const [version] = await trx('geography_versions')
        .insert({
          version_code: versionCode,
          name: metadata.versionName || `Imported Delimitation (${allPreparedNodes.length} nodes)`,
          description: metadata.description || `Batch imported from ${metadata.fileName || 'Excel file'}`,
          project_id: metadata.projectId || null,
          is_active: true,
          imported_by: userId,
          file_name: metadata.fileName || null,
          total_nodes: allPreparedNodes.length,
        })
        .returning('*');

      // 2. Associate version_id and project_id to all nodes
      const nodesWithVersion = allPreparedNodes.map((n) => ({
        ...n,
        version_id: version.id,
        project_id: metadata.projectId || null,
      }));

      // 3. Batch insert nodes
      const batchSize = 100;
      for (let i = 0; i < nodesWithVersion.length; i += batchSize) {
        await trx('geography_nodes').insert(nodesWithVersion.slice(i, i + batchSize));
      }

      return version;
    });

    logger.info('Geography Excel imported successfully:', {
      versionCode,
      totalStates: uniqueStates.size,
      totalPcs: uniquePcs.size,
      totalAcs: uniqueAcs.size,
      totalBooths: boothRecords.length,
      totalNodes: allPreparedNodes.length,
    });

    return {
      versionId: result.id,
      versionCode: result.version_code,
      name: result.name,
      totalStates: uniqueStates.size,
      totalPcs: uniquePcs.size,
      totalAcs: uniqueAcs.size,
      totalBooths: boothRecords.length,
      totalNodes: allPreparedNodes.length,
      createdAt: result.created_at,
    };
  },
};

module.exports = geographyService;
