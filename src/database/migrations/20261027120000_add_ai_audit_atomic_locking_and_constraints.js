/**
 * @file 20261027120000_add_ai_audit_atomic_locking_and_constraints.js
 * @description Knex migration to add atomic locking columns (locked_by_auditor, locked_at, audit_status)
 * to campaign_leads and unique constraint on capi_audits for AI auditor concurrency deduplication.
 */

exports.up = async function (knex) {
  // 1. Add atomic locking and audit status columns to campaign_leads
  const hasCampaignLeads = await knex.schema.hasTable('campaign_leads');
  if (hasCampaignLeads) {
    const hasLockedByAuditor = await knex.schema.hasColumn('campaign_leads', 'locked_by_auditor');
    const hasLockedAt = await knex.schema.hasColumn('campaign_leads', 'locked_at');
    const hasAuditStatus = await knex.schema.hasColumn('campaign_leads', 'audit_status');

    await knex.schema.alterTable('campaign_leads', (table) => {
      if (!hasLockedByAuditor) {
        table.string('locked_by_auditor', 100).nullable().index();
      }
      if (!hasLockedAt) {
        table.timestamp('locked_at', { useTz: true }).nullable().index();
      }
      if (!hasAuditStatus) {
        table.string('audit_status', 50).nullable().defaultTo('PENDING').index();
      }
    });

    // Create composite index for queue picking performance
    await knex.raw(`
      CREATE INDEX IF NOT EXISTS idx_campaign_leads_ai_queue 
      ON campaign_leads (status, audit_status, surveyed_at) 
      WHERE surveyed_at IS NULL;
    `).catch(() => {});
  }

  // 2. Add unique constraint on capi_audits(submission_id) if table exists
  const hasCapiAudits = await knex.schema.hasTable('capi_audits');
  if (hasCapiAudits) {
    await knex.raw(`
      CREATE UNIQUE INDEX IF NOT EXISTS capi_audits_submission_id_unique 
      ON capi_audits (submission_id);
    `).catch(() => {});
  }
};

exports.down = async function (knex) {
  const hasCampaignLeads = await knex.schema.hasTable('campaign_leads');
  if (hasCampaignLeads) {
    await knex.raw(`DROP INDEX IF EXISTS idx_campaign_leads_ai_queue;`).catch(() => {});

    await knex.schema.alterTable('campaign_leads', (table) => {
      table.dropColumn('locked_by_auditor');
      table.dropColumn('locked_at');
      table.dropColumn('audit_status');
    }).catch(() => {});
  }

  await knex.raw(`DROP INDEX IF EXISTS capi_audits_submission_id_unique;`).catch(() => {});
};
