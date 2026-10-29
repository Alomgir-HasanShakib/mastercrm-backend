/**
 * @file clientDbSuperAudit.service.js
 * @description Client Database Pull & Push sync engine for Super Quality Audit.
 * Handles:
 * 1. Safe, read-only PULL from client MySQL table (with submission_id deduplication).
 * 2. Automatic creation of local triplet tables (Input, Output 1, Output 2).
 * 3. PUSH of audited evaluations to client MySQL tables with pushed = TRUE updates.
 */

const mysql = require('mysql2/promise');
const { db, withDbFallback } = require('../../database/connection');
const mockStore = require('../../database/mockStore');
const logger = require('../../utils/logger');
const { ensureDynamicTables, deriveTripletTableNames } = require('./superAuditTables.service');

// Default client DB credentials (provided by client)
const DEFAULT_CLIENT_DB_CONFIG = {
  host: process.env.CLIENT_MYSQL_HOST || 'server-esolutions.stelleronix.com',
  user: process.env.CLIENT_MYSQL_USER || 'stelleronix',
  password: process.env.CLIENT_MYSQL_PASSWORD || 'At@7003883903stlx',
  database: process.env.CLIENT_MYSQL_DATABASE || 'e_solutions',
  port: parseInt(process.env.CLIENT_MYSQL_PORT || '3306', 10),
  connectTimeout: 10000,
};

/**
 * Creates a MySQL connection to the client database.
 * @param {object} customConfig
 * @returns {Promise<mysql.Connection>}
 */
async function getClientDbConnection(customConfig = {}) {
  const config = { ...DEFAULT_CLIENT_DB_CONFIG, ...customConfig };
  return mysql.createConnection(config);
}

/**
 * PULLS new records from client MySQL input table into our local database.
 * Strictly performs deduplication: only records NOT in our local input table are inserted.
 * NEVER deletes or alters client DB data.
 *
 * @param {string} inputTableName e.g. 'as_audit_input_ac_r3_sup'
 * @param {object} options { limit, customConfig }
 * @returns {Promise<object>}
 */
async function pullClientData(inputTableName = 'as_audit_input_ac_r3_sup', options = {}) {
  const startTime = Date.now();
  const limit = options.limit || 50;
  const { inputTable, outputTable1, outputTable2 } = await ensureDynamicTables(inputTableName, options.output1Table, options.output2Table);

  logger.info(`Starting Client DB PULL for table: ${inputTable} (limit: ${limit})`);

  let clientConn = null;
  try {
    clientConn = await getClientDbConnection(options.customConfig);

    // 1. Fetch records from client DB
    const [clientRows] = await clientConn.query(
      `SELECT * FROM \`${inputTable}\` ORDER BY submission_date DESC LIMIT ?`,
      [limit]
    );

    if (!clientRows || clientRows.length === 0) {
      await clientConn.end();
      return {
        success: true,
        inputTable,
        fetched: 0,
        inserted: 0,
        skippedExisting: 0,
        durationMs: Date.now() - startTime,
        message: 'No records found in client DB table.',
      };
    }

    // 2. Query our local table for existing submission_ids
    const clientSubmissionIds = clientRows.map((r) => r.submission_id).filter(Boolean);

    let existingIds = new Set();
    await withDbFallback(
      async () => {
        const existingRows = await db(inputTable)
          .whereIn('submission_id', clientSubmissionIds)
          .select('submission_id');
        existingRows.forEach((r) => existingIds.add(r.submission_id));
      },
      () => {
        const storeRows = (mockStore.data && mockStore.data[inputTable]) || [];
        storeRows.forEach((r) => {
          if (clientSubmissionIds.includes(r.submission_id)) {
            existingIds.add(r.submission_id);
          }
        });
      }
    );

    // 3. Filter only NEW records that do not exist locally
    const newRecords = clientRows.filter((r) => !existingIds.has(r.submission_id));

    let insertedCount = 0;
    if (newRecords.length > 0) {
      await withDbFallback(
        async () => {
          // Map to safe objects
          const rowsToInsert = newRecords.map((r) => ({
            submission_id: r.submission_id,
            audio_link: r.audio_link || null,
            ac_num: r.ac_num ? String(r.ac_num) : null,
            fa: r.fa ? String(r.fa) : null,
            collector_emailid: r.collector_emailid || null,
            tl_id: r.tl_id || null,
            duration: r.duration !== null && r.duration !== undefined ? parseFloat(r.duration) : null,
            submission_date: r.submission_date || null,
            dumping_date: r.dumping_date || null,
            batch_slot: r.batch_slot || null,
            religion: r.religion || null,
            ac_name: r.ac_name || null,
            full_name: r.full_name || null,
            phone_no: r.phone_no ? String(r.phone_no) : null,
            caste: r.caste || null,
            state_govt_change: r.state_govt_change || null,
            state_govt_change_party_1: r.state_govt_change_party_1 || null,
            mla_choice: r.mla_choice || null,
            second_mla_choice: r.second_mla_choice || null,
            voting_intention_vs_party: r.voting_intention_vs_party || null,
            candidate_party_mismatch: r.candidate_party_mismatch || null,
            candidate_mismatch: r.candidate_mismatch || null,
            vs_past_party: r.vs_past_party || null,
            ls_past_party: r.ls_past_party || null,
            mla_awareness: r.mla_awareness || null,
            cm_choice: r.cm_choice || null,
            voting_intention_ls_party: r.voting_intention_ls_party || null,
            assignment_time: r.assignment_time || '1970-01-01 00:00:00',
            agent_id: r.agent_id || null,
            sync_status: 'PENDING',
          }));

          // Batch insert into our local input table
          await db(inputTable).insert(rowsToInsert);
          insertedCount = rowsToInsert.length;
        },
        () => {
          if (!mockStore.data) mockStore.data = {};
          if (!mockStore.data[inputTable]) mockStore.data[inputTable] = [];
          newRecords.forEach((r) => {
            mockStore.data[inputTable].push({ ...r, sync_status: 'PENDING' });
          });
          insertedCount = newRecords.length;
        }
      );
    }

    await clientConn.end();

    const durationMs = Date.now() - startTime;
    logger.info(
      `Client DB PULL finished. Fetched: ${clientRows.length}, Inserted: ${insertedCount}, Skipped: ${existingIds.size}, Duration: ${durationMs}ms`
    );

    return {
      success: true,
      inputTable,
      fetched: clientRows.length,
      inserted: insertedCount,
      skippedExisting: existingIds.size,
      durationMs,
      message: `Successfully synchronized ${insertedCount} new records from client DB into ${inputTable}.`,
    };
  } catch (err) {
    if (clientConn) {
      try {
        await clientConn.end();
      } catch (_) {}
    }
    logger.error(`Error pulling client data from ${inputTableName}: ${err.message}`);

    // Graceful fallback: return mock/simulated batch if external connection fails
    return {
      success: false,
      inputTable,
      error: err.message,
      fetched: 0,
      inserted: 0,
      skippedExisting: 0,
      durationMs: Date.now() - startTime,
      message: `Client DB connection error: ${err.message}`,
    };
  }
}

/**
 * PUSHES audited evaluations from our local Output 1 and Output 2 tables back to client DB.
 * Only selects records where pushed = FALSE.
 * Upon successful push, marks pushed = TRUE in our local tables.
 *
 * @param {string} inputTableName e.g. 'as_audit_input_ac_r3_sup'
 * @param {object} options
 * @returns {Promise<object>}
 */
async function pushClientData(inputTableName = 'as_audit_input_ac_r3_sup', options = {}) {
  const startTime = Date.now();
  const { inputTable, outputTable1, outputTable2 } = deriveTripletTableNames(inputTableName, options.output1Table, options.output2Table);

  logger.info(`Starting Client DB PUSH for tables: ${outputTable1} and ${outputTable2}`);

  // 1. Fetch unpushed records from local output tables
  let unpushedOut1 = [];
  let unpushedOut2 = [];

  await withDbFallback(
    async () => {
      const hasOut1 = await db.schema.hasTable(outputTable1);
      const hasOut2 = await db.schema.hasTable(outputTable2);

      if (hasOut1) {
        unpushedOut1 = await db(outputTable1).where('pushed', false).limit(options.limit || 50);
      }
      if (hasOut2) {
        unpushedOut2 = await db(outputTable2).where('pushed', false).limit(options.limit || 50);
      }
    },
    () => {
      const store1 = (mockStore.data && mockStore.data[outputTable1]) || [];
      const store2 = (mockStore.data && mockStore.data[outputTable2]) || [];
      unpushedOut1 = store1.filter((r) => !r.pushed).slice(0, options.limit || 50);
      unpushedOut2 = store2.filter((r) => !r.pushed).slice(0, options.limit || 50);
    }
  );

  if (unpushedOut1.length === 0 && unpushedOut2.length === 0) {
    return {
      success: true,
      pushedOutput1: 0,
      pushedOutput2: 0,
      durationMs: Date.now() - startTime,
      message: 'All completed audits are already pushed to client DB (0 pending).',
    };
  }

  let clientConn = null;
  try {
    clientConn = await getClientDbConnection(options.customConfig);

    // Push to Output 1 table
    let pushedOut1Count = 0;
    if (unpushedOut1.length > 0) {
      for (const row of unpushedOut1) {
        const { created_at, updated_at, pushed, ...cleanRow } = row;
        const keys = Object.keys(cleanRow);
        const placeholders = keys.map(() => '?').join(', ');
        const updateClause = keys.map((k) => `\`${k}\` = VALUES(\`${k}\`)`).join(', ');

        const sql = `INSERT INTO \`${outputTable1}\` (\`${keys.join('`, `')}\`) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updateClause}`;
        await clientConn.query(sql, Object.values(cleanRow));
        pushedOut1Count++;
      }

      // Mark local rows as pushed
      const pushedIds1 = unpushedOut1.map((r) => r.submission_id);
      await withDbFallback(
        async () => {
          await db(outputTable1).whereIn('submission_id', pushedIds1).update({
            pushed: true,
            updated_at: db.fn.now(),
          });
        },
        () => {
          const store1 = (mockStore.data && mockStore.data[outputTable1]) || [];
          store1.forEach((r) => {
            if (pushedIds1.includes(r.submission_id)) r.pushed = true;
          });
        }
      );
    }

    // Push to Output 2 table
    let pushedOut2Count = 0;
    if (unpushedOut2.length > 0) {
      for (const row of unpushedOut2) {
        const { created_at, updated_at, pushed, ...cleanRow } = row;
        const keys = Object.keys(cleanRow);
        const placeholders = keys.map(() => '?').join(', ');
        const updateClause = keys.map((k) => `\`${k}\` = VALUES(\`${k}\`)`).join(', ');

        const sql = `INSERT INTO \`${outputTable2}\` (\`${keys.join('`, `')}\`) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updateClause}`;
        await clientConn.query(sql, Object.values(cleanRow));
        pushedOut2Count++;
      }

      // Mark local rows as pushed
      const pushedIds2 = unpushedOut2.map((r) => r.submission_id);
      await withDbFallback(
        async () => {
          await db(outputTable2).whereIn('submission_id', pushedIds2).update({
            pushed: true,
            updated_at: db.fn.now(),
          });
        },
        () => {
          const store2 = (mockStore.data && mockStore.data[outputTable2]) || [];
          store2.forEach((r) => {
            if (pushedIds2.includes(r.submission_id)) r.pushed = true;
          });
        }
      );
    }

    await clientConn.end();

    const durationMs = Date.now() - startTime;
    logger.info(
      `Client DB PUSH finished. Pushed Out1: ${pushedOut1Count}, Pushed Out2: ${pushedOut2Count}, Duration: ${durationMs}ms`
    );

    return {
      success: true,
      pushedOutput1: pushedOut1Count,
      pushedOutput2: pushedOut2Count,
      durationMs,
      message: `Successfully pushed ${pushedOut1Count} Output-1 and ${pushedOut2Count} Output-2 records to client DB.`,
    };
  } catch (err) {
    if (clientConn) {
      try {
        await clientConn.end();
      } catch (_) {}
    }
    logger.error(`Error pushing client data: ${err.message}`);
    return {
      success: false,
      error: err.message,
      pushedOutput1: 0,
      pushedOutput2: 0,
      durationMs: Date.now() - startTime,
      message: `Client DB push error: ${err.message}`,
    };
  }
}

/**
 * Gets live statistics for the client triplet tables (row counts, pending audits, unpushed records).
 * @param {string} inputTableName
 * @returns {Promise<object>}
 */
async function getTableStats(inputTableName = 'as_audit_input_ac_r3_sup', options = {}) {
  const { inputTable, outputTable1, outputTable2 } = deriveTripletTableNames(inputTableName, options.output1Table, options.output2Table);

  let localInputCount = 0;
  let localPendingAuditCount = 0;
  let localOutput1Count = 0;
  let localOutput2Count = 0;
  let unpushedCount = 0;

  await withDbFallback(
    async () => {
      if (await db.schema.hasTable(inputTable)) {
        const row = await db(inputTable).count('* as total').first();
        localInputCount = parseInt(row?.total || 0, 10);

        const pendingRow = await db(inputTable).where('sync_status', 'PENDING').count('* as total').first();
        localPendingAuditCount = parseInt(pendingRow?.total || 0, 10);
      }
      if (await db.schema.hasTable(outputTable1)) {
        const row = await db(outputTable1).count('* as total').first();
        localOutput1Count = parseInt(row?.total || 0, 10);

        const unpushedRow = await db(outputTable1).where('pushed', false).count('* as total').first();
        unpushedCount = parseInt(unpushedRow?.total || 0, 10);
      }
      if (await db.schema.hasTable(outputTable2)) {
        const row = await db(outputTable2).count('* as total').first();
        localOutput2Count = parseInt(row?.total || 0, 10);
      }
    },
    () => {
      const inStore = (mockStore.data && mockStore.data[inputTable]) || [];
      const out1Store = (mockStore.data && mockStore.data[outputTable1]) || [];
      const out2Store = (mockStore.data && mockStore.data[outputTable2]) || [];

      localInputCount = inStore.length;
      localPendingAuditCount = inStore.filter((r) => r.sync_status === 'PENDING').length;
      localOutput1Count = out1Store.length;
      unpushedCount = out1Store.filter((r) => !r.pushed).length;
      localOutput2Count = out2Store.length;
    }
  );

  return {
    inputTable,
    outputTable1,
    outputTable2,
    local: {
      inputCount: localInputCount,
      pendingAuditCount: localPendingAuditCount,
      output1Count: localOutput1Count,
      output2Count: localOutput2Count,
      unpushedCount,
    },
    clientDbConfig: {
      host: DEFAULT_CLIENT_DB_CONFIG.host,
      database: DEFAULT_CLIENT_DB_CONFIG.database,
      user: DEFAULT_CLIENT_DB_CONFIG.user,
    },
  };
}

module.exports = {
  getClientDbConnection,
  pullClientData,
  pushClientData,
  getTableStats,
  DEFAULT_CLIENT_DB_CONFIG,
};
