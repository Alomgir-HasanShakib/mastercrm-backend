/**
 * @file 20261026160000_add_external_id_to_campaign_leads.js
 * @description Add external_id column to campaign_leads table for deduplication and external client DB tracking.
 */

exports.up = async function (knex) {
  const hasCol = await knex.schema.hasColumn('campaign_leads', 'external_id');
  if (!hasCol) {
    await knex.schema.alterTable('campaign_leads', (table) => {
      table.string('external_id', 150).nullable().index();
    });
  }
};

exports.down = async function (knex) {
  const hasCol = await knex.schema.hasColumn('campaign_leads', 'external_id');
  if (hasCol) {
    await knex.schema.alterTable('campaign_leads', (table) => {
      table.dropColumn('external_id');
    });
  }
};
