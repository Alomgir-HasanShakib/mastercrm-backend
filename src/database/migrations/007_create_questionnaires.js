/**
 * @file 007_create_questionnaires.js
 * @description Knex migration to create questionnaire_versions, sections, questions, question_options, translations, tag_definitions, and tag_mappings tables.
 */

/**
 * Run migrations.
 *
 * @param {import('knex').Knex} knex
 * @returns {Promise<void>}
 */
exports.up = async function (knex) {
  // 1. Questionnaire Versions table
  await knex.schema.createTable('questionnaire_versions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('project_id').notNullable().references('id').inTable('projects').onDelete('CASCADE');
    table.enu('module', ['CATI', 'CAPI', 'SUPER_AUDIT', 'TVC', 'FA', 'EXAM'], {
      useNative: true,
      enumName: 'questionnaire_module_enum',
    }).notNullable();
    table.string('name', 255).notNullable();
    table.integer('version_number').notNullable().defaultTo(1);
    table.enu('status', ['DRAFT', 'PUBLISHED', 'RETIRED'], {
      useNative: true,
      enumName: 'questionnaire_status_enum',
    }).notNullable().defaultTo('DRAFT');
    table.timestamp('published_at', { useTz: true }).nullable();
    table.uuid('published_by').nullable().references('id').inTable('users').onDelete('SET NULL');
    table.string('checksum', 128).nullable();
    table.uuid('created_by').nullable().references('id').inTable('users').onDelete('SET NULL');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.unique(['project_id', 'module', 'version_number']);
    table.index(['project_id']);
    table.index(['module']);
    table.index(['status']);
  });

  // 2. Sections table
  await knex.schema.createTable('sections', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('questionnaire_version_id').notNullable().references('id').inTable('questionnaire_versions').onDelete('CASCADE');
    table.string('code', 50).notNullable();
    table.string('title', 255).notNullable();
    table.integer('display_order').notNullable().defaultTo(0);
    table.uuid('visibility_rule_id').nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.unique(['questionnaire_version_id', 'code']);
    table.index(['questionnaire_version_id']);
    table.index(['display_order']);
  });

  // 3. Questions table
  await knex.schema.createTable('questions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('section_id').nullable().references('id').inTable('sections').onDelete('CASCADE');
    table.uuid('questionnaire_version_id').notNullable().references('id').inTable('questionnaire_versions').onDelete('CASCADE');
    table.string('question_no', 50).notNullable();
    table.string('question_tag', 100).notNullable();
    table.enu('question_type', [
      'SINGLE_SELECT',
      'MULTI_SELECT',
      'TEXT',
      'TEXTAREA',
      'NUMBER',
      'DATE',
      'DROPDOWN',
      'SEARCHABLE_SELECT',
      'RATING',
      'CONSENT',
      'INFO_BLOCK',
      'HIDDEN',
    ], {
      useNative: true,
      enumName: 'question_type_enum',
    }).notNullable();
    table.text('question_text').notNullable();
    table.text('help_text').nullable();
    table.boolean('is_required').notNullable().defaultTo(false);
    table.integer('display_order').notNullable().defaultTo(0);
    table.string('input_tag', 100).nullable();
    table.string('output_tag', 100).nullable();
    table.string('validation_tag', 100).nullable();
    table.string('actual_tag', 100).nullable();
    table.enu('option_source', ['STATIC', 'LOOKUP', 'DB', 'API', 'GEOGRAPHY'], {
      useNative: true,
      enumName: 'option_source_enum',
    }).notNullable().defaultTo('STATIC');
    table.string('evidence_policy', 100).nullable();
    table.jsonb('validation_rules').defaultTo('{}');
    table.jsonb('metadata').defaultTo('{}');
    table.boolean('is_enabled').notNullable().defaultTo(true);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.unique(['questionnaire_version_id', 'question_tag']);
    table.index(['questionnaire_version_id']);
    table.index(['section_id']);
    table.index(['question_tag']);
  });

  // 4. Question Options table
  await knex.schema.createTable('question_options', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('question_id').notNullable().references('id').inTable('questions').onDelete('CASCADE');
    table.string('option_code', 100).notNullable();
    table.string('label', 255).notNullable();
    table.string('value', 255).notNullable();
    table.integer('display_order').notNullable().defaultTo(0);
    table.jsonb('metadata').defaultTo('{}');
    table.boolean('is_active').notNullable().defaultTo(true);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.unique(['question_id', 'option_code']);
    table.index(['question_id']);
    table.index(['display_order']);
  });

  // 5. Translations table
  await knex.schema.createTable('translations', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('entity_type', 100).notNullable();
    table.uuid('entity_id').notNullable();
    table.string('language_code', 20).notNullable();
    table.string('field_name', 100).notNullable();
    table.text('localized_text').notNullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.unique(['entity_type', 'entity_id', 'language_code', 'field_name']);
    table.index(['entity_type', 'entity_id']);
    table.index(['language_code']);
  });

  // 6. Tag Definitions table
  await knex.schema.createTable('tag_definitions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('tag_key', 100).notNullable().unique();
    table.string('data_type', 50).notNullable().defaultTo('string');
    table.string('module', 50).nullable();
    table.string('scope', 50).nullable();
    table.text('description').nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(['tag_key']);
    table.index(['module']);
  });

  // 7. Tag Mappings table
  await knex.schema.createTable('tag_mappings', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('tag_definition_id').notNullable().references('id').inTable('tag_definitions').onDelete('CASCADE');
    table.uuid('project_id').notNullable().references('id').inTable('projects').onDelete('CASCADE');
    table.string('module', 50).nullable();
    table.uuid('questionnaire_version_id').nullable().references('id').inTable('questionnaire_versions').onDelete('SET NULL');
    table.string('input_source', 100).nullable();
    table.string('input_path', 255).nullable();
    table.string('output_destination', 100).nullable();
    table.string('output_path', 255).nullable();
    table.string('transform', 100).nullable();
    table.boolean('is_active').notNullable().defaultTo(true);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(['tag_definition_id']);
    table.index(['project_id']);
    table.index(['questionnaire_version_id']);
  });
};

/**
 * Rollback migrations.
 *
 * @param {import('knex').Knex} knex
 * @returns {Promise<void>}
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('tag_mappings');
  await knex.schema.dropTableIfExists('tag_definitions');
  await knex.schema.dropTableIfExists('translations');
  await knex.schema.dropTableIfExists('question_options');
  await knex.schema.dropTableIfExists('questions');
  await knex.schema.dropTableIfExists('sections');
  await knex.schema.dropTableIfExists('questionnaire_versions');
  await knex.raw('DROP TYPE IF EXISTS option_source_enum CASCADE;');
  await knex.raw('DROP TYPE IF EXISTS question_type_enum CASCADE;');
  await knex.raw('DROP TYPE IF EXISTS questionnaire_status_enum CASCADE;');
  await knex.raw('DROP TYPE IF EXISTS questionnaire_module_enum CASCADE;');
};
