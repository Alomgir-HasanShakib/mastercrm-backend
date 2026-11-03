/**
 * @file 20261101160000_add_project_code_to_campaign_leads_and_vendor_mapping.js
 * @description Knex migration to:
 * 1. Add project_code column to campaign_leads if not present
 * 2. Create campaign_project_code_assignments table to map project_code to vendors for lead distribution
 */

exports.up = async function (knex) {
  // 1. Add project_code column to campaign_leads
  const hasCampaignLeads = await knex.schema.hasTable('campaign_leads');
  if (hasCampaignLeads) {
    const hasProjectCode = await knex.schema.hasColumn('campaign_leads', 'project_code');
    if (!hasProjectCode) {
      await knex.schema.alterTable('campaign_leads', (table) => {
        table.string('project_code', 100).nullable().index();
      });
    }
  }

  // 2. Create campaign_project_code_assignments table
  const hasAssignmentsTable = await knex.schema.hasTable('campaign_project_code_assignments');
  if (!hasAssignmentsTable) {
    await knex.schema.createTable('campaign_project_code_assignments', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
      table.uuid('project_id').notNullable().references('id').inTable('projects').onDelete('CASCADE');
      table.string('project_code', 100).notNullable();
      table.uuid('vendor_id').notNullable().references('id').inTable('vendors').onDelete('CASCADE');
      table.uuid('assigned_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('assigned_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

      table.unique(['project_id', 'project_code']);
      table.index(['project_id']);
      table.index(['vendor_id']);
      table.index(['project_code']);
      table.index(['project_id', 'vendor_id']);
    });
  }
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('campaign_project_code_assignments');

  const hasCampaignLeads = await knex.schema.hasTable('campaign_leads');
  if (hasCampaignLeads) {
    const hasProjectCode = await knex.schema.hasColumn('campaign_leads', 'project_code');
    if (hasProjectCode) {
      await knex.schema.alterTable('campaign_leads', (table) => {
        table.dropColumn('project_code');
      });
    }
  }
};
