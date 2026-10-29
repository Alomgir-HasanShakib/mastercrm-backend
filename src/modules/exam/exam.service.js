/**
 * @file exam.service.js
 * @description Business logic for Surveyor Certification Exams, timed quiz attempts, dynamic question selection, automated grading, and pass/fail certificate issuance.
 */

const { v4: uuidv4 } = require('uuid');
const examModel = require('./exam.model');
const { ValidationError, NotFoundError } = require('../../utils/errors');
const logger = require('../../utils/logger');

/**
 * Utility: Shuffles an array using Fisher-Yates algorithm
 * @param {Array} array
 * @returns {Array}
 */
const shuffleArray = (array) => {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

/**
 * Safely parse JSON or return object
 * @param {any} val
 * @param {any} fallback
 * @returns {any}
 */
const safeParse = (val, fallback = []) => {
  if (!val) return fallback;
  if (typeof val === 'object') return val;
  try {
    return JSON.parse(val);
  } catch {
    return fallback;
  }
};

const examService = {
  /**
   * List available exams with attempt history for current user
   * @param {object} filters
   * @param {string} userId
   * @returns {Promise<Array<object>>}
   */
  async listExams(filters = {}, userId = null) {
    const exams = await examModel.listExams(filters);

    if (!userId) return exams;

    const userAttempts = await examModel.getUserAttempts(userId);
    const attemptsByExam = {};

    userAttempts.forEach((att) => {
      if (!attemptsByExam[att.exam_id]) {
        attemptsByExam[att.exam_id] = [];
      }
      attemptsByExam[att.exam_id].push(att);
    });

    return exams.map((exam) => {
      const attempts = attemptsByExam[exam.id] || [];
      const passedAttempt = attempts.find((a) => a.passed);
      const activeAttempt = attempts.find((a) => a.status === 'IN_PROGRESS');

      return {
        ...exam,
        attemptCount: attempts.length,
        isPassed: !!passedAttempt,
        certificateId: passedAttempt ? passedAttempt.certificate_id : null,
        bestScore: attempts.reduce((max, a) => Math.max(max, parseFloat(a.percentage) || 0), 0),
        activeAttemptId: activeAttempt ? activeAttempt.id : null,
        canTake: exam.allow_retake || attempts.length < (exam.max_attempts || 3),
      };
    });
  },

  /**
   * Get exam details and questions preview for administration
   * @param {string} examId
   * @returns {Promise<object>}
   */
  async getExamById(examId) {
    const exam = await examModel.getExamById(examId);
    if (!exam) {
      throw new NotFoundError(`Exam with ID '${examId}' not found`);
    }

    const questions = await examModel.getQuestionsByExamId(examId);
    return {
      ...exam,
      questions: questions.map((q) => ({
        ...q,
        options: safeParse(q.options, []),
        correct_answers: safeParse(q.correct_answers, []),
      })),
    };
  },

  /**
   * Start a new exam attempt session
   * Assembles fixed exam questions & dynamic common question sets, applies timer, and returns client-sanitized questions.
   * @param {string} examId
   * @param {string} userId
   * @returns {Promise<object>}
   */
  async startAttempt(examId, userId) {
    const exam = await examModel.getExamById(examId);
    if (!exam) {
      throw new NotFoundError(`Exam with ID '${examId}' not found`);
    }

    if (exam.status !== 'ACTIVE') {
      throw new ValidationError('This exam is currently not active');
    }

    // Check existing attempts
    const attempts = await examModel.getUserAttempts(userId, examId);
    const existingInProgress = attempts.find((a) => a.status === 'IN_PROGRESS');

    // If an in-progress attempt is still valid within timer window, return it
    if (existingInProgress) {
      const startTime = new Date(existingInProgress.start_time).getTime();
      const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
      const remainingSeconds = existingInProgress.time_limit_seconds - elapsedSeconds;

      if (remainingSeconds > 0) {
        const questionIds = safeParse(existingInProgress.question_ids, []);
        const allExamQuestions = await examModel.getQuestionsByExamId(examId);
        const commonQuestions = await examModel.getCommonQuestions(exam.category, 50);
        const questionMap = new Map();
        [...allExamQuestions, ...commonQuestions].forEach((q) => questionMap.set(q.id, q));

        const sanitizedQuestions = questionIds
          .map((id) => questionMap.get(id))
          .filter(Boolean)
          .map((q) => ({
            id: q.id,
            question_text: q.question_text,
            question_type: q.question_type,
            options: safeParse(q.options, []),
            points: q.points,
          }));

        return {
          attemptId: existingInProgress.id,
          examId: exam.id,
          examTitle: exam.title,
          category: exam.category,
          durationMinutes: exam.duration_minutes,
          remainingSeconds,
          totalQuestions: sanitizedQuestions.length,
          questions: sanitizedQuestions,
          isResume: true,
        };
      } else {
        // Mark as expired
        await examModel.updateAttempt(existingInProgress.id, {
          status: 'EXPIRED',
          end_time: new Date(),
        });
      }
    }

    // Check max attempts
    if (!exam.allow_retake && attempts.length >= (exam.max_attempts || 3)) {
      throw new ValidationError(`Maximum attempt limit (${exam.max_attempts}) reached for this exam`);
    }

    // Question Selection: Combine fixed questions and dynamic common questions
    const fixedQuestions = await examModel.getQuestionsByExamId(examId);
    const commonQuestions = await examModel.getCommonQuestions(exam.category, 15);

    let selectedQuestions = [...fixedQuestions];

    // If total questions required is more than fixed questions, pull from common dynamic pool
    const targetCount = exam.total_questions_to_ask || 10;
    if (selectedQuestions.length < targetCount && commonQuestions.length > 0) {
      const fixedIds = new Set(selectedQuestions.map((q) => q.id));
      const pool = commonQuestions.filter((q) => !fixedIds.has(q.id));
      const needed = targetCount - selectedQuestions.length;
      selectedQuestions.push(...shuffleArray(pool).slice(0, needed));
    }

    if (exam.shuffle_questions) {
      selectedQuestions = shuffleArray(selectedQuestions);
    }

    // Cap at total_questions_to_ask
    if (selectedQuestions.length > targetCount) {
      selectedQuestions = selectedQuestions.slice(0, targetCount);
    }

    if (selectedQuestions.length === 0) {
      throw new ValidationError('No questions available in question bank for this exam');
    }

    const questionIds = selectedQuestions.map((q) => q.id);
    const totalPossiblePoints = selectedQuestions.reduce((sum, q) => sum + (parseFloat(q.points) || 1.0), 0);
    const timeLimitSeconds = (exam.duration_minutes || 30) * 60;

    const attempt = await examModel.createAttempt({
      exam_id: exam.id,
      user_id: userId,
      start_time: new Date(),
      time_limit_seconds: timeLimitSeconds,
      question_ids: JSON.stringify(questionIds),
      total_points: totalPossiblePoints,
      status: 'IN_PROGRESS',
    });

    // Sanitize questions (strip correct_answers and explanations)
    const sanitizedQuestions = selectedQuestions.map((q) => ({
      id: q.id,
      question_text: q.question_text,
      question_type: q.question_type,
      options: safeParse(q.options, []),
      points: parseFloat(q.points) || 1.0,
    }));

    return {
      attemptId: attempt.id,
      examId: exam.id,
      examTitle: exam.title,
      category: exam.category,
      durationMinutes: exam.duration_minutes,
      remainingSeconds: timeLimitSeconds,
      totalQuestions: sanitizedQuestions.length,
      questions: sanitizedQuestions,
      isResume: false,
    };
  },

  /**
   * Submit quiz answers, evaluate grading, pass/fail threshold, and link submission code
   * @param {string} attemptId
   * @param {string} userId
   * @param {Array<object>} submittedAnswers - [{ question_id: string, selected_answers: Array<string> }]
   * @param {string} [submissionCode] - External / CAPI linked submission code
   * @returns {Promise<object>}
   */
  async submitAttempt(attemptId, userId, submittedAnswers = [], submissionCode = null) {
    const attempt = await examModel.getAttemptById(attemptId);
    if (!attempt) {
      throw new NotFoundError(`Exam attempt '${attemptId}' not found`);
    }

    if (attempt.user_id !== userId) {
      throw new ValidationError('Unauthorized: Attempt does not belong to the current user');
    }

    if (attempt.status === 'SUBMITTED' || attempt.status === 'GRADED') {
      throw new ValidationError('This attempt has already been submitted and scored');
    }

    const exam = await examModel.getExamById(attempt.exam_id);
    const questionIds = safeParse(attempt.question_ids, []);

    // Load question definitions to grade
    const allExamQuestions = await examModel.getQuestionsByExamId(exam.id);
    const commonQuestions = await examModel.getCommonQuestions(exam.category, 50);
    const questionMap = new Map();
    [...allExamQuestions, ...commonQuestions].forEach((q) => questionMap.set(q.id, q));

    const submittedMap = new Map();
    submittedAnswers.forEach((ans) => {
      submittedMap.set(ans.question_id, Array.isArray(ans.selected_answers) ? ans.selected_answers : [ans.selected_answers]);
    });

    let earnedScore = 0;
    let totalScore = 0;
    const gradedBreakdown = [];

    for (const qId of questionIds) {
      const qDef = questionMap.get(qId);
      if (!qDef) continue;

      const qPoints = parseFloat(qDef.points) || 1.0;
      totalScore += qPoints;

      const userSelected = (submittedMap.get(qId) || []).map(String).sort();
      const correctAnswers = safeParse(qDef.correct_answers, []).map(String).sort();

      // Determine match
      let isCorrect = false;
      if (qDef.question_type === 'MULTIPLE_CHOICE') {
        isCorrect =
          userSelected.length === correctAnswers.length &&
          userSelected.every((val, idx) => val === correctAnswers[idx]);
      } else {
        // Single choice or True/False
        isCorrect = userSelected.length > 0 && userSelected[0] === correctAnswers[0];
      }

      const pointsEarned = isCorrect ? qPoints : 0;
      earnedScore += pointsEarned;

      gradedBreakdown.push({
        question_id: qId,
        question_text: qDef.question_text,
        question_type: qDef.question_type,
        options: safeParse(qDef.options, []),
        selected_answers: userSelected,
        correct_answers: correctAnswers,
        explanation: qDef.explanation,
        is_correct: isCorrect,
        points_earned: pointsEarned,
        total_points: qPoints,
      });
    }

    const percentage = totalScore > 0 ? (earnedScore / totalScore) * 100 : 0;
    const passingThreshold = parseFloat(exam.passing_percentage) || 70.0;
    const passed = percentage >= passingThreshold;

    // Issue unique certificate ID if passed
    const certificateId = passed
      ? `CERT-${exam.category || 'CRM'}-${new Date().getFullYear()}-${uuidv4().substring(0, 8).toUpperCase()}`
      : null;

    const finalSubmissionCode = submissionCode || `SUB-EXAM-${attemptId.substring(0, 8).toUpperCase()}`;

    // Update attempt
    await examModel.updateAttempt(attemptId, {
      score: earnedScore,
      total_points: totalScore,
      percentage: Math.round(percentage * 100) / 100,
      passed,
      status: 'GRADED',
      certificate_id: certificateId,
      end_time: new Date(),
    });

    // Save submission records
    await examModel.createSubmission({
      attempt_id: attemptId,
      exam_id: exam.id,
      user_id: userId,
      submission_code: finalSubmissionCode,
      answers: JSON.stringify(gradedBreakdown),
      submitted_at: new Date(),
      evaluator_notes: passed
        ? `Passed with ${percentage.toFixed(1)}% score. Certification credential issued.`
        : `Failed with ${percentage.toFixed(1)}% score (Threshold: ${passingThreshold}%).`,
    });

    logger.info('Exam evaluated and graded:', {
      attemptId,
      userId,
      percentage,
      passed,
      certificateId,
    });

    return {
      attemptId,
      examId: exam.id,
      examTitle: exam.title,
      submissionCode: finalSubmissionCode,
      score: earnedScore,
      totalPoints: totalScore,
      percentage: Math.round(percentage * 100) / 100,
      passingThreshold,
      passed,
      certificateId,
      submittedAt: new Date().toISOString(),
      gradedBreakdown,
    };
  },

  /**
   * Get graded result for an attempt
   * @param {string} attemptId
   * @param {string} userId
   * @returns {Promise<object>}
   */
  async getAttemptResult(attemptId, userId) {
    const attempt = await examModel.getAttemptById(attemptId);
    if (!attempt) {
      throw new NotFoundError(`Exam attempt '${attemptId}' not found`);
    }

    if (attempt.user_id !== userId) {
      throw new ValidationError('Unauthorized to view this attempt result');
    }

    const submission = await examModel.getSubmissionByAttemptId(attemptId);

    return {
      attemptId: attempt.id,
      examId: attempt.exam_id,
      examTitle: attempt.exam_title,
      category: attempt.exam_category,
      score: parseFloat(attempt.score) || 0,
      totalPoints: parseFloat(attempt.total_points) || 0,
      percentage: parseFloat(attempt.percentage) || 0,
      passingThreshold: parseFloat(attempt.passing_percentage) || 70,
      passed: attempt.passed,
      certificateId: attempt.certificate_id,
      status: attempt.status,
      startTime: attempt.start_time,
      endTime: attempt.end_time,
      submissionCode: submission ? submission.submission_code : null,
      gradedBreakdown: submission ? safeParse(submission.answers, []) : [],
    };
  },

  /**
   * Get all certificates awarded to user
   * @param {string} userId
   * @returns {Promise<Array<object>>}
   */
  async getUserCertificates(userId) {
    return examModel.getUserCertificates(userId);
  },
};

module.exports = examService;
