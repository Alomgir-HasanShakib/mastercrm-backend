/**
 * @file 20261017120000_create_subscriptions_and_client_db_sync.js
 * @description Knex migration creating subscriptions, invoices, pricing, and client DB sync configurations and logs.
 */

const addColumnIfNotExists = async (knex, tableName, columnName, columnCallback) => {
  const hasCol = await knex.schema.hasColumn(tableName, columnName);
  if (!hasCol) {
    await knex.schema.alterTable(tableName, (table) => {
      columnCallback(table);
    });
  }
};

/**
 * Run migrations.
 *
 * @param {import('knex').Knex} knex
 * @returns {Promise<void>}
 */
exports.up = async function (knex) {
  // 1. Ensure enable_ai_audit exists on organizations table
  await addColumnIfNotExists(knex, 'organizations', 'enable_ai_audit', (table) => {
    table.boolean('enable_ai_audit').defaultTo(false);
  });

  // 2. Subscription Pricing configuration table
  const hasPricingTable = await knex.schema.hasTable('subscription_pricing');
  if (!hasPricingTable) {
    await knex.schema.createTable('subscription_pricing', (table) => {
      table.string('id', 50).primary().defaultTo('default');
      table.decimal('base_price', 12, 2).notNullable().defaultTo(499.00);
      table.decimal('ai_audit_price', 12, 2).notNullable().defaultTo(199.00);
      table.string('currency', 10).notNullable().defaultTo('USD');
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });

    // Seed default pricing row
    await knex('subscription_pricing').insert({
      id: 'default',
      base_price: 499.00,
      ai_audit_price: 199.00,
      currency: 'USD',
      updated_at: new Date(),
    });
  }

  // 3. Subscriptions table
  const hasSubscriptions = await knex.schema.hasTable('subscriptions');
  if (!hasSubscriptions) {
    await knex.schema.createTable('subscriptions', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
      table.uuid('organization_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
      table.string('plan_name', 100).notNullable().defaultTo('ENTERPRISE');
      table.decimal('base_price', 12, 2).notNullable().defaultTo(499.00);
      table.decimal('ai_audit_price', 12, 2).notNullable().defaultTo(199.00);
      table.decimal('total_price', 12, 2).notNullable().defaultTo(698.00);
      table.string('currency', 10).notNullable().defaultTo('USD');
      table.boolean('has_ai_audit').notNullable().defaultTo(true);
      table.string('billing_cycle', 50).notNullable().defaultTo('MONTHLY');
      table.timestamp('start_date', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('end_date', { useTz: true }).notNullable();
      table.string('status', 50).notNullable().defaultTo('ACTIVE'); // 'ACTIVE', 'EXPIRED', 'PENDING', 'SUSPENDED'
      table.boolean('auto_renew').notNullable().defaultTo(true);
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

      table.index(['organization_id']);
      table.index(['status']);
      table.index(['end_date']);
    });
  }

  // 4. Subscription Invoices & Receipts table
  const hasInvoices = await knex.schema.hasTable('subscription_invoices');
  if (!hasInvoices) {
    await knex.schema.createTable('subscription_invoices', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
      table.uuid('subscription_id').nullable().references('id').inTable('subscriptions').onDelete('SET NULL');
      table.uuid('organization_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
      table.string('invoice_number', 100).notNullable().unique();
      table.string('receipt_number', 100).nullable().unique();
      table.decimal('base_amount', 12, 2).notNullable().defaultTo(0);
      table.decimal('ai_audit_amount', 12, 2).notNullable().defaultTo(0);
      table.decimal('tax_amount', 12, 2).notNullable().defaultTo(0);
      table.decimal('total_amount', 12, 2).notNullable().defaultTo(0);
      table.string('currency', 10).notNullable().defaultTo('USD');
      table.string('payment_status', 50).notNullable().defaultTo('PAID'); // 'PAID', 'PENDING'
      table.string('payment_method', 100).notNullable().defaultTo('CREDIT_CARD');
      table.timestamp('paid_at', { useTz: true }).nullable();
      table.jsonb('receipt_data').notNullable().defaultTo('{}');
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

      table.index(['subscription_id']);
      table.index(['organization_id']);
      table.index(['invoice_number']);
      table.index(['payment_status']);
    });
  }

  // 5. Client DB Sync Configs table
  const hasSyncConfigs = await knex.schema.hasTable('client_db_sync_configs');
  if (!hasSyncConfigs) {
    await knex.schema.createTable('client_db_sync_configs', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
      table.uuid('organization_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
      table.string('name', 255).notNullable();
      table.string('db_type', 50).notNullable().defaultTo('REST_API'); // 'POSTGRES', 'MYSQL', 'REST_API'
      table.text('connection_string').nullable();
      table.text('api_url').nullable();
      table.text('api_token').nullable();
      table.string('sync_interval', 50).notNullable().defaultTo('15_MIN'); // 'CONTINUOUS', '1_MIN', '5_MIN', '15_MIN', '1_HOUR'
      table.boolean('is_active').notNullable().defaultTo(true);
      table.string('status', 50).notNullable().defaultTo('IDLE'); // 'IDLE', 'SYNCING', 'ERROR', 'SUCCESS'
      table.timestamp('last_synced_at', { useTz: true }).nullable();
      table.integer('records_synced').notNullable().defaultTo(0);
      table.text('last_error').nullable();
      table.jsonb('mapping_config').notNullable().defaultTo('{}');
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

      table.index(['organization_id']);
      table.index(['is_active']);
      table.index(['status']);
    });
  }

  // 6. Client DB Sync Logs table
  const hasSyncLogs = await knex.schema.hasTable('client_db_sync_logs');
  if (!hasSyncLogs) {
    await knex.schema.createTable('client_db_sync_logs', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
      table.uuid('config_id').notNullable().references('id').inTable('client_db_sync_configs').onDelete('CASCADE');
      table.string('status', 50).notNullable(); // 'SUCCESS', 'ERROR', 'PARTIAL'
      table.integer('records_fetched').notNullable().defaultTo(0);
      table.integer('records_inserted').notNullable().defaultTo(0);
      table.integer('records_failed').notNullable().defaultTo(0);
      table.integer('duration_ms').notNullable().defaultTo(0);
      table.text('details').nullable();
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

      table.index(['config_id']);
      table.index(['status']);
      table.index(['created_at']);
    });
  }

  // 7. Seed active subscription and paid invoice for all existing organizations so system remains operable
  const orgs = await knex('organizations').select('id', 'name', 'slug');
  for (const org of orgs) {
    const existingSub = await knex('subscriptions').where('organization_id', org.id).first();
    if (!existingSub) {
      const now = new Date();
      const oneYearLater = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
      const subId = (await knex.raw('SELECT uuid_generate_v4() as id')).rows[0].id;

      await knex('subscriptions').insert({
        id: subId,
        organization_id: org.id,
        plan_name: 'ENTERPRISE',
        base_price: 499.00,
        ai_audit_price: 199.00,
        total_price: 698.00,
        currency: 'USD',
        has_ai_audit: true,
        billing_cycle: 'ANNUAL',
        start_date: now,
        end_date: oneYearLater,
        status: 'ACTIVE',
        auto_renew: true,
        created_at: now,
        updated_at: now,
      });

      const invNum = `INV-2026-${Math.floor(100000 + Math.random() * 900000)}`;
      const recNum = `RCP-2026-${Math.floor(100000 + Math.random() * 900000)}`;
      const taxAmt = 698.00 * 0.18;
      const totalAmt = 698.00 + taxAmt;

      await knex('subscription_invoices').insert({
        id: (await knex.raw('SELECT uuid_generate_v4() as id')).rows[0].id,
        subscription_id: subId,
        organization_id: org.id,
        invoice_number: invNum,
        receipt_number: recNum,
        base_amount: 499.00,
        ai_audit_amount: 199.00,
        tax_amount: taxAmt,
        total_amount: totalAmt,
        currency: 'USD',
        payment_status: 'PAID',
        payment_method: 'CREDIT_CARD',
        paid_at: now,
        receipt_data: JSON.stringify({
          invoiceNumber: invNum,
          receiptNumber: recNum,
          organization: { id: org.id, name: org.name, slug: org.slug },
          plan: 'ENTERPRISE',
          billingCycle: 'ANNUAL',
          period: { from: now.toISOString(), to: oneYearLater.toISOString() },
          lineItems: [
            { description: 'Master CRM Core Enterprise Platform (Annual)', amount: 499.00 },
            { description: 'AI Voice & Speech Intelligence Engine Add-On (Annual)', amount: 199.00 },
          ],
          subtotal: 698.00,
          taxRate: '18%',
          taxAmount: taxAmt,
          totalPaid: totalAmt,
          paymentMethod: 'CREDIT_CARD',
          paidAt: now.toISOString(),
          notes: 'Initial enterprise activation subscription for Master CRM platform.',
        }),
        created_at: now,
      });

      // Ensure org has enable_ai_audit = true
      await knex('organizations').where('id', org.id).update({
        enable_ai_audit: true,
        updated_at: now,
      });
    }
  }
};

/**
 * Rollback migrations.
 *
 * @param {import('knex').Knex} knex
 * @returns {Promise<void>}
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('client_db_sync_logs');
  await knex.schema.dropTableIfExists('client_db_sync_configs');
  await knex.schema.dropTableIfExists('subscription_invoices');
  await knex.schema.dropTableIfExists('subscriptions');
  await knex.schema.dropTableIfExists('subscription_pricing');
};
