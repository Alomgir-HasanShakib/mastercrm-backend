/**
 * SQL DDL Parser
 * Parses CREATE TABLE statements (MySQL and PostgreSQL flavors) into structured schema objects.
 */

function mapType(rawType) {
  if (!rawType) return 'TEXT';
  const t = rawType.toLowerCase().trim();
  if (t.startsWith('varchar') || t.startsWith('character varying')) {
    const match = t.match(/\((\d+)\)/);
    return match ? `VARCHAR(${match[1]})` : 'VARCHAR(255)';
  }
  if (t === 'text' || t === 'mediumtext' || t === 'longtext' || t === 'clob') return 'TEXT';
  if (t === 'datetime' || t === 'timestamp' || t.startsWith('timestamp')) return 'TIMESTAMP';
  if (t === 'date') return 'DATE';
  if (t === 'time') return 'TIME';
  if (t === 'double' || t === 'float' || t === 'real' || t.startsWith('double precision')) return 'DOUBLE PRECISION';
  if (t.startsWith('tinyint(1)') || t === 'boolean' || t === 'bool') return 'BOOLEAN';
  if (t.startsWith('tinyint') || t.startsWith('smallint') || t === 'int2') return 'SMALLINT';
  if (t.startsWith('bigint') || t === 'int8') return 'BIGINT';
  if (t.startsWith('int') || t === 'integer' || t === 'int4') return 'INTEGER';
  if (t === 'json' || t === 'jsonb') return 'JSONB';
  return 'TEXT';
}

function parseSqlCreateTable(sql) {
  if (!sql || typeof sql !== 'string') {
    throw new Error('Empty or invalid SQL provided');
  }

  // Clean comments and extra whitespace
  const cleanSql = sql
    .replace(/--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .trim();

  // Extract table name
  const tableMatch = cleanSql.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:`|"|')?([a-zA-Z0-9_]+)(?:`|"|')?\s*\(/i);
  const tableName = tableMatch ? tableMatch[1] : 'custom_table';

  // Extract column definition block between outer parentheses
  const startIdx = cleanSql.indexOf('(');
  const endIdx = cleanSql.lastIndexOf(')');
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    throw new Error('Could not find column definitions inside parentheses');
  }

  const inner = cleanSql.slice(startIdx + 1, endIdx);

  // Split lines by comma, but respect commas inside parentheses like varchar(255) or enum('a','b')
  const rawLines = [];
  let current = '';
  let depth = 0;
  for (let i = 0; i < inner.length; i++) {
    const char = inner[i];
    if (char === '(') depth++;
    else if (char === ')') depth--;
    if (char === ',' && depth === 0) {
      if (current.trim()) rawLines.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) rawLines.push(current.trim());

  let primaryKeyCol = 'submission_id';
  const columns = [];

  for (const line of rawLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Check for table-level PRIMARY KEY (col)
    const pkMatch = trimmed.match(/PRIMARY\s+KEY\s*\((?:`|"|')?([a-zA-Z0-9_]+)(?:`|"|')?\)/i);
    if (pkMatch) {
      primaryKeyCol = pkMatch[1];
      continue;
    }

    // Check for KEY, INDEX, CONSTRAINT
    if (/^(KEY|INDEX|UNIQUE\s+KEY|CONSTRAINT|FOREIGN\s+KEY)/i.test(trimmed)) {
      continue;
    }

    // It's a column definition
    // Example: `submission_id` varchar(255) NOT NULL
    // or phone_no text DEFAULT NULL
    const colMatch = trimmed.match(/^(?:`|"|')?([a-zA-Z0-9_]+)(?:`|"|')?\s+([a-zA-Z0-9_]+(?:\s*\([^)]+\))?)(.*)$/i);
    if (colMatch) {
      const colName = colMatch[1];
      const rawType = colMatch[2];
      const rest = (colMatch[3] || '').toUpperCase();

      const isPk = rest.includes('PRIMARY KEY') || colName.toLowerCase() === 'submission_id';
      if (isPk) primaryKeyCol = colName;

      const nullable = !rest.includes('NOT NULL');
      const pgType = mapType(rawType);

      columns.push({
        name: colName,
        rawType,
        pgType,
        nullable,
        isPrimary: isPk,
      });
    }
  }

  // Ensure primary key is marked
  columns.forEach((c) => {
    if (c.name.toLowerCase() === primaryKeyCol.toLowerCase()) {
      c.isPrimary = true;
      c.nullable = false;
    }
  });

  return {
    tableName,
    primaryKey: primaryKeyCol,
    columns,
    sqlPostgres: generatePostgresDdl(tableName, columns, primaryKeyCol),
  };
}

function generatePostgresDdl(tableName, columns, primaryKey = 'submission_id') {
  const colLines = columns.map((c) => {
    const nullability = c.isPrimary || !c.nullable ? 'NOT NULL' : '';
    return `"${c.name}" ${c.pgType} ${nullability}`.trim();
  });

  return `CREATE TABLE IF NOT EXISTS "${tableName}" (\n  ${colLines.join(',\n  ')},\n  CONSTRAINT "${tableName}_pkey" PRIMARY KEY ("${primaryKey}")\n);`;
}

module.exports = {
  mapType,
  parseSqlCreateTable,
  generatePostgresDdl,
};
