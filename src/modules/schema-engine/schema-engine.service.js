/**
 * Schema Engine Service
 * Handles schema template management, SQL DDL parsing, client DB table introspection,
 * and dynamic PostgreSQL table creation.
 */

const { db, withDbFallback } = require('../../database/connection');
const { PREDEFINED_TEMPLATES } = require('./schemaTemplates');
const { TVC_INPUT_COLUMNS, TVC_OUTPUT_COLUMNS } = require('../super-audit/superAuditTables.service');
const { parseSqlCreateTable, generatePostgresDdl, mapType } = require('./sqlParser');
const mysql = require('mysql2/promise');
const logger = require('../../utils/logger');

// Client DB Connection Config
const CLIENT_DB_CONFIG = {
  host: process.env.CLIENT_MYSQL_HOST || '127.0.0.1',
  user: process.env.CLIENT_MYSQL_USER || 'root',
  password: process.env.CLIENT_MYSQL_PASSWORD || '',
  database: process.env.CLIENT_MYSQL_DATABASE || 'client_crm',
  connectTimeout: 10000,
};

const SAFE_IDENTIFIER_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/;

const assertSafeIdentifier = (identifier, type = 'identifier') => {
  if (!identifier || typeof identifier !== 'string' || !SAFE_IDENTIFIER_REGEX.test(identifier)) {
    throw new Error(`Security validation failed: Invalid SQL ${type} name '${identifier}'. Must contain only alphanumeric characters and underscores.`);
  }
};

// In-memory / DB fallback store for custom user templates
let customTemplatesStore = [];

class SchemaEngineService {
  /**
   * List all templates (predefined + custom)
   */
  async listTemplates(organizationId) {
    return withDbFallback(
      async () => {
        const hasTable = await db.schema.hasTable('schema_templates');
        if (!hasTable) {
          await db.schema.createTable('schema_templates', (t) => {
            t.string('id', 64).primary();
            t.string('name', 255).notNullable();
            t.string('category', 64).nullable();
            t.string('state', 64).nullable();
            t.text('description').nullable();
            t.string('input_table_name', 128).notNullable();
            t.string('output1_table_name', 128).nullable();
            t.string('output2_table_name', 128).nullable();
            t.jsonb('input_columns').nullable();
            t.jsonb('output1_columns').nullable();
            t.jsonb('output2_columns').nullable();
            t.uuid('organization_id').nullable();
            t.timestamps(true, true);
          });
        }

        const query = db('schema_templates');
        if (organizationId) {
          query.where(function () {
            this.where('organization_id', organizationId).orWhereNull('organization_id');
          });
        }
        const dbList = await query.orderBy('created_at', 'desc');

        const formattedDb = dbList.map((row) => ({
          id: row.id,
          name: row.name,
          category: row.category || 'Custom Schema',
          state: row.state || 'Custom',
          description: row.description,
          inputTableName: row.input_table_name,
          output1TableName: row.output1_table_name,
          output2TableName: row.output2_table_name,
          inputColumns: typeof row.input_columns === 'string' ? JSON.parse(row.input_columns) : row.input_columns,
          output1Columns: typeof row.output1_columns === 'string' ? JSON.parse(row.output1_columns) : row.output1_columns,
          output2Columns: typeof row.output2_columns === 'string' ? JSON.parse(row.output2_columns) : row.output2_columns,
          isCustom: true,
        }));

        return [...PREDEFINED_TEMPLATES, ...formattedDb];
      },
      async () => {
        return [...PREDEFINED_TEMPLATES, ...customTemplatesStore];
      }
    );
  }

  /**
   * Save a new custom schema template
   */
  async saveTemplate(templateData, organizationId) {
    const id = templateData.id || `tpl_${Date.now()}`;
    const payload = {
      id,
      name: templateData.name || 'Untitled Custom Schema',
      category: templateData.category || 'Custom Schema',
      state: templateData.state || 'General',
      description: templateData.description || '',
      input_table_name: (templateData.inputTableName || 'custom_input').trim(),
      output1_table_name: (templateData.output1TableName || 'custom_output_1').trim(),
      output2_table_name: (templateData.output2TableName || 'custom_output_2').trim(),
      input_columns: JSON.stringify(templateData.inputColumns || []),
      output1_columns: JSON.stringify(templateData.output1Columns || []),
      output2_columns: JSON.stringify(templateData.output2Columns || []),
      organization_id: organizationId || null,
      created_at: new Date(),
      updated_at: new Date(),
    };

    return withDbFallback(
      async () => {
        const hasTable = await db.schema.hasTable('schema_templates');
        if (!hasTable) {
          await this.listTemplates(organizationId); // creates table
        }
        await db('schema_templates').insert(payload).onConflict('id').merge();
        return { success: true, id, message: 'Schema template saved to database successfully' };
      },
      async () => {
        const existingIdx = customTemplatesStore.findIndex((t) => t.id === id);
        const item = {
          id,
          name: payload.name,
          category: payload.category,
          state: payload.state,
          description: payload.description,
          inputTableName: payload.input_table_name,
          output1TableName: payload.output1_table_name,
          output2TableName: payload.output2_table_name,
          inputColumns: templateData.inputColumns || [],
          output1Columns: templateData.output1Columns || [],
          output2Columns: templateData.output2Columns || [],
          isCustom: true,
        };
        if (existingIdx >= 0) {
          customTemplatesStore[existingIdx] = item;
        } else {
          customTemplatesStore.unshift(item);
        }
        return { success: true, id, message: 'Schema template saved in memory' };
      }
    );
  }

  /**
   * Parse raw SQL CREATE TABLE into column definition list
   */
  parseSql(sqlString) {
    return parseSqlCreateTable(sqlString);
  }

  /**
   * Introspect a table live from the client MySQL database
   */
  async introspectClientTable(tableName) {
    if (!tableName || typeof tableName !== 'string') {
      throw new Error('Table name is required for introspection');
    }

    const cleanTable = tableName.trim();
    let conn;
    try {
      conn = await mysql.createConnection(CLIENT_DB_CONFIG);
      const [desc] = await conn.query('DESCRIBE `' + cleanTable + '`');
      const [createRes] = await conn.query('SHOW CREATE TABLE `' + cleanTable + '`');

      const rawCreateSql = createRes[0]['Create Table'];

      const columns = desc.map((c) => ({
        name: c.Field,
        rawType: c.Type,
        pgType: mapType(c.Type),
        nullable: c.Null === 'YES',
        isPrimary: c.Key === 'PRI' || c.Field.toLowerCase() === 'submission_id',
      }));

      const primaryKey = columns.find((c) => c.isPrimary)?.name || 'submission_id';

      return {
        tableName: cleanTable,
        columns,
        primaryKey,
        rawCreateSql,
        postgresDdl: generatePostgresDdl(cleanTable, columns, primaryKey),
        totalColumns: columns.length,
      };
    } catch (err) {
      logger.error(`Client DB Introspection failed for table ${cleanTable}:`, err.message);
      throw new Error(`Failed to introspect client table "${cleanTable}": ${err.message}`);
    } finally {
      if (conn) await conn.end().catch(() => {});
    }
  }

  /**
   * Dynamically creates or updates PostgreSQL tables based on schema columns
   */
  async createTablesFromSchema({ inputTable, outputTable1, outputTable2 }) {
    const results = [];

    const tablesToCreate = [
      inputTable && (inputTable.name || inputTable.tableName) ? { ...inputTable, role: 'INPUT' } : null,
      outputTable1 && (outputTable1.name || outputTable1.tableName) ? { ...outputTable1, role: 'OUTPUT_1' } : null,
      outputTable2 && (outputTable2.name || outputTable2.tableName) ? { ...outputTable2, role: 'OUTPUT_2' } : null,
    ].filter(Boolean);

    for (const item of tablesToCreate) {
      const name = (item.name || item.tableName || '').trim();
      if (!name) continue;
      assertSafeIdentifier(name, 'table');

      let columns = Array.isArray(item.columns) && item.columns.length > 0 ? item.columns : null;

      // Dynamic default fallback for TVC tables if no custom columns were supplied
      if (!columns && name.toLowerCase().includes('tvc')) {
        if (item.role === 'INPUT') {
          columns = TVC_INPUT_COLUMNS;
        } else if (item.role === 'OUTPUT_1') {
          columns = TVC_OUTPUT_COLUMNS;
        }
      }

      if (!columns) {
        // Fallback default columns
        const ddl = `
          CREATE TABLE IF NOT EXISTS "${name}" (
            "submission_id" VARCHAR(255) NOT NULL,
            "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "${name}_pkey" PRIMARY KEY ("submission_id")
          );
        `;
        await db.raw(ddl);
        results.push({ tableName: name, role: item.role, status: 'CREATED_DEFAULT' });
        continue;
      }

      const pkCol = columns.find((c) => c.isPrimary)?.name || 'submission_id';
      assertSafeIdentifier(pkCol, 'primary key');

      const colDefs = columns.map((c) => {
        assertSafeIdentifier(c.name, 'column');
        const colName = `"${c.name}"`;
        const pgType = c.pgType || mapType(c.rawType || c.type || 'text');
        const nullability = c.name === pkCol || c.isPrimary || !c.nullable ? 'NOT NULL' : '';
        return `${colName} ${pgType} ${nullability}`.trim();
      });

      // Check if table exists
      const exists = await db.schema.hasTable(name);
      if (!exists) {
        const createSql = `
          CREATE TABLE "${name}" (
            ${colDefs.join(',\n            ')},
            CONSTRAINT "${name}_pkey" PRIMARY KEY ("${pkCol}")
          );
        `;
        logger.info(`Creating dynamic table "${name}" with ${columns.length} columns`);
        await db.raw(createSql);
        results.push({ tableName: name, role: item.role, status: 'CREATED', columnsCount: columns.length });
      } else {
        // Table exists: verify and add any missing columns dynamically!
        for (const col of columns) {
          assertSafeIdentifier(col.name, 'column');
          const hasCol = await db.schema.hasColumn(name, col.name);
          if (!hasCol) {
            const pgType = col.pgType || mapType(col.rawType || col.type || 'text');
            logger.info(`Adding missing column "${col.name}" (${pgType}) to table "${name}"`);
            await db.raw(`ALTER TABLE "${name}" ADD COLUMN IF NOT EXISTS "${col.name}" ${pgType};`);
          }
        }
        results.push({ tableName: name, role: item.role, status: 'UPDATED_EXISTS', columnsCount: columns.length });
      }
    }

    return {
      success: true,
      tables: results,
      message: `Successfully provisioned ${results.length} dynamic database tables`,
    };
  }
}

module.exports = new SchemaEngineService();
