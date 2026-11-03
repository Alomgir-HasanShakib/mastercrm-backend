/**
 * @file 20261104000000_add_ai_audit_to_questionnaire_module_enum.js
 * @description Knex migration to safely add 'AI_AUDIT' to the questionnaire_module_enum type in PostgreSQL.
 */

exports.up = async function (knex) {
  try {
    await knex.raw(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_type typ
          JOIN pg_enum enm ON typ.oid = enm.enumtypid
          WHERE typ.typname = 'questionnaire_module_enum'
          AND enm.enumlabel = 'AI_AUDIT'
        ) THEN
          ALTER TYPE questionnaire_module_enum ADD VALUE 'AI_AUDIT';
        END IF;
      END$$;
    `);
  } catch (err) {
    console.warn('[Migration 20261104000000] Notice on altering questionnaire_module_enum:', err.message);
  }
};

exports.down = async function (knex) {
  // PostgreSQL does not support easily dropping values from an enum type in-place
};
