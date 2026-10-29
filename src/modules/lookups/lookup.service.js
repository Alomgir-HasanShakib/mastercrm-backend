/**
 * @file lookup.service.js
 * @description Generic n-tier hierarchical lookup service (PC -> AC, district -> assembly, block -> gp).
 * Includes Gujarat TVC fixture seed (26 PCs & 182 ACs).
 */

const db = require('../../database/connection');
const { NotFoundError } = require('../../utils/errors');

// Gujarat 26 Lok Sabha & 182 Vidhan Sabha Constituency Master Fixture (exact parity with legacy DataProcessTVC)
const GUJARAT_PC_AC_FIXTURE = {
  Kachchh: [
    "Abdasa",
    "Mandvi",
    "Bhuj",
    "Anjar",
    "Gandhidham (SC)",
    "Rapar",
    "Morbi",
  ],
  Banaskantha: [
    "Vav",
    "Tharad",
    "Dhanera",
    "Danta (ST)",
    "Palanpur",
    "Deesa",
    "Deodar",
  ],
  Patan: [
    "Vadgam (SC)",
    "Kankrej",
    "Radhanpur",
    "Chanasma",
    "Patan",
    "Siddhpur",
    "Kheralu",
  ],
  Mahesana: [
    "Unjha",
    "Visnagar",
    "Becharaji",
    "Kadi (SC)",
    "Mahesana",
    "Vijapur",
    "Mansa",
  ],
  Sabarkantha: [
    "Himatnagar",
    "Idar (SC)",
    "Khedbrahma (ST)",
    "Bhiloda (ST)",
    "Modasa",
    "Bayad",
    "Prantij",
  ],
  Gandhinagar: [
    "Gandhinagar North",
    "Kalol",
    "Sanand",
    "Ghatlodia",
    "Vejalpur",
    "Naranpura",
    "Sabarmati",
  ],
  "Ahmedabad East": [
    "Dehgam",
    "Gandhinagar South",
    "Vatva",
    "Nikol",
    "Naroda",
    "Thakkarbapa Nagar",
    "Bapunagar",
  ],
  "Ahmedabad West": [
    "Ellisbridge",
    "Amraiwadi",
    "Dariapur",
    "Jamalpur - Khadia",
    "Maninagar",
    "Danilimda (SC)",
    "Asarwa (SC)",
  ],
  Surendranagar: [
    "Viramgam",
    "Dhandhuka",
    "Dasada (SC)",
    "Limbdi",
    "Wadhwan",
    "Chotila",
    "Dhrangadhra",
  ],
  Rajkot: [
    "Tankara",
    "Wankaner",
    "Rajkot East",
    "Rajkot West",
    "Rajkot South",
    "Rajkot Rural (SC)",
    "Jasdan",
  ],
  Porbandar: [
    "Gondal",
    "Jetpur",
    "Dhoraji",
    "Porbandar",
    "Kutiyana",
    "Manavadar",
    "Keshod",
  ],
  Jamnagar: [
    "Kalavad S.C. (SC)",
    "Jamnagar Rural",
    "Jamnagar North",
    "Jamnagar South",
    "Jamjodhpur",
    "Khambhalia",
    "Dwarka",
  ],
  Junagadh: [
    "Junagadh",
    "Visavadar",
    "Mangrol",
    "Somnath",
    "Talala",
    "Kodinar (SC)",
    "Una",
  ],
  Amreli: [
    "Dhari",
    "Amreli",
    "Lathi",
    "Savarkundla",
    "Rajula",
    "Mahuva",
    "Gariadhar",
  ],
  Bhavnagar: [
    "Talaja",
    "Palitana",
    "Bhavnagar Rural",
    "Bhavnagar East",
    "Bhavnagar West",
    "Gadhada (SC)",
    "Botad",
  ],
  Anand: [
    "Khambhat",
    "Borsad",
    "Anklav",
    "Umreth",
    "Anand",
    "Petlad",
    "Sojitra",
  ],
  Kheda: [
    "Daskroi",
    "Dholka",
    "Matar",
    "Nadiad",
    "Mehmedabad",
    "Mahudha",
    "Kapadvanj",
  ],
  Panchmahal: [
    "Thasra",
    "Balasinor",
    "Lunawada",
    "Shahera",
    "Morva Hadaf (ST)",
    "Godhra",
    "Kalol",
  ],
  Dahod: [
    "Santrampur (ST)",
    "Fatepura (ST)",
    "Jhalod (ST)",
    "Limkheda (ST)",
    "Dahod (ST)",
    "Garbada (ST)",
    "Devgadbaria",
  ],
  Vadodara: [
    "Savli",
    "Vaghodia",
    "Vadodara City (SC)",
    "Sayajigunj",
    "Akota",
    "Raopura",
    "Manjalpur",
  ],
  "Chhota Udaipur": [
    "Halol",
    "Chhota Udaipur (ST)",
    "Jetpur (ST)",
    "Sankheda (ST)",
    "Dabhoi",
    "Padra",
    "Nandod (ST)",
  ],
  Bharuch: [
    "Karjan",
    "Dediyapada (ST)",
    "Jambusar",
    "Vagra",
    "Jhagadia (ST)",
    "Bharuch",
    "Ankleshwar",
  ],
  Bardoli: [
    "Mangrol (ST)",
    "Mandvi (ST)",
    "Kamrej",
    "Bardoli (SC)",
    "Mahuva (ST)",
    "Vyara (ST)",
    "Nizar (ST)",
  ],
  Surat: [
    "Olpad",
    "Surat East",
    "Surat North",
    "Varachha Road",
    "Karanj",
    "Katargam",
    "Surat West",
  ],
  Navsari: [
    "Limbayat",
    "Udhna",
    "Majura",
    "Choryasi",
    "Jalalpore",
    "Navsari",
    "Gandevi (ST)",
  ],
  Valsad: [
    "Dangs (ST)",
    "Vansda (ST)",
    "Dharampur (ST)",
    "Valsad",
    "Pardi",
    "Kaprada (ST)",
    "Umbergaon (ST)",
  ],
};

class LookupService {
  /**
   * Initializes or fetches Gujarat PC-AC dataset for a project
   * @param {string} projectId
   * @returns {Promise<object>}
   */
  async ensureGujaratPcAcDataset(projectId) {
    let dataset = await db('lookup_datasets')
      .where({ project_id: projectId, dataset_code: 'gujarat_pc_ac' })
      .first();

    if (!dataset) {
      const [newDs] = await db('lookup_datasets')
        .insert({
          project_id: projectId,
          dataset_code: 'gujarat_pc_ac',
          name: 'Gujarat Lok Sabha to Vidhan Sabha Master',
          version_number: 1,
          is_active: true,
        })
        .returning('*');
      dataset = newDs;

      // Seed nodes
      const nodes = [];
      let sortOrder = 1;

      for (const [pcName, acList] of Object.entries(GUJARAT_PC_AC_FIXTURE)) {
        // Parent PC Node
        nodes.push({
          dataset_id: dataset.id,
          node_code: pcName,
          node_label: pcName,
          parent_code: null,
          level: 'pc',
          sort_order: sortOrder++,
          metadata_jsonb: JSON.stringify({ isLokSabha: true }),
        });

        // Child AC Nodes
        for (const acName of acList) {
          nodes.push({
            dataset_id: dataset.id,
            node_code: acName,
            node_label: acName,
            parent_code: pcName,
            level: 'ac',
            sort_order: sortOrder++,
            metadata_jsonb: JSON.stringify({ isVidhanSabha: true }),
          });
        }
      }

      // Batch insert nodes
      const chunkSize = 50;
      for (let i = 0; i < nodes.length; i += chunkSize) {
        await db('lookup_nodes').insert(nodes.slice(i, i + chunkSize));
      }
    }

    return dataset;
  }

  /**
   * Retrieves nodes for a dataset, filtered by parentCode or level
   * @param {string} projectId
   * @param {string} datasetIdOrCode
   * @param {object} filters - { parentCode, level }
   * @returns {Promise<Array<object>>}
   */
  async getNodes(projectId, datasetIdOrCode, filters = {}) {
    let dataset = await db('lookup_datasets')
      .where({ project_id: projectId })
      .andWhere(function () {
        this.where('id', datasetIdOrCode).orWhere('dataset_code', datasetIdOrCode);
      })
      .first();

    if (!dataset && datasetIdOrCode === 'gujarat_pc_ac') {
      dataset = await this.ensureGujaratPcAcDataset(projectId);
    }

    if (!dataset) {
      // Fallback in-memory check for Gujarat TVC fixture
      if (datasetIdOrCode === 'gujarat_pc_ac') {
        const { parentCode, level } = filters;
        if (!parentCode || level === 'pc') {
          return Object.keys(GUJARAT_PC_AC_FIXTURE).map((pc) => ({
            code: pc,
            label: pc,
            level: 'pc',
          }));
        }
        const acs = GUJARAT_PC_AC_FIXTURE[parentCode] || [];
        return acs.map((ac) => ({
          code: ac,
          label: ac,
          parentCode,
          level: 'ac',
        }));
      }
      throw new NotFoundError(`Lookup dataset '${datasetIdOrCode}' not found.`);
    }

    let query = db('lookup_nodes')
      .where({ dataset_id: dataset.id, is_active: true })
      .orderBy('sort_order', 'asc');

    if (filters.parentCode !== undefined) {
      if (filters.parentCode === null || filters.parentCode === '') {
        query = query.whereNull('parent_code');
      } else {
        query = query.where('parent_code', filters.parentCode);
      }
    }

    if (filters.level) {
      query = query.where('level', filters.level);
    }

    const rows = await query;
    return rows.map((r) => ({
      code: r.node_code,
      label: r.node_label,
      parentCode: r.parent_code,
      level: r.level,
    }));
  }

  /**
   * Returns entire lookup hierarchy dictionary for validation
   * @param {string} projectId
   * @param {string} datasetIdOrCode
   * @returns {Promise<Object<string, Array<string>>>}
   */
  async getHierarchyDictionary(projectId, datasetIdOrCode) {
    if (datasetIdOrCode === 'gujarat_pc_ac') {
      return GUJARAT_PC_AC_FIXTURE;
    }

    const nodes = await this.getNodes(projectId, datasetIdOrCode);
    const dict = {};
    for (const node of nodes) {
      if (node.parentCode) {
        if (!dict[node.parentCode]) dict[node.parentCode] = [];
        dict[node.parentCode].push(node.code);
      }
    }
    return dict;
  }
}

module.exports = new LookupService();
module.exports.GUJARAT_PC_AC_FIXTURE = GUJARAT_PC_AC_FIXTURE;
