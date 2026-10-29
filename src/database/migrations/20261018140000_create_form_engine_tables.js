/**
 * @file 20261018140000_create_form_engine_tables.js
 * @description Knex migration creating tables for the Automated Excel-to-Form & Audit Engine:
 * - form_imports: Staged workbook uploads and detection metadata
 * - form_import_issues: Source coordinate-tracked issues (blocking, warning, decisions)
 * - lookup_datasets: Hierarchical lookup master (PC -> AC, district -> assembly, etc.)
 * - lookup_nodes: Multi-level lookup nodes with parent pointers
 * - canonical schema column in questionnaire_versions
 * - form_submissions & super_audit_cases enhancement
 */

exports.up = async function (knex) {
  // 1. form_imports
  const hasFormImports = await knex.schema.hasTable('form_imports');
  if (!hasFormImports) {
    await knex.schema.createTable('form_imports', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
      table.uuid('project_id').notNullable().references('id').inTable('projects').onDelete('CASCADE');
      table.uuid('uploaded_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.string('file_sha256', 64).notNullable();
      table.string('original_filename', 255).notNullable();
      table.string('storage_key', 500).nullable();
      table.string('import_profile', 50).notNullable().defaultTo('auto_detect');
      table.string('status', 50).notNullable().defaultTo('NEEDS_REVIEW'); // STAGED, NEEDS_REVIEW, READY_TO_PUBLISH, PUBLISHED, REJECTED
      table.jsonb('detected_sheets_jsonb').defaultTo('[]');
      table.jsonb('issue_summary_jsonb').defaultTo('{}');
      table.jsonb('staged_schema_jsonb').defaultTo('{}');
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

      table.index(['project_id', 'status']);
      table.index(['file_sha256']);
    });
  }

  // 2. form_import_issues
  const hasIssues = await knex.schema.hasTable('form_import_issues');
  if (!hasIssues) {
    await knex.schema.createTable('form_import_issues', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
      table.uuid('import_id').notNullable().references('id').inTable('form_imports').onDelete('CASCADE');
      table.string('severity', 50).notNullable(); // BLOCKING_ERROR, REQUIRES_DECISION, WARNING, INFO
      table.string('issue_code', 100).notNullable();
      table.string('sheet_name', 100).nullable();
      table.integer('source_row').nullable();
      table.string('source_column', 20).nullable();
      table.string('question_tag', 100).nullable();
      table.text('message').notNullable();
      table.jsonb('details_jsonb').defaultTo('{}');
      table.jsonb('resolution_jsonb').nullable();
      table.uuid('resolved_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

      table.index(['import_id', 'severity']);
    });
  }

  // 3. lookup_datasets
  const hasLookupDatasets = await knex.schema.hasTable('lookup_datasets');
  if (!hasLookupDatasets) {
    await knex.schema.createTable('lookup_datasets', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
      table.uuid('project_id').notNullable().references('id').inTable('projects').onDelete('CASCADE');
      table.string('dataset_code', 100).notNullable();
      table.string('name', 255).notNullable();
      table.integer('version_number').notNullable().defaultTo(1);
      table.boolean('is_active').notNullable().defaultTo(true);
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

      table.unique(['project_id', 'dataset_code']);
      table.index(['project_id']);
    });
  }

  // 4. lookup_nodes
  const hasLookupNodes = await knex.schema.hasTable('lookup_nodes');
  if (!hasLookupNodes) {
    await knex.schema.createTable('lookup_nodes', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
      table.uuid('dataset_id').notNullable().references('id').inTable('lookup_datasets').onDelete('CASCADE');
      table.string('node_code', 100).notNullable();
      table.string('node_label', 255).notNullable();
      table.string('parent_code', 100).nullable();
      table.string('level', 50).notNullable().defaultTo('default'); // e.g. 'pc', 'ac', 'district'
      table.integer('sort_order').notNullable().defaultTo(0);
      table.jsonb('metadata_jsonb').defaultTo('{}');
      table.boolean('is_active').notNullable().defaultTo(true);
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

      table.index(['dataset_id', 'parent_code']);
      table.index(['dataset_id', 'level']);
    });
  }

  // 5. Add canonical_schema_jsonb to questionnaire_versions if not exists
  const hasCol = await knex.schema.hasColumn('questionnaire_versions', 'canonical_schema_jsonb');
  if (!hasCol) {
    await knex.schema.alterTable('questionnaire_versions', (table) => {
      table.jsonb('canonical_schema_jsonb').nullable();
      table.uuid('source_import_id').nullable().references('id').inTable('form_imports').onDelete('SET NULL');
    });
  }
};

exports.down = async function (knex) {
  const hasCol = await knex.schema.hasColumn('questionnaire_versions', 'canonical_schema_jsonb');
  if (hasCol) {
    await knex.schema.alterTable('questionnaire_versions', (table) => {
      table.dropColumn('source_import_id');
      table.dropColumn('canonical_schema_jsonb');
    });
  }

  await knex.schema.dropTableIfExists('lookup_nodes');
  await knex.schema.dropTableIfExists('lookup_datasets');
  await knex.schema.dropTableIfExists('form_import_issues');
  await knex.schema.dropTableIfExists('form_imports');
};
