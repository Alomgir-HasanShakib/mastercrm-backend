/**
 * @file exam.model.js
 * @description Knex database query methods and table definitions for Surveyor Exams, Question Banks, Attempts, and Submissions with mockStore resilience.
 */

const { db, withDbFallback, isDbHealthy } = require('../../database/connection');
const mockStore = require('../../database/mockStore');
const logger = require('../../utils/logger');

let tablesInitialized = false;

/**
 * Ensures table existence dynamically so exam and certification features
 * function reliably across all database environments.
 */
const ensureTablesExist = async () => {
  if (tablesInitialized || !isDbHealthy()) return;

  try {
    // 1. exams table
    const hasExamsTable = await db.schema.hasTable('exams');
    if (!hasExamsTable) {
      await db.schema.createTable('exams', (table) => {
        table.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
        table.uuid('project_id').nullable();
        table.string('title', 255).notNullable();
        table.text('description').nullable();
        table.string('category', 64).defaultTo('CAPI');
        table.integer('duration_minutes').defaultTo(30);
        table.decimal('passing_percentage', 5, 2).defaultTo(70.0);
        table.integer('total_questions_to_ask').defaultTo(10);
        table.boolean('shuffle_questions').defaultTo(true);
        table.boolean('allow_retake').defaultTo(true);
        table.integer('max_attempts').defaultTo(5);
        table.string('status', 32).defaultTo('ACTIVE');
        table.jsonb('metadata').defaultTo('{}');
        table.timestamps(true, true);
        table.index(['project_id', 'status']);
      });
    }

    // 2. exam_questions table
    const hasQuestionsTable = await db.schema.hasTable('exam_questions');
    if (!hasQuestionsTable) {
      await db.schema.createTable('exam_questions', (table) => {
        table.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
        table.uuid('exam_id').nullable();
        table.text('question_text').notNullable();
        table.string('question_type', 32).defaultTo('SINGLE_CHOICE');
        table.jsonb('options').notNullable().defaultTo('[]');
        table.jsonb('correct_answers').notNullable().defaultTo('[]');
        table.text('explanation').nullable();
        table.decimal('points', 5, 2).defaultTo(1.0);
        table.string('difficulty', 32).defaultTo('MEDIUM');
        table.boolean('is_common').defaultTo(false);
        table.string('category', 64).defaultTo('GENERAL');
        table.timestamps(true, true);
        table.index(['exam_id', 'is_common', 'category']);
      });
    }

    // 3. exam_attempts table
    const hasAttemptsTable = await db.schema.hasTable('exam_attempts');
    if (!hasAttemptsTable) {
      await db.schema.createTable('exam_attempts', (table) => {
        table.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
        table.uuid('exam_id').notNullable();
        table.uuid('user_id').notNullable();
        table.timestamp('start_time').notNullable().defaultTo(db.fn.now());
        table.timestamp('end_time').nullable();
        table.integer('time_limit_seconds').defaultTo(1800);
        table.jsonb('question_ids').notNullable().defaultTo('[]');
        table.decimal('score', 6, 2).defaultTo(0);
        table.decimal('total_points', 6, 2).defaultTo(0);
        table.decimal('percentage', 5, 2).defaultTo(0);
        table.boolean('passed').defaultTo(false);
        table.string('status', 32).defaultTo('IN_PROGRESS');
        table.string('certificate_id', 128).nullable();
        table.timestamps(true, true);
        table.index(['exam_id', 'user_id', 'status']);
      });
    }

    // 4. exam_submissions table
    const hasSubmissionsTable = await db.schema.hasTable('exam_submissions');
    if (!hasSubmissionsTable) {
      await db.schema.createTable('exam_submissions', (table) => {
        table.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
        table.uuid('attempt_id').notNullable();
        table.uuid('exam_id').notNullable();
        table.uuid('user_id').notNullable();
        table.string('submission_code', 128).nullable();
        table.jsonb('answers').notNullable().defaultTo('[]');
        table.timestamp('submitted_at').defaultTo(db.fn.now());
        table.text('evaluator_notes').nullable();
        table.timestamps(true, true);
        table.unique(['attempt_id']);
        table.index(['user_id', 'exam_id']);
      });
    }

    tablesInitialized = true;
  } catch (err) {
    logger.warn('Dynamic table check or creation handled for exam module:', { error: err.message });
    tablesInitialized = true;
  }
};

const examModel = {
  /**
   * Initializes prerequisite schemas on-demand
   */
  async init() {
    await ensureTablesExist();
  },

  /**
   * List exams with filtering and pagination
   * @param {object} filters
   * @returns {Promise<Array<object>>}
   */
  async listExams(filters = {}) {
    return withDbFallback(
      async () => {
        await ensureTablesExist();
        let query = db('exams').orderBy('created_at', 'desc');

        if (filters.category && filters.category !== 'ALL') {
          query = query.where('category', filters.category);
        }
        if (filters.status && filters.status !== 'ALL') {
          query = query.where('status', filters.status);
        } else if (!filters.status) {
          query = query.where('status', 'ACTIVE');
        }
        if (filters.projectId) {
          query = query.where((qb) => {
            qb.where('project_id', filters.projectId).orWhereNull('project_id');
          });
        }

        return query;
      },
      () => {
        let exams = mockStore.data.exams || [];
        if (filters.category && filters.category !== 'ALL') {
          exams = exams.filter((e) => e.category === filters.category);
        }
        if (filters.status && filters.status !== 'ALL') {
          exams = exams.filter((e) => e.status === filters.status);
        }
        return exams;
      }
    );
  },

  /**
   * Get exam by ID
   * @param {string} id
   * @returns {Promise<object|null>}
   */
  async getExamById(id) {
    return withDbFallback(
      async () => {
        await ensureTablesExist();
        return db('exams').where('id', id).first();
      },
      () => mockStore.findById('exams', id)
    );
  },

  /**
   * Create new exam
   * @param {object} data
   * @param {import('knex').Knex.Transaction} [trx]
   * @returns {Promise<object>}
   */
  async createExam(data, trx = null) {
    return withDbFallback(
      async () => {
        await ensureTablesExist();
        const query = db('exams').insert(data).returning('*');
        if (trx) query.transacting(trx);
        const [created] = await query;
        return created;
      },
      () => mockStore.insert('exams', data)
    );
  },

  /**
   * Update exam
   * @param {string} id
   * @param {object} data
   * @param {import('knex').Knex.Transaction} [trx]
   * @returns {Promise<object>}
   */
  async updateExam(id, data, trx = null) {
    return withDbFallback(
      async () => {
        await ensureTablesExist();
        const query = db('exams')
          .where('id', id)
          .update({
            ...data,
            updated_at: db.fn.now(),
          })
          .returning('*');
        if (trx) query.transacting(trx);
        const [updated] = await query;
        return updated;
      },
      () => mockStore.update('exams', id, data)
    );
  },

  /**
   * Get specific questions tied to an exam
   * @param {string} examId
   * @returns {Promise<Array<object>>}
   */
  async getQuestionsByExamId(examId) {
    return withDbFallback(
      async () => {
        await ensureTablesExist();
        return db('exam_questions')
          .where('exam_id', examId)
          .orderBy('created_at', 'asc');
      },
      () => mockStore.find('exam_questions', { exam_id: examId })
    );
  },

  /**
   * Get common question sets applicable dynamically
   * @param {string} category
   * @param {number} limit
   * @returns {Promise<Array<object>>}
   */
  async getCommonQuestions(category, limit = 10) {
    return withDbFallback(
      async () => {
        await ensureTablesExist();
        let query = db('exam_questions')
          .where('is_common', true)
          .limit(limit);

        if (category && category !== 'ALL') {
          query = query.where((qb) => {
            qb.where('category', category).orWhere('category', 'GENERAL');
          });
        }

        return query;
      },
      () => {
        const questions = mockStore.data.exam_questions || [];
        return questions.slice(0, limit);
      }
    );
  },

  /**
   * Add question to bank
   * @param {object} data
   * @param {import('knex').Knex.Transaction} [trx]
   * @returns {Promise<object>}
   */
  async createQuestion(data, trx = null) {
    return withDbFallback(
      async () => {
        await ensureTablesExist();
        const query = db('exam_questions').insert(data).returning('*');
        if (trx) query.transacting(trx);
        const [created] = await query;
        return created;
      },
      () => mockStore.insert('exam_questions', data)
    );
  },

  /**
   * Create an exam attempt session
   * @param {object} data
   * @param {import('knex').Knex.Transaction} [trx]
   * @returns {Promise<object>}
   */
  async createAttempt(data, trx = null) {
    return withDbFallback(
      async () => {
        await ensureTablesExist();
        const query = db('exam_attempts').insert(data).returning('*');
        if (trx) query.transacting(trx);
        const [created] = await query;
        return created;
      },
      () => mockStore.insert('exam_attempts', data)
    );
  },

  /**
   * Find attempt by ID
   * @param {string} id
   * @returns {Promise<object|null>}
   */
  async getAttemptById(id) {
    return withDbFallback(
      async () => {
        await ensureTablesExist();
        return db('exam_attempts')
          .leftJoin('exams', 'exam_attempts.exam_id', 'exams.id')
          .select('exam_attempts.*', 'exams.title as exam_title', 'exams.category as exam_category', 'exams.passing_percentage')
          .where('exam_attempts.id', id)
          .first();
      },
      () => {
        const attempt = mockStore.findById('exam_attempts', id);
        if (!attempt) return null;
        const exam = mockStore.findById('exams', attempt.exam_id) || {};
        return {
          ...attempt,
          exam_title: exam.title,
          exam_category: exam.category,
          passing_percentage: exam.passing_percentage,
        };
      }
    );
  },

  /**
   * Find recent attempts for a user
   * @param {string} userId
   * @param {string} [examId]
   * @returns {Promise<Array<object>>}
   */
  async getUserAttempts(userId, examId = null) {
    return withDbFallback(
      async () => {
        await ensureTablesExist();
        let query = db('exam_attempts')
          .leftJoin('exams', 'exam_attempts.exam_id', 'exams.id')
          .select('exam_attempts.*', 'exams.title as exam_title', 'exams.category as exam_category')
          .where('exam_attempts.user_id', userId)
          .orderBy('exam_attempts.created_at', 'desc');

        if (examId) {
          query = query.where('exam_attempts.exam_id', examId);
        }

        return query;
      },
      () => {
        const filter = { user_id: userId };
        if (examId) filter.exam_id = examId;
        const attempts = mockStore.find('exam_attempts', filter);
        return attempts.map((a) => {
          const exam = mockStore.findById('exams', a.exam_id) || {};
          return {
            ...a,
            exam_title: exam.title,
            exam_category: exam.category,
          };
        });
      }
    );
  },

  /**
   * Update attempt status or score
   * @param {string} id
   * @param {object} data
   * @param {import('knex').Knex.Transaction} [trx]
   * @returns {Promise<object>}
   */
  async updateAttempt(id, data, trx = null) {
    return withDbFallback(
      async () => {
        await ensureTablesExist();
        const query = db('exam_attempts')
          .where('id', id)
          .update({
            ...data,
            updated_at: db.fn.now(),
          })
          .returning('*');
        if (trx) query.transacting(trx);
        const [updated] = await query;
        return updated;
      },
      () => mockStore.update('exam_attempts', id, data)
    );
  },

  /**
   * Create an exam submission
   * @param {object} data
   * @param {import('knex').Knex.Transaction} [trx]
   * @returns {Promise<object>}
   */
  async createSubmission(data, trx = null) {
    return withDbFallback(
      async () => {
        await ensureTablesExist();
        const query = db('exam_submissions').insert(data).returning('*');
        if (trx) query.transacting(trx);
        const [created] = await query;
        return created;
      },
      () => mockStore.insert('exam_submissions', data)
    );
  },

  /**
   * Find submission by attempt ID
   * @param {string} attemptId
   * @returns {Promise<object|null>}
   */
  async getSubmissionByAttemptId(attemptId) {
    return withDbFallback(
      async () => {
        await ensureTablesExist();
        return db('exam_submissions').where('attempt_id', attemptId).first();
      },
      () => mockStore.findOne('exam_submissions', { attempt_id: attemptId })
    );
  },

  /**
   * Get user certificates (passed exam attempts)
   * @param {string} userId
   * @returns {Promise<Array<object>>}
   */
  async getUserCertificates(userId) {
    return withDbFallback(
      async () => {
        await ensureTablesExist();
        return db('exam_attempts')
          .leftJoin('exams', 'exam_attempts.exam_id', 'exams.id')
          .select(
            'exam_attempts.id as attempt_id',
            'exam_attempts.certificate_id',
            'exam_attempts.percentage',
            'exam_attempts.score',
            'exam_attempts.total_points',
            'exam_attempts.end_time as certified_at',
            'exams.title as exam_title',
            'exams.category as exam_category'
          )
          .where('exam_attempts.user_id', userId)
          .where('exam_attempts.passed', true)
          .orderBy('exam_attempts.end_time', 'desc');
      },
      () => {
        const attempts = mockStore.find('exam_attempts', { user_id: userId, passed: true });
        return attempts.map((a) => {
          const exam = mockStore.findById('exams', a.exam_id) || {};
          return {
            attempt_id: a.id,
            certificate_id: a.certificate_id,
            percentage: a.percentage,
            score: a.score,
            total_points: a.total_points,
            certified_at: a.end_time || a.created_at,
            exam_title: exam.title,
            exam_category: exam.category,
          };
        });
      }
    );
  },
};

module.exports = examModel;
