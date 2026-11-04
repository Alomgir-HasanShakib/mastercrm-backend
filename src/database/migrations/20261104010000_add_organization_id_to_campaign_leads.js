/**
 * @file 20261104010000_add_organization_id_to_campaign_leads.js
 * @description Add organization_id column and indices to campaign_leads table
 * for Super Admin to distribute CAPI/CATI data to specific organizations,
 * allowing organization agents to survey strictly their distributed leads.
 */

exports.up = async function (knex) {
  const hasCampaignLeads = await knex.schema.hasTable('campaign_leads');
  if (hasCampaignLeads) {
    const hasOrgId = await knex.schema.hasColumn('campaign_leads', 'organization_id');
    if (!hasOrgId) {
      await knex.schema.alterTable('campaign_leads', (table) => {
        table.uuid('organization_id').nullable().references('id').inTable('organizations').onDelete('CASCADE');
        table.index(['organization_id']);
        table.index(['organization_id', 'status']);
      });
      console.log('[Migration 20261104010000] Added organization_id column to campaign_leads table.');
    }

    // Backfill organization_id from projects table where available
    try {
      await knex.raw(`
        UPDATE campaign_leads cl
        SET organization_id = p.organization_id
        FROM projects p
        WHERE cl.project_id = p.id
        AND cl.organization_id IS NULL
        AND p.organization_id IS NOT NULL;
      `);
      console.log('[Migration 20261104010000] Backfilled campaign_leads organization_id from projects table.');
    } catch (bfErr) {
      console.warn('[Migration 20261104010000] Backfill notice:', bfErr.message);
    }
  }
};

exports.down = async function (knex) {
  const hasCampaignLeads = await knex.schema.hasTable('campaign_leads');
  if (hasCampaignLeads) {
    const hasOrgId = await knex.schema.hasColumn('campaign_leads', 'organization_id');
    if (hasOrgId) {
      await knex.schema.alterTable('campaign_leads', (table) => {
        table.dropColumn('organization_id');
      });
    }
  }
};
