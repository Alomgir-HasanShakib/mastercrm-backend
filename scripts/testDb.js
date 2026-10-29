/**
 * @file testDb.js
 * @description Diagnostic script to test connectivity to both Primary CRM Database (PostgreSQL)
 * and Client Data Warehouse (External MySQL/Postgres e_solutions).
 */

require('dotenv').config();
const { checkDatabaseHealth, closeDatabase } = require('../src/database');
const { checkClientDbHealth, closeClientDbPool } = require('../src/database/clientDb');

async function runDiagnostics() {
  console.log('====================================================');
  console.log(' Master CRM Database Connectivity Diagnostics');
  console.log('====================================================\n');

  console.log('1. Checking Primary CRM Database (PostgreSQL)...');
  const pgResult = await checkDatabaseHealth();
  if (pgResult.status === 'healthy') {
    console.log(`   [PASS] Primary PostgreSQL connected successfully (${pgResult.latencyMs}ms)`);
  } else {
    console.log(`   [FAIL] Primary PostgreSQL connection failed (${pgResult.latencyMs}ms): ${pgResult.error}`);
  }

  console.log('\n2. Checking Client Data Warehouse (External DB)...');
  const clientResult = await checkClientDbHealth();
  if (clientResult.status === 'healthy') {
    console.log(`   [PASS] Client DB connected successfully (${clientResult.latencyMs}ms)`);
  } else {
    console.log(`   [WARN/FAIL] Client DB connection unreachable (${clientResult.latencyMs}ms): ${clientResult.error}`);
  }

  console.log('\n----------------------------------------------------');
  await closeDatabase();
  await closeClientDbPool();
  console.log('Diagnostics completed. Exiting.');
}

runDiagnostics().catch((err) => {
  console.error('Fatal error during test:', err);
  process.exit(1);
});
