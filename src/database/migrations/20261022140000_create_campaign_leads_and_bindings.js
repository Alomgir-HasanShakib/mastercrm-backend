/**
 * @file 20261022140000_create_campaign_leads_and_bindings.js
 * @description Knex migration to create campaign_leads, campaign_questionnaires tables,
 * and support multi-vendor lead equal splitting and questionnaire bindings.
 */

exports.up = async function (knex) {
  // 1. Add questionnaire_id to projects if not present
  const hasQuestionnaireId = await knex.schema.hasColumn('projects', 'questionnaire_id');
  if (!hasQuestionnaireId) {
    await knex.schema.alterTable('projects', (table) => {
      table.uuid('questionnaire_id').nullable().index();
    });
  }

  // 2. Create campaign_leads table
  const hasCampaignLeads = await knex.schema.hasTable('campaign_leads');
  if (!hasCampaignLeads) {
    await knex.schema.createTable('campaign_leads', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
      table.uuid('project_id').notNullable().references('id').inTable('projects').onDelete('CASCADE');
      table.uuid('vendor_id').nullable().references('id').inTable('vendors').onDelete('SET NULL');
      table.uuid('assigned_agent_id').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.string('phone_number', 50).notNullable();
      table.string('respondent_name', 255).nullable();
      table.string('state', 100).nullable();
      table.string('constituency', 100).nullable();
      table.string('status', 50).notNullable().defaultTo('PENDING'); // PENDING, ASSIGNED, IN_PROGRESS, COMPLETED, CALLBACK, FAILED
      table.integer('priority').notNullable().defaultTo(50);
      table.integer('attempt_count').notNullable().defaultTo(0);
      table.jsonb('metadata').nullable().defaultTo('{}');
      table.timestamp('allocated_at', { useTz: true }).nullable();
      table.timestamp('surveyed_at', { useTz: true }).nullable();
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

      table.index(['project_id']);
      table.index(['vendor_id']);
      table.index(['status']);
      table.index(['assigned_agent_id']);
    });
  }

  // 3. Create campaign_questionnaires table (Many-to-Many binding: one questionnaire can be bound to multiple campaigns)
  const hasCampaignQuestionnaires = await knex.schema.hasTable('campaign_questionnaires');
  if (!hasCampaignQuestionnaires) {
    await knex.schema.createTable('campaign_questionnaires', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
      table.uuid('project_id').notNullable().references('id').inTable('projects').onDelete('CASCADE');
      table.uuid('questionnaire_id').notNullable().references('id').inTable('questionnaire_versions').onDelete('CASCADE');
      table.string('module', 50).notNullable().defaultTo('CATI');
      table.boolean('is_primary').notNullable().defaultTo(true);
      table.timestamp('bound_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

      table.unique(['project_id', 'questionnaire_id']);
      table.index(['project_id']);
      table.index(['questionnaire_id']);
    });
  }
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('campaign_questionnaires');
  await knex.schema.dropTableIfExists('campaign_leads');
  const hasQuestionnaireId = await knex.schema.hasColumn('projects', 'questionnaire_id');
  if (hasQuestionnaireId) {
    await knex.schema.alterTable('projects', (table) => {
      table.dropColumn('questionnaire_id');
    });
  }
};
