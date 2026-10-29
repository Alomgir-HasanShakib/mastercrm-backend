/**
 * @file 20261020140000_create_field_cati_tables.js
 * @description Creates audio_sessions, audio_chunks, question_audio_segments,
 * agent_location_events, and submission_values tables for the Field CATI Survey module.
 */

exports.up = async function (knex) {
  // 1. submission_values
  const hasSubmissionValues = await knex.schema.hasTable('submission_values');
  if (!hasSubmissionValues) {
    await knex.schema.createTable('submission_values', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
      table.string('submission_id', 128).notNullable().index();
      table.string('question_tag', 100).notNullable().index();
      table.text('response_value').nullable();
      table.jsonb('response_metadata').nullable().defaultTo('{}');
      table.timestamp('answered_at', { useTz: true }).nullable();
      table.timestamps(true, true);
    });
  }

  // 2. audio_sessions
  const hasAudioSessions = await knex.schema.hasTable('audio_sessions');
  if (!hasAudioSessions) {
    await knex.schema.createTable('audio_sessions', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
      table.string('submission_id', 128).notNullable().index();
      table.uuid('project_id').nullable().index();
      table.uuid('surveyor_id').nullable().index();
      table.text('storage_path').nullable();
      table.text('storage_url').nullable();
      table.integer('duration_seconds').notNullable().defaultTo(0);
      table.bigInteger('file_size_bytes').notNullable().defaultTo(0);
      table.string('mime_type', 64).defaultTo('audio/webm');
      table.string('status', 32).notNullable().defaultTo('COMPLETED'); // RECORDING, COMPLETED, FAILED
      table.jsonb('metadata').nullable().defaultTo('{}');
      table.timestamps(true, true);
    });
  }

  // 3. audio_chunks
  const hasAudioChunks = await knex.schema.hasTable('audio_chunks');
  if (!hasAudioChunks) {
    await knex.schema.createTable('audio_chunks', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
      table.string('audio_session_id', 128).notNullable().index();
      table.string('submission_id', 128).nullable().index();
      table.integer('chunk_index').notNullable();
      table.integer('total_chunks').notNullable().defaultTo(1);
      table.integer('chunk_size_bytes').notNullable().defaultTo(0);
      table.string('sha256_hash', 64).nullable();
      table.text('storage_url').nullable();
      table.timestamps(true, true);
    });
  }

  // 4. question_audio_segments
  const hasQuestionAudioSegments = await knex.schema.hasTable('question_audio_segments');
  if (!hasQuestionAudioSegments) {
    await knex.schema.createTable('question_audio_segments', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
      table.string('submission_id', 128).notNullable().index();
      table.string('question_tag', 100).notNullable().index();
      table.decimal('start_time_seconds', 8, 2).notNullable().defaultTo(0);
      table.decimal('end_time_seconds', 8, 2).notNullable().defaultTo(0);
      table.text('audio_url').nullable();
      table.timestamps(true, true);
    });
  }

  // 5. agent_location_events
  const hasAgentLocationEvents = await knex.schema.hasTable('agent_location_events');
  if (!hasAgentLocationEvents) {
    await knex.schema.createTable('agent_location_events', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
      table.uuid('surveyor_id').nullable().index();
      table.string('submission_id', 128).nullable().index();
      table.uuid('project_id').nullable().index();
      table.decimal('latitude', 10, 7).notNullable();
      table.decimal('longitude', 10, 7).notNullable();
      table.decimal('altitude', 8, 2).nullable();
      table.decimal('accuracy', 8, 2).nullable();
      table.decimal('speed', 8, 2).nullable();
      table.decimal('heading', 8, 2).nullable();
      table.integer('battery_level').nullable();
      table.string('network_type', 32).nullable();
      table.boolean('is_mock_location').defaultTo(false);
      table.timestamp('recorded_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamps(true, true);
    });
  }
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('agent_location_events');
  await knex.schema.dropTableIfExists('question_audio_segments');
  await knex.schema.dropTableIfExists('audio_chunks');
  await knex.schema.dropTableIfExists('audio_sessions');
  await knex.schema.dropTableIfExists('submission_values');
};
