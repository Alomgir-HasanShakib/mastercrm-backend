/**
 * @file 20261023160000_align_core_db_tables.js
 * @description Migration to align core database tables (organizations, projects, submissions, users, assignments) with application domain requirements.
 */

const addColumnIfNotExists = async (knex, tableName, columnName, columnCallback) => {
  const hasCol = await knex.schema.hasColumn(tableName, columnName);
  if (!hasCol) {
    await knex.schema.alterTable(tableName, (table) => {
      columnCallback(table);
    });
  }
};

exports.up = async function (knex) {
  // 1. organizations table alignment
  await addColumnIfNotExists(knex, 'organizations', 'code', (table) => {
    table.string('code', 100).nullable();
  });
  await addColumnIfNotExists(knex, 'organizations', 'domain', (table) => {
    table.string('domain', 255).nullable();
  });
  await addColumnIfNotExists(knex, 'organizations', 'email', (table) => {
    table.string('email', 255).nullable();
  });
  await addColumnIfNotExists(knex, 'organizations', 'phone', (table) => {
    table.string('phone', 50).nullable();
  });
  await addColumnIfNotExists(knex, 'organizations', 'address', (table) => {
    table.text('address').nullable();
  });
  await addColumnIfNotExists(knex, 'organizations', 'contact_person', (table) => {
    table.string('contact_person', 150).nullable();
  });
  await addColumnIfNotExists(knex, 'organizations', 'status', (table) => {
    table.string('status', 50).notNullable().defaultTo('ACTIVE');
  });
  await addColumnIfNotExists(knex, 'organizations', 'max_created_users', (table) => {
    table.integer('max_created_users').notNullable().defaultTo(200);
  });

  // Populate code and status for existing organizations
  await knex.raw(`
    UPDATE organizations 
    SET code = CASE 
      WHEN slug = 'master-crm' THEN 'MASTER'
      WHEN slug IS NOT NULL AND slug != '' THEN UPPER(REPLACE(slug, '-', '_'))
      ELSE 'ORG_' || SUBSTRING(id::text, 1, 8)
    END
    WHERE code IS NULL OR code = '';
  `);

  await knex.raw(`
    UPDATE organizations
    SET status = 'ACTIVE'
    WHERE status IS NULL;
  `);

  await knex.raw(`
    UPDATE organizations
    SET max_created_users = 200
    WHERE max_created_users IS NULL;
  `);

  // 2. projects table: drop NOT NULL on client_id
  await knex.raw('ALTER TABLE projects ALTER COLUMN client_id DROP NOT NULL;');

  // 3. submissions table: drop NOT NULL on project_id
  await knex.raw('ALTER TABLE submissions ALTER COLUMN project_id DROP NOT NULL;');

  // 4. users table: add validity, KYC, code, language columns
  await addColumnIfNotExists(knex, 'users', 'validity_start', (table) => {
    table.timestamp('validity_start', { useTz: true }).nullable();
  });
  await addColumnIfNotExists(knex, 'users', 'validity_end', (table) => {
    table.timestamp('validity_end', { useTz: true }).nullable();
  });
  await addColumnIfNotExists(knex, 'users', 'is_lifetime', (table) => {
    table.boolean('is_lifetime').notNullable().defaultTo(false);
  });
  await addColumnIfNotExists(knex, 'users', 'voice_kyc_status', (table) => {
    table.string('voice_kyc_status', 50).notNullable().defaultTo('PENDING');
  });
  await addColumnIfNotExists(knex, 'users', 'user_code', (table) => {
    table.string('user_code', 100).nullable();
  });
  await addColumnIfNotExists(knex, 'users', 'language', (table) => {
    table.string('language', 100).nullable().defaultTo('Hindi, English');
  });

  // 5. user_project_assignments table: add updated_at
  await addColumnIfNotExists(knex, 'user_project_assignments', 'updated_at', (table) => {
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
  });
};

exports.down = async function (knex) {
  // users
  const userCols = ['validity_start', 'validity_end', 'is_lifetime', 'voice_kyc_status', 'user_code', 'language'];
  for (const col of userCols) {
    const hasCol = await knex.schema.hasColumn('users', col);
    if (hasCol) {
      await knex.schema.alterTable('users', (t) => t.dropColumn(col));
    }
  }

  // user_project_assignments
  const hasUpaUpdatedAt = await knex.schema.hasColumn('user_project_assignments', 'updated_at');
  if (hasUpaUpdatedAt) {
    await knex.schema.alterTable('user_project_assignments', (t) => t.dropColumn('updated_at'));
  }

  // organizations
  const orgCols = ['code', 'domain', 'email', 'phone', 'address', 'contact_person', 'status', 'max_created_users'];
  for (const col of orgCols) {
    const hasCol = await knex.schema.hasColumn('organizations', col);
    if (hasCol) {
      await knex.schema.alterTable('organizations', (t) => t.dropColumn(col));
    }
  }
};
