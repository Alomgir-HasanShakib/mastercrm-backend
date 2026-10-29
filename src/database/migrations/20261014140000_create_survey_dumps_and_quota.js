/**
 * @file 20261014140000_create_survey_dumps_and_quota.js
 * @description Knex migration to:
 * 1. Add max_users and enable_ai_audit to organizations table.
 * 2. Add enable_ai_audit to vendors table.
 * 3. Create raw_survey_dumps table for 47-column political survey ingestion and lead distribution.
 */

exports.up = async function (knex) {
  // 1. Alter organizations table
  const hasOrgMaxUsers = await knex.schema.hasColumn('organizations', 'max_users');
  if (!hasOrgMaxUsers) {
    await knex.schema.alterTable('organizations', (table) => {
      table.integer('max_users').defaultTo(50);
      table.boolean('enable_ai_audit').defaultTo(true);
    });
  }

  // 2. Alter vendors table
  const hasVendorAi = await knex.schema.hasColumn('vendors', 'enable_ai_audit');
  if (!hasVendorAi) {
    await knex.schema.alterTable('vendors', (table) => {
      table.boolean('enable_ai_audit').defaultTo(true);
    });
  }

  // 3. Create raw_survey_dumps table
  const hasDumpTable = await knex.schema.hasTable('raw_survey_dumps');
  if (!hasDumpTable) {
    await knex.schema.createTable('raw_survey_dumps', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
      table.string('submission_id', 100).notNullable().index();
      table.uuid('organization_id').nullable().references('id').inTable('organizations').onDelete('SET NULL');
      table.uuid('vendor_id').nullable().references('id').inTable('vendors').onDelete('SET NULL');
      table.uuid('project_id').nullable().references('id').inTable('projects').onDelete('SET NULL');

      table.text('audio_link').nullable();
      table.integer('ac_num').nullable();
      table.string('fa', 100).nullable();
      table.string('collector_emailid', 255).nullable();
      table.string('tl_id', 100).nullable();
      table.decimal('duration', 8, 2).nullable();
      table.string('submission_date', 50).nullable();
      table.string('dumping_date', 50).nullable();
      table.string('batch_slot', 100).nullable();
      table.string('religion', 100).nullable();
      table.string('introduction', 100).nullable();
      table.string('ac_name', 255).nullable();
      table.string('full_name', 255).nullable();
      table.string('gender', 50).nullable();
      table.string('phone_no', 50).nullable().index();
      table.string('age', 50).nullable();
      table.string('caste', 100).nullable();
      table.text('major_problems').nullable();
      table.text('party_led_development_state').nullable();
      table.string('state_govt_change', 100).nullable();
      table.string('winner_perception_state', 100).nullable();
      table.text('mla_choice').nullable();
      table.text('vi_mla_choice_followup_for_koibhi').nullable();
      table.string('voting_intention_vs_party', 100).nullable();
      table.text('vi_mla_choice_swap_new').nullable();
      table.text('vi_mla_choice_swap_3').nullable();
      table.string('vs_past_party', 100).nullable();
      table.string('ls_past_party', 100).nullable();
      table.string('mla_awareness', 50).nullable();
      table.string('mla_satisfaction', 100).nullable();
      table.string('state_govt_satisfaction', 100).nullable();
      table.string('cm_satisfaction', 100).nullable();
      table.string('central_govt_satisfaction', 100).nullable();
      table.string('pm_satisfaction', 100).nullable();
      table.string('cm_choice', 255).nullable();
      table.string('voting_intention_ls_party', 100).nullable();
      table.text('vs_past_candidate').nullable();
      table.text('nda_vote_reason').nullable();
      table.text('mgb_vote_reason').nullable();
      table.text('other_vote_reason').nullable();
      table.text('situation_followup').nullable();
      table.text('ls_past_candidate').nullable();
      table.string('ls_past_voted_confirmation', 100).nullable();
      table.string('vs_past_voted_confirmation', 100).nullable();
      table.string('assignment_time', 100).nullable();
      table.string('agent_id', 255).nullable();

      table.string('status', 50).defaultTo('PROCESSED');
      table.timestamp('distributed_at', { useTz: true }).nullable();
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });
  }
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('raw_survey_dumps');
};
