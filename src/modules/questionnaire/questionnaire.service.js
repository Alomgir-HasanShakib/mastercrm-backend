/**
 * @file questionnaire.service.js
 * @description Business logic layer for questionnaire lifecycle, versioning, tree assembly, Excel import/export, and cloning.
 */

const crypto = require('crypto');
const xlsx = require('xlsx');
const { NotFoundError, ValidationError } = require('../../utils/errors');
const questionnaireModel = require('./questionnaire.model');
const { db } = require('../../database/connection');
const mockStore = require('../../database/mockStore');
const { parseQuestionnaireDocument, CANONICAL_TVC_DATA } = require('./tvcQuestionnaireParser');

/**
 * Intelligent survey audit phrases regex patterns (ordered by specificity / length)
 */
const AUDIT_PHRASE_PATTERNS = [
  { pattern: /not\s+audible\s*-\s*agent\s+did\s+not\s+ask\s+the\s+qu(?:es)?tion/gi, canonical: 'Not Audible - Agent did not ask the question' },
  { pattern: /agent\s+did\s+not\s+ask\s+the\s+qu(?:es)?tion/gi, canonical: 'Agent did not ask the question' },
  { pattern: /not\s+audible\s*-\s*no\s+response/gi, canonical: 'Not Audible - No response' },
  { pattern: /not\s+audible/gi, canonical: 'Not Audible' },
  { pattern: /respondent\s+answer(?:ed)?\s+without\s+prompting/gi, canonical: 'Respondent answer without Prompting' },
  { pattern: /respondent\s+answer(?:ed)?\s+after\s+listening\s+options?/gi, canonical: 'Respondent answer after listening option' },
  { pattern: /yes\s*-\s*no\s+prompting\s+done/gi, canonical: 'Yes - No Prompting Done' },
  { pattern: /yes\s*-\s*prompting\s+done/gi, canonical: 'Yes - Prompting Done' },
  { pattern: /no\s+prompting\s+done/gi, canonical: 'No Prompting Done' },
  { pattern: /asked\s+with\s+some\s+word\s+changes?/gi, canonical: 'Asked with some word Changes' },
  { pattern: /asked\s+right/gi, canonical: 'Asked Right' },
  { pattern: /mismac?tch/gi, canonical: 'Mismatch' },
];

/**
 * Robust smart option splitter helper.
 * Handles newlines (\r?\n, literal \n, \r), delimiters (; | \t),
 * numbered prefixes ("1. Option A 2. Option B"), and survey audit phrase boundaries.
 * @param {string|Array<any>} input
 * @returns {Array<string>}
 */
function smartSplitOptions(input) {
  if (!input) return [];
  if (Array.isArray(input)) {
    return input.flatMap((item) =>
      smartSplitOptions(typeof item === 'object' && item !== null ? (item.label || item.value || '') : item)
    );
  }
  let str = String(input).trim();
  if (!str) return [];

  // Normalize escaped newlines and tabs (frequent in JSON/TSV stringification)
  str = str.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n').replace(/\\r/g, '\n').replace(/\\t/g, '\t');

  function splitChunk(chunk) {
    if (!chunk) return [];
    let text = chunk.trim();
    if (!text) return [];

    // Pre-process: break numbered options like "1. Option A 2. Option B"
    text = text.replace(/(\S)\s+([0-9]{1,2}[.)]\s+)/g, '$1\n$2');

    // Pre-process concatenated known phrases
    text = text.replace(/([a-z])(Mismatch|Mismactch)/g, '$1\n$2');
    text = text.replace(/(Right)(Mismatch|Mismactch)/gi, '$1\n$2');
    text = text.replace(/(Asked\s+Right)(Mismatch|Mismactch)/gi, '$1\n$2');
    text = text.replace(/(Asked\s+Right)\s*(Not\s+Audible)/gi, '$1\n$2');
    text = text.replace(/(Mismatch|Mismactch)\s*(Not\s+Audible)/gi, '$1\n$2');
    text = text.replace(/(No\s+response)\s*(Not\s+Audible)/gi, '$1\n$2');
    text = text.replace(/(Prompting)\s*(Respondent)/gi, '$1\n$2');
    text = text.replace(/(Done)\s*(Respondent|Yes|No)/gi, '$1\n$2');

    if (text.includes('\n')) {
      return text.split(/\r?\n/).flatMap(splitChunk);
    }
    if (text.includes('|')) {
      return text.split('|').flatMap(splitChunk);
    }
    if (text.includes('\t')) {
      return text.split('\t').flatMap(splitChunk);
    }
    if (text.includes(';') && !text.includes('&')) {
      return text.split(';').flatMap(splitChunk);
    }

    const matches = [];
    for (const item of AUDIT_PHRASE_PATTERNS) {
      item.pattern.lastIndex = 0;
      let m;
      while ((m = item.pattern.exec(text)) !== null) {
        matches.push({
          start: m.index,
          end: m.index + m[0].length,
          matchedText: m[0],
          canonical: item.canonical,
        });
      }
    }

    matches.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
    const nonOverlapping = [];
    let lastEnd = 0;
    for (const m of matches) {
      if (m.start >= lastEnd) {
        nonOverlapping.push(m);
        lastEnd = m.end;
      }
    }

    if (nonOverlapping.length >= 2) {
      const parts = [];
      let cursor = 0;
      for (const m of nonOverlapping) {
        if (m.start > cursor) {
          const pre = text.slice(cursor, m.start).trim().replace(/^[;,|/\t\s-]+|[;,|/\t\s-]+$/g, '');
          if (pre) parts.push(pre);
        }
        parts.push(m.canonical || m.matchedText);
        cursor = m.end;
      }
      if (cursor < text.length) {
        const post = text.slice(cursor).trim().replace(/^[;,|/\t\s-]+|[;,|/\t\s-]+$/g, '');
        if (post) parts.push(post);
      }
      return parts;
    }

    if (nonOverlapping.length === 1 && nonOverlapping[0].start === 0 && nonOverlapping[0].end === text.length) {
      return [nonOverlapping[0].canonical || text];
    }

    return [text];
  }

  const results = splitChunk(str)
    .map((s) => s.trim().replace(/^[0-9]+[.)]\s*/, '').trim())
    .filter(Boolean);

  const unique = [];
  for (const item of results) {
    if (!unique.includes(item)) {
      unique.push(item);
    }
  }
  return unique;
}

/**
 * Questionnaire Service Object
 */
const questionnaireService = {
  /**
   * Helper to ensure version is editable (DRAFT only)
   * @param {object} version
   */
  assertDraft(version) {
    if (!version) {
      throw new NotFoundError('Questionnaire version not found');
    }
    if (version.status !== 'DRAFT') {
      throw new ValidationError(`Questionnaire version cannot be modified because its status is ${version.status}. Only DRAFT versions are mutable.`);
    }
  },

  /**
   * List questionnaire versions
   * @param {object} filters
   * @returns {Promise<Array<object>>}
   */
  async listVersions(filters = {}) {
    return questionnaireModel.findVersions(filters);
  },

  /**
   * Create new questionnaire draft version
   * @param {object} data - { projectId, module, name }
   * @param {string} userId
   * @returns {Promise<object>}
   */
  async createVersion(data, userId) {
    let projectId = data.projectId;

    if (!projectId) {
      let project = await db('projects').first();
      if (!project) {
        let client = await db('clients').first();
        if (!client) {
          let org = await db('organizations').first();
          if (!org) {
            const [newOrg] = await db('organizations').insert({
              name: 'Master CRM Global Corp',
              code: 'MCRM',
              status: 'ACTIVE',
            }).returning('*');
            org = newOrg;
          }
          const [newClient] = await db('clients').insert({
            name: 'Default Poll Client',
            code: 'DEF_CLIENT',
            organization_id: org.id,
            is_active: true,
          }).returning('*');
          client = newClient;
        }
        const [newProject] = await db('projects').insert({
          name: 'National Pre-Poll Opinion Survey 2026',
          project_code: 'POLL_2026',
          client_id: client.id,
          status: 'ACTIVE',
        }).returning('*');
        project = newProject;
      }
      projectId = project.id;
    } else {
      const existingProject = await db('projects').where('id', projectId).first();
      if (!existingProject) {
        const firstProject = await db('projects').first();
        if (firstProject) {
          projectId = firstProject.id;
        } else {
          let client = await db('clients').first();
          if (!client) {
            let org = await db('organizations').first();
            const [newClient] = await db('clients').insert({
              name: 'Default Poll Client',
              code: 'DEF_CLIENT',
              organization_id: org.id,
              is_active: true,
            }).returning('*');
            client = newClient;
          }
          const [newProject] = await db('projects').insert({
            name: 'National Pre-Poll Opinion Survey 2026',
            project_code: 'POLL_2026',
            client_id: client.id,
            status: 'ACTIVE',
          }).returning('*');
          projectId = newProject.id;
        }
      }
    }

    const latestVersion = await questionnaireModel.getLatestVersionNumber(projectId, data.module);
    const nextVersionNumber = latestVersion + 1;

    let validUserId = null;
    if (userId) {
      try {
        const u = await db('users').where('id', userId).first();
        if (u) validUserId = u.id;
      } catch (_) {}
    }
    if (!validUserId) {
      try {
        const firstUser = await db('users').first();
        if (firstUser) validUserId = firstUser.id;
      } catch (_) {}
    }

    const payload = {
      project_id: projectId,
      module: data.module,
      name: data.name,
      version_number: nextVersionNumber,
      status: 'DRAFT',
      created_by: validUserId,
    };

    return questionnaireModel.createVersion(payload);
  },

  /**
   * Get full questionnaire tree with sections, questions, options, and translations
   * @param {string} id
   * @returns {Promise<object>}
   */
  async getFullQuestionnaire(id) {
    const version = await questionnaireModel.findVersionById(id);
    if (!version) {
      throw new NotFoundError(`Questionnaire version with ID '${id}' not found`);
    }

    const sections = await questionnaireModel.findSections(id);
    const questions = await questionnaireModel.findQuestions(id);
    const questionIds = questions.map((q) => q.id);
    const sectionIds = sections.map((s) => s.id);

    const [options, questionTranslations, sectionTranslations] = await Promise.all([
      questionnaireModel.findOptionsByQuestionIds(questionIds),
      questionnaireModel.findTranslationsByEntityIds('QUESTION', questionIds),
      questionnaireModel.findTranslationsByEntityIds('SECTION', sectionIds),
    ]);

    const optionIds = options.map((opt) => opt.id);
    const optionTranslations = await questionnaireModel.findTranslationsByEntityIds('OPTION', optionIds);

    // Group options by question_id
    const optionsByQuestionId = {};
    for (const opt of options) {
      if (!optionsByQuestionId[opt.question_id]) {
        optionsByQuestionId[opt.question_id] = [];
      }
      opt.translations = optionTranslations.filter((t) => t.entity_id === opt.id);
      optionsByQuestionId[opt.question_id].push({
        id: opt.id,
        label: opt.label,
        value: opt.value,
        code: opt.option_code,
        displayOrder: opt.display_order,
      });
    }

    // Attach options and translations to questions
    const formattedQuestions = questions.map((q) => {
      let meta = {};
      try {
        meta = typeof q.metadata === 'string' ? JSON.parse(q.metadata) : (q.metadata || {});
      } catch (_) {}

      return {
        ...q,
        code: q.question_tag,
        text: q.question_text,
        type: meta.originalType || q.question_type,
        required: q.is_required,
        helpText: q.help_text || '',
        conditions: meta.conditions || [],
        options: optionsByQuestionId[q.id] || [],
        translations: questionTranslations.filter((t) => t.entity_id === q.id),
        metadata: meta,
        toBeAudited: meta.toBeAudited || false,
        inputColumn: meta.inputColumn || null,
        questionValidationColumn: meta.questionValidationColumn || null,
        answerValidationColumn: meta.answerValidationColumn || null,
        actualColumn: meta.actualColumn || null,
        questionValidationOptions: meta.questionValidationOptions || [],
        answerValidationOptions: meta.answerValidationOptions || [],
      };
    });

    // Attach questions to sections, or orphan questions without sections
    const questionsBySectionId = {};
    const unsectionedQuestions = [];

    for (const q of formattedQuestions) {
      if (q.section_id) {
        if (!questionsBySectionId[q.section_id]) {
          questionsBySectionId[q.section_id] = [];
        }
        questionsBySectionId[q.section_id].push(q);
      } else {
        unsectionedQuestions.push(q);
      }
    }

    const formattedSections = sections.map((s) => ({
      ...s,
      code: s.code,
      title: s.title,
      questions: questionsBySectionId[s.id] || [],
      translations: sectionTranslations.filter((t) => t.entity_id === s.id),
    }));

    return {
      ...version,
      sections: formattedSections,
      unsectionedQuestions,
      totalQuestions: questions.length,
      totalSections: sections.length,
    };
  },

  /**
   * Update draft questionnaire metadata or save full sections/questions/options tree
   * @param {string} id
   * @param {object} data
   * @returns {Promise<object>}
   */
  async updateVersion(id, data) {
    const version = await questionnaireModel.findVersionById(id);
    this.assertDraft(version);

    await db.transaction(async (trx) => {
      const updatePayload = { updated_at: new Date() };
      if (data.name || data.title) {
        updatePayload.name = data.name || data.title;
      }
      await trx('questionnaire_versions').where('id', id).update(updatePayload);

      // If full sections tree is provided, sync sections, questions, and options
      if (Array.isArray(data.sections) && data.sections.length > 0) {
        await trx('questions').where('questionnaire_version_id', id).delete();
        await trx('sections').where('questionnaire_version_id', id).delete();

        const usedQTags = new Set();

        for (let sIdx = 0; sIdx < data.sections.length; sIdx++) {
          const sec = data.sections[sIdx];
          const secCode = (sec.code || `SEC_${sIdx + 1}`).trim();
          const secTitle = sec.title || `Section ${sIdx + 1}`;

          const [createdSec] = await trx('sections').insert({
            questionnaire_version_id: id,
            code: secCode,
            title: secTitle,
            display_order: sIdx + 1,
          }).returning('*');

          const questions = Array.isArray(sec.questions) ? sec.questions : [];
          for (let qIdx = 0; qIdx < questions.length; qIdx++) {
            const q = questions[qIdx];
            let qCode = (q.code || q.question_tag || `Q_${sIdx + 1}_${qIdx + 1}`).trim();
            if (usedQTags.has(qCode)) {
              let c = 2;
              while (usedQTags.has(`${qCode}_${c}`)) c++;
              qCode = `${qCode}_${c}`;
            }
            usedQTags.add(qCode);

            // 1. Resolve raw options from all possible frontend / sheet representations
            const rawOptions = Array.isArray(q.options) && q.options.length > 0
              ? q.options
              : Array.isArray(q.a?.options) && q.a.options.length > 0
              ? q.a.options
              : Array.isArray(q.audit?.answerValidationOptions) && q.audit.answerValidationOptions.length > 0
              ? q.audit.answerValidationOptions
              : Array.isArray(q.audit?.validationOptions) && q.audit.validationOptions.length > 0
              ? q.audit.validationOptions
              : [];

            const flatOptions = [];
            for (const opt of rawOptions) {
              if (typeof opt === 'string') {
                const splits = smartSplitOptions(opt);
                splits.forEach((s) => flatOptions.push({ label: s, value: s }));
              } else if (opt && typeof opt === 'object') {
                const optLabel = opt.label || opt.value || '';
                const splits = smartSplitOptions(optLabel);
                if (splits.length > 1) {
                  splits.forEach((s) => flatOptions.push({ ...opt, label: s, value: s }));
                } else {
                  flatOptions.push(opt);
                }
              }
            }
            const options = flatOptions.length > 0 ? flatOptions : rawOptions;

            // 2. Resolve question type
            const rawType = (q.type || q.question_type || q.a?.type || '').toUpperCase();
            const validTypes = [
              'SINGLE_SELECT', 'MULTI_SELECT', 'TEXT', 'TEXTAREA', 'NUMBER',
              'DATE', 'DROPDOWN', 'SEARCHABLE_SELECT', 'RATING', 'CONSENT', 'INFO_BLOCK', 'HIDDEN',
            ];
            let qType = 'TEXT';
            if (rawType === 'SELECT' || rawType === 'SINGLE_SELECT' || rawType === 'RADIO') {
              qType = options.length > 0 ? 'SINGLE_SELECT' : 'TEXT';
            } else if (rawType.includes('MULTI') || rawType.includes('CHECK')) {
              qType = options.length > 0 ? 'MULTI_SELECT' : 'TEXT';
            } else if (rawType === 'BOOLEAN' || rawType === 'BOOL') {
              qType = 'CONSENT';
            } else if (rawType === 'NUMBER' || rawType === 'INT' || rawType === 'AGE') {
              qType = 'NUMBER';
            } else if (rawType === 'DATE' || rawType === 'TIME') {
              qType = 'DATE';
            } else if (rawType === 'RATING' || rawType === 'SCALE') {
              qType = 'RATING';
            } else if (rawType === 'INFO' || rawType === 'INFO_BLOCK' || rawType === 'STATEMENT') {
              qType = 'INFO_BLOCK';
            } else if (validTypes.includes(rawType)) {
              qType = rawType;
            } else if (options.length > 0) {
              qType = 'SINGLE_SELECT';
            } else {
              qType = 'TEXT';
            }

            // Auto-guard: If single select or multi select has NO options defined (like INTRODUCTION or open text),
            // auto-downgrade to TEXT so publishing never fails
            if (['SINGLE_SELECT', 'MULTI_SELECT', 'DROPDOWN', 'SEARCHABLE_SELECT'].includes(qType) && options.length === 0) {
              qType = 'TEXT';
            }

            let metaObj = {};
            try {
              metaObj = typeof q.metadata === 'string' ? JSON.parse(q.metadata) : (q.metadata || {});
            } catch (_) {}

            const mergedMeta = {
              ...metaObj,
              originalType: q.type || q.a?.type || metaObj.originalType,
              conditions: q.conditions || metaObj.conditions || [],
              toBeAudited: q.toBeAudited !== undefined ? q.toBeAudited : metaObj.toBeAudited,
              inputColumn: q.inputColumn !== undefined ? q.inputColumn : metaObj.inputColumn,
              questionInputFromDiu: q.questionInputFromDiu || metaObj.questionInputFromDiu || null,
              questionValidationColumn: q.questionValidationColumn !== undefined ? q.questionValidationColumn : metaObj.questionValidationColumn,
              answerValidationColumn: q.answerValidationColumn !== undefined ? q.answerValidationColumn : metaObj.answerValidationColumn,
              actualColumn: q.actualColumn !== undefined ? q.actualColumn : metaObj.actualColumn,
              questionValidationOptions: q.questionValidationOptions || metaObj.questionValidationOptions || [],
              answerValidationOptions: q.answerValidationOptions || metaObj.answerValidationOptions || [],
              condition: q.condition || metaObj.condition || null,
              superAuditCondition: q.superAuditCondition || metaObj.superAuditCondition || null,
            };

            const [createdQ] = await trx('questions').insert({
              questionnaire_version_id: id,
              section_id: createdSec.id,
              question_no: q.questionNo || q.question_no || q.sn || `${sIdx + 1}.${qIdx + 1}`,
              question_tag: qCode,
              question_type: qType,
              question_text: q.text || q.question_text || q.q?.label || q.label || 'Untitled Question',
              help_text: q.helpText || q.help_text || q.q?.help || null,
              is_required: q.required !== false && q.is_required !== false,
              display_order: q.displayOrder || qIdx + 1,
              metadata: JSON.stringify(mergedMeta),
            }).returning('*');

            const usedOptCodes = new Set();
            for (let oIdx = 0; oIdx < options.length; oIdx++) {
              const opt = options[oIdx];
              const optLabel = typeof opt === 'string' ? opt : (opt.label || opt.value || `Option ${oIdx + 1}`);
              const optValue = typeof opt === 'string' ? opt : (opt.value || opt.label || `opt_${oIdx + 1}`);
              let optCode = (opt.code || opt.option_code || `OPT_${oIdx + 1}`).trim();
              if (usedOptCodes.has(optCode)) {
                optCode = `${optCode}_${oIdx + 1}`;
              }
              usedOptCodes.add(optCode);

              await trx('question_options').insert({
                question_id: createdQ.id,
                option_code: optCode,
                label: optLabel,
                value: optValue,
                display_order: opt.displayOrder || oIdx + 1,
                metadata: JSON.stringify(opt.metadata || {}),
              });
            }
          }
        }
      }
    });

    return this.getFullQuestionnaire(id);
  },

  /**
   * Delete draft questionnaire
   * @param {string} id
   * @returns {Promise<void>}
   */
  async deleteVersion(id) {
    const version = await questionnaireModel.findVersionById(id);
    this.assertDraft(version);

    await questionnaireModel.deleteVersion(id);
  },

  /**
   * Publish a draft questionnaire version
   * @param {string} id
   * @param {string} userId
   * @returns {Promise<object>}
   */
  async publishVersion(id, userId) {
    const version = await questionnaireModel.findVersionById(id);
    this.assertDraft(version);

    // Validate completeness
    const questions = await questionnaireModel.findQuestions(id);
    if (!questions || questions.length === 0) {
      throw new ValidationError('Questionnaire cannot be published without any questions.');
    }

    // Check single/multi select questions have options (auto-heal if empty)
    const choiceTypes = ['SINGLE_SELECT', 'MULTI_SELECT', 'DROPDOWN', 'SEARCHABLE_SELECT'];
    const choiceQuestions = questions.filter((q) => choiceTypes.includes(q.question_type) && q.option_source === 'STATIC');
    if (choiceQuestions.length > 0) {
      const qIds = choiceQuestions.map((q) => q.id);
      const options = await questionnaireModel.findOptionsByQuestionIds(qIds);
      const optMap = new Set(options.map((o) => o.question_id));
      for (const cq of choiceQuestions) {
        if (!optMap.has(cq.id)) {
          let meta = {};
          try {
            meta = typeof cq.metadata === 'string' ? JSON.parse(cq.metadata) : (cq.metadata || {});
          } catch (_) {}

          const metaOpts = meta.answerValidationOptions || meta.options || meta.questionValidationOptions || [];
          if (Array.isArray(metaOpts) && metaOpts.length > 0) {
            // Restore missing options into question_options table
            for (let oIdx = 0; oIdx < metaOpts.length; oIdx++) {
              const opt = metaOpts[oIdx];
              const optLabel = typeof opt === 'string' ? opt : (opt.label || opt.value || `Option ${oIdx + 1}`);
              const optValue = typeof opt === 'string' ? opt : (opt.value || opt.label || `opt_${oIdx + 1}`);
              await db('question_options').insert({
                question_id: cq.id,
                option_code: `OPT_${oIdx + 1}`,
                label: optLabel,
                value: optValue,
                display_order: oIdx + 1,
                metadata: JSON.stringify({}),
              });
            }
          } else {
            // If question has no choices at all (like an INTRODUCTION or open text block), auto-heal to TEXT
            await db('questions').where('id', cq.id).update({ question_type: 'TEXT' });
            cq.question_type = 'TEXT';
          }
        }
      }
    }

    // Generate deterministic checksum of the full questionnaire structure
    const fullTree = await this.getFullQuestionnaire(id);
    const contentToHash = JSON.stringify({
      id: fullTree.id,
      module: fullTree.module,
      version_number: fullTree.version_number,
      sections: fullTree.sections,
      unsectionedQuestions: fullTree.unsectionedQuestions,
    });
    const checksum = crypto.createHash('sha256').update(contentToHash).digest('hex');

    let validUserId = null;
    if (userId) {
      try {
        const u = await db('users').where('id', userId).first();
        if (u) validUserId = u.id;
      } catch (_) {}
    }
    if (!validUserId) {
      try {
        const firstUser = await db('users').first();
        if (firstUser) validUserId = firstUser.id;
      } catch (_) {}
    }

    return questionnaireModel.updateVersion(id, {
      status: 'PUBLISHED',
      published_at: new Date(),
      published_by: validUserId,
      checksum,
    });
  },

  /**
   * Retire a published questionnaire version
   * @param {string} id
   * @returns {Promise<object>}
   */
  async retireVersion(id) {
    const version = await questionnaireModel.findVersionById(id);
    if (!version) {
      throw new NotFoundError('Questionnaire version not found');
    }
    if (version.status !== 'PUBLISHED') {
      throw new ValidationError(`Only PUBLISHED questionnaires can be retired. Current status is ${version.status}.`);
    }

    return questionnaireModel.updateVersion(id, {
      status: 'RETIRED',
    });
  },

  /**
   * Deep clone a questionnaire version to a new DRAFT
   * @param {string} id
   * @param {string} userId
   * @returns {Promise<object>}
   */
  async cloneVersion(id, userId) {
    const source = await this.getFullQuestionnaire(id);
    const latestVersion = await questionnaireModel.getLatestVersionNumber(source.project_id, source.module);
    const nextVersionNumber = latestVersion + 1;

    let validUserId = null;
    if (userId) {
      try {
        const u = await db('users').where('id', userId).first();
        if (u) validUserId = u.id;
      } catch (_) {}
    }
    if (!validUserId) {
      try {
        const firstUser = await db('users').first();
        if (firstUser) validUserId = firstUser.id;
      } catch (_) {}
    }

    return db.transaction(async (trx) => {
      // 1. Create cloned version header
      const [newVersion] = await trx('questionnaire_versions').insert({
        project_id: source.project_id,
        module: source.module,
        name: `${source.name} (v${nextVersionNumber} Draft)`,
        version_number: nextVersionNumber,
        status: 'DRAFT',
        created_by: validUserId,
      }).returning('*');

      const sectionIdMap = new Map(); // oldSectionId -> newSectionId
      const questionIdMap = new Map(); // oldQuestionId -> newQuestionId

      // 2. Clone sections
      for (const section of source.sections) {
        const [newSection] = await trx('sections').insert({
          questionnaire_version_id: newVersion.id,
          code: section.code,
          title: section.title,
          display_order: section.display_order,
          visibility_rule_id: section.visibility_rule_id,
        }).returning('*');

        sectionIdMap.set(section.id, newSection.id);

        // Clone section translations
        if (section.translations && section.translations.length) {
          for (const trans of section.translations) {
            await trx('translations').insert({
              entity_type: 'SECTION',
              entity_id: newSection.id,
              language_code: trans.language_code,
              field_name: trans.field_name,
              localized_text: trans.localized_text,
            });
          }
        }
      }

      // Collect all questions
      const allQuestions = [];
      for (const sec of source.sections) {
        if (sec.questions) allQuestions.push(...sec.questions);
      }
      if (source.unsectionedQuestions) {
        allQuestions.push(...source.unsectionedQuestions);
      }

      // 3. Clone questions & options
      for (const question of allQuestions) {
        const targetSectionId = question.section_id ? sectionIdMap.get(question.section_id) || null : null;

        const [newQuestion] = await trx('questions').insert({
          questionnaire_version_id: newVersion.id,
          section_id: targetSectionId,
          question_no: question.question_no,
          question_tag: question.question_tag,
          question_type: question.question_type,
          question_text: question.question_text,
          help_text: question.help_text,
          is_required: question.is_required,
          display_order: question.display_order,
          input_tag: question.input_tag,
          output_tag: question.output_tag,
          validation_tag: question.validation_tag,
          actual_tag: question.actual_tag,
          option_source: question.option_source,
          evidence_policy: question.evidence_policy,
          validation_rules: question.validation_rules || {},
          metadata: question.metadata || {},
          is_enabled: question.is_enabled,
        }).returning('*');

        questionIdMap.set(question.id, newQuestion.id);

        // Clone question translations
        if (question.translations && question.translations.length) {
          for (const trans of question.translations) {
            await trx('translations').insert({
              entity_type: 'QUESTION',
              entity_id: newQuestion.id,
              language_code: trans.language_code,
              field_name: trans.field_name,
              localized_text: trans.localized_text,
            });
          }
        }

        // Clone options
        if (question.options && question.options.length) {
          for (const opt of question.options) {
            const [newOption] = await trx('question_options').insert({
              question_id: newQuestion.id,
              option_code: opt.option_code,
              label: opt.label,
              value: opt.value,
              display_order: opt.display_order,
              metadata: opt.metadata || {},
              is_active: opt.is_active,
            }).returning('*');

            // Clone option translations
            if (opt.translations && opt.translations.length) {
              for (const trans of opt.translations) {
                await trx('translations').insert({
                  entity_type: 'OPTION',
                  entity_id: newOption.id,
                  language_code: trans.language_code,
                  field_name: trans.field_name,
                  localized_text: trans.localized_text,
                });
              }
            }
          }
        }
      }

      return newVersion;
    });
  },

  // --- SECTIONS CRUD ---

  async listSections(questionnaireId) {
    const version = await questionnaireModel.findVersionById(questionnaireId);
    if (!version) throw new NotFoundError('Questionnaire version not found');
    return questionnaireModel.findSections(questionnaireId);
  },

  async createSection(questionnaireId, data) {
    const version = await questionnaireModel.findVersionById(questionnaireId);
    this.assertDraft(version);

    return questionnaireModel.createSection({
      questionnaire_version_id: questionnaireId,
      code: data.code,
      title: data.title,
      display_order: data.displayOrder || 0,
      visibility_rule_id: data.visibilityRuleId || null,
    });
  },

  async updateSection(questionnaireId, sectionId, data) {
    const version = await questionnaireModel.findVersionById(questionnaireId);
    this.assertDraft(version);

    const section = await questionnaireModel.findSectionById(sectionId);
    if (!section || section.questionnaire_version_id !== questionnaireId) {
      throw new NotFoundError('Section not found in this questionnaire');
    }

    const payload = {};
    if (data.code !== undefined) payload.code = data.code;
    if (data.title !== undefined) payload.title = data.title;
    if (data.displayOrder !== undefined) payload.display_order = data.displayOrder;
    if (data.visibilityRuleId !== undefined) payload.visibility_rule_id = data.visibilityRuleId;

    return questionnaireModel.updateSection(sectionId, payload);
  },

  async deleteSection(questionnaireId, sectionId) {
    const version = await questionnaireModel.findVersionById(questionnaireId);
    this.assertDraft(version);

    const section = await questionnaireModel.findSectionById(sectionId);
    if (!section || section.questionnaire_version_id !== questionnaireId) {
      throw new NotFoundError('Section not found in this questionnaire');
    }

    await questionnaireModel.deleteSection(sectionId);
  },

  async reorderSections(questionnaireId, items) {
    const version = await questionnaireModel.findVersionById(questionnaireId);
    this.assertDraft(version);

    const formattedItems = items.map((i) => ({
      id: i.id,
      display_order: i.displayOrder,
    }));
    await questionnaireModel.reorderSections(questionnaireId, formattedItems);
  },

  // --- QUESTIONS CRUD ---

  async listQuestions(questionnaireId, sectionId = null) {
    const version = await questionnaireModel.findVersionById(questionnaireId);
    if (!version) throw new NotFoundError('Questionnaire version not found');
    return questionnaireModel.findQuestions(questionnaireId, sectionId);
  },

  async getQuestion(questionnaireId, questionId) {
    const question = await questionnaireModel.findQuestionById(questionId);
    if (!question || question.questionnaire_version_id !== questionnaireId) {
      throw new NotFoundError('Question not found in this questionnaire');
    }

    const [options, translations] = await Promise.all([
      questionnaireModel.findOptions(questionId),
      questionnaireModel.findTranslations('QUESTION', questionId),
    ]);

    return {
      ...question,
      options,
      translations,
    };
  },

  async createQuestion(questionnaireId, data) {
    const version = await questionnaireModel.findVersionById(questionnaireId);
    this.assertDraft(version);

    return db.transaction(async (trx) => {
      const payload = {
        questionnaire_version_id: questionnaireId,
        section_id: data.sectionId || null,
        question_no: data.questionNo,
        question_tag: data.questionTag,
        question_type: data.questionType,
        question_text: data.questionText,
        help_text: data.helpText || null,
        is_required: data.isRequired || false,
        display_order: data.displayOrder || 0,
        input_tag: data.inputTag || null,
        output_tag: data.outputTag || null,
        validation_tag: data.validationTag || null,
        actual_tag: data.actualTag || null,
        option_source: data.optionSource || 'STATIC',
        evidence_policy: data.evidencePolicy || null,
        validation_rules: data.validationRules || {},
        metadata: data.metadata || {},
        is_enabled: data.isEnabled !== undefined ? data.isEnabled : true,
      };

      const [question] = await trx('questions').insert(payload).returning('*');

      if (data.options && Array.isArray(data.options) && data.options.length > 0) {
        const optionRows = data.options.map((opt, idx) => ({
          question_id: question.id,
          option_code: opt.optionCode,
          label: opt.label,
          value: opt.value,
          display_order: opt.displayOrder !== undefined ? opt.displayOrder : idx,
          metadata: opt.metadata || {},
          is_active: opt.isActive !== undefined ? opt.isActive : true,
        }));
        await trx('question_options').insert(optionRows);
      }

      return question;
    });
  },

  async updateQuestion(questionnaireId, questionId, data) {
    const version = await questionnaireModel.findVersionById(questionnaireId);
    this.assertDraft(version);

    const question = await questionnaireModel.findQuestionById(questionId);
    if (!question || question.questionnaire_version_id !== questionnaireId) {
      throw new NotFoundError('Question not found in this questionnaire');
    }

    const payload = {};
    if (data.sectionId !== undefined) payload.section_id = data.sectionId;
    if (data.questionNo !== undefined) payload.question_no = data.questionNo;
    if (data.questionTag !== undefined) payload.question_tag = data.questionTag;
    if (data.questionType !== undefined) payload.question_type = data.questionType;
    if (data.questionText !== undefined) payload.question_text = data.questionText;
    if (data.helpText !== undefined) payload.help_text = data.helpText;
    if (data.isRequired !== undefined) payload.is_required = data.isRequired;
    if (data.displayOrder !== undefined) payload.display_order = data.displayOrder;
    if (data.inputTag !== undefined) payload.input_tag = data.inputTag;
    if (data.outputTag !== undefined) payload.output_tag = data.outputTag;
    if (data.validationTag !== undefined) payload.validation_tag = data.validationTag;
    if (data.actualTag !== undefined) payload.actual_tag = data.actualTag;
    if (data.optionSource !== undefined) payload.option_source = data.optionSource;
    if (data.evidencePolicy !== undefined) payload.evidence_policy = data.evidencePolicy;
    if (data.validationRules !== undefined) payload.validation_rules = data.validationRules;
    if (data.metadata !== undefined) payload.metadata = data.metadata;
    if (data.isEnabled !== undefined) payload.is_enabled = data.isEnabled;

    return questionnaireModel.updateQuestion(questionId, payload);
  },

  async deleteQuestion(questionnaireId, questionId) {
    const version = await questionnaireModel.findVersionById(questionnaireId);
    this.assertDraft(version);

    const question = await questionnaireModel.findQuestionById(questionId);
    if (!question || question.questionnaire_version_id !== questionnaireId) {
      throw new NotFoundError('Question not found in this questionnaire');
    }

    await questionnaireModel.deleteQuestion(questionId);
  },

  async reorderQuestions(questionnaireId, items) {
    const version = await questionnaireModel.findVersionById(questionnaireId);
    this.assertDraft(version);

    const formattedItems = items.map((i) => ({
      id: i.id,
      display_order: i.displayOrder,
      section_id: i.sectionId,
    }));
    await questionnaireModel.reorderQuestions(questionnaireId, formattedItems);
  },

  // --- OPTIONS CRUD ---

  async addOption(questionnaireId, questionId, data) {
    const version = await questionnaireModel.findVersionById(questionnaireId);
    this.assertDraft(version);

    const question = await questionnaireModel.findQuestionById(questionId);
    if (!question || question.questionnaire_version_id !== questionnaireId) {
      throw new NotFoundError('Question not found in this questionnaire');
    }

    return questionnaireModel.createOption({
      question_id: questionId,
      option_code: data.optionCode,
      label: data.label,
      value: data.value,
      display_order: data.displayOrder || 0,
      metadata: data.metadata || {},
      is_active: data.isActive !== undefined ? data.isActive : true,
    });
  },

  async updateOption(questionnaireId, questionId, optionId, data) {
    const version = await questionnaireModel.findVersionById(questionnaireId);
    this.assertDraft(version);

    const option = await questionnaireModel.findOptionById(optionId);
    if (!option || option.question_id !== questionId) {
      throw new NotFoundError('Option not found for this question');
    }

    const payload = {};
    if (data.optionCode !== undefined) payload.option_code = data.optionCode;
    if (data.label !== undefined) payload.label = data.label;
    if (data.value !== undefined) payload.value = data.value;
    if (data.displayOrder !== undefined) payload.display_order = data.displayOrder;
    if (data.metadata !== undefined) payload.metadata = data.metadata;
    if (data.isActive !== undefined) payload.is_active = data.isActive;

    return questionnaireModel.updateOption(optionId, payload);
  },

  async deleteOption(questionnaireId, questionId, optionId) {
    const version = await questionnaireModel.findVersionById(questionnaireId);
    this.assertDraft(version);

    const option = await questionnaireModel.findOptionById(optionId);
    if (!option || option.question_id !== questionId) {
      throw new NotFoundError('Option not found for this question');
    }

    await questionnaireModel.deleteOption(optionId);
  },

  async reorderOptions(questionnaireId, questionId, items) {
    const version = await questionnaireModel.findVersionById(questionnaireId);
    this.assertDraft(version);

    const formattedItems = items.map((i) => ({
      id: i.id,
      display_order: i.displayOrder,
    }));
    await questionnaireModel.reorderOptions(questionId, formattedItems);
  },

  async updateQuestionOptions(questionnaireId, questionId, options) {
    const version = await questionnaireModel.findVersionById(questionnaireId);
    this.assertDraft(version);

    const question = await questionnaireModel.findQuestionById(questionId);
    if (!question || question.questionnaire_version_id !== questionnaireId) {
      throw new NotFoundError('Question not found in this questionnaire');
    }

    return db.transaction(async (trx) => {
      await trx('question_options').where({ question_id: questionId }).del();

      const createdOptions = [];
      for (let i = 0; i < options.length; i++) {
        const opt = options[i];
        const [created] = await trx('question_options')
          .insert({
            question_id: questionId,
            option_code: opt.optionCode || opt.code || `OPT_${i + 1}`,
            label: opt.label,
            value: opt.value !== undefined ? opt.value : opt.optionCode || opt.label,
            display_order: opt.displayOrder !== undefined ? opt.displayOrder : i + 1,
            metadata: opt.metadata || {},
            is_active: opt.isActive !== undefined ? opt.isActive : true,
          })
          .returning('*');
        createdOptions.push(created);
      }
      return createdOptions;
    });
  },

  // --- TRANSLATIONS ---

  async getTranslations(entityType, entityId) {
    return questionnaireModel.findTranslations(entityType, entityId);
  },

  async saveTranslation(data) {
    return questionnaireModel.upsertTranslation({
      entity_type: data.entityType,
      entity_id: data.entityId,
      language_code: data.languageCode,
      field_name: data.fieldName,
      localized_text: data.localizedText,
    });
  },

  async deleteTranslation(id) {
    const translation = await questionnaireModel.findTranslationById(id);
    if (!translation) {
      throw new NotFoundError('Translation not found');
    }
    await questionnaireModel.deleteTranslation(id);
  },

  // --- EXCEL IMPORT / EXPORT ---

  /**
   * Export questionnaire to Excel buffer
   * @param {string} id
   * @returns {Promise<{ buffer: Buffer, filename: string }>}
   */
  async exportToExcel(id) {
    const data = await this.getFullQuestionnaire(id);

    // Sheet 1: Metadata
    const metaRows = [
      { Key: 'Questionnaire ID', Value: data.id },
      { Key: 'Name', Value: data.name },
      { Key: 'Module', Value: data.module },
      { Key: 'Version', Value: data.version_number },
      { Key: 'Status', Value: data.status },
      { Key: 'Checksum', Value: data.checksum || '' },
      { Key: 'Exported At', Value: new Date().toISOString() },
    ];
    const metaSheet = xlsx.utils.json_to_sheet(metaRows);

    // Sheet 2: Sections
    const sectionRows = data.sections.map((s) => ({
      Code: s.code,
      Title: s.title,
      DisplayOrder: s.display_order,
    }));
    const sectionsSheet = xlsx.utils.json_to_sheet(sectionRows);

    // Sheet 3: Questions & Options
    const questionRows = [];
    const allQuestions = [];
    for (const sec of data.sections) {
      for (const q of sec.questions) {
        allQuestions.push({ ...q, section_code: sec.code });
      }
    }
    for (const uq of data.unsectionedQuestions) {
      allQuestions.push({ ...uq, section_code: '' });
    }

    for (const q of allQuestions) {
      if (q.options && q.options.length > 0) {
        for (const opt of q.options) {
          questionRows.push({
            SectionCode: q.section_code,
            QuestionNo: q.question_no,
            QuestionTag: q.question_tag,
            QuestionType: q.question_type,
            QuestionText: q.question_text,
            HelpText: q.help_text || '',
            IsRequired: q.is_required ? 'YES' : 'NO',
            OptionSource: q.option_source,
            OptionCode: opt.option_code,
            OptionLabel: opt.label,
            OptionValue: opt.value,
          });
        }
      } else {
        questionRows.push({
          SectionCode: q.section_code,
          QuestionNo: q.question_no,
          QuestionTag: q.question_tag,
          QuestionType: q.question_type,
          QuestionText: q.question_text,
          HelpText: q.help_text || '',
          IsRequired: q.is_required ? 'YES' : 'NO',
          OptionSource: q.option_source,
          OptionCode: '',
          OptionLabel: '',
          OptionValue: '',
        });
      }
    }
    const questionsSheet = xlsx.utils.json_to_sheet(questionRows);

    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, metaSheet, 'Overview');
    xlsx.utils.book_append_sheet(workbook, sectionsSheet, 'Sections');
    xlsx.utils.book_append_sheet(workbook, questionsSheet, 'Questions');

    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    const filename = `Questionnaire_${data.module}_v${data.version_number}.xlsx`;

    return { buffer, filename };
  },

  /**
   * Import questions and sections from Excel / CSV buffer into a draft questionnaire
   * @param {string} id - Questionnaire ID (or null to create a new draft)
   * @param {Buffer} buffer - File buffer
   * @param {object} [extraMeta] - Optional metadata (name, projectId, module)
   * @returns {Promise<{ questionnaireId: string, importedSections: number, importedQuestions: number, importedOptions: number }>}
   */
  async importFromExcel(id, buffer, extraMeta = {}) {
    let targetVersion = null;
    if (id && id !== 'new') {
      try {
        targetVersion = await questionnaireModel.findVersionById(id);
      } catch (e) {
        targetVersion = mockStore.findById('questionnaire_versions', id);
      }
    }

    // Auto-create a draft version if none specified
    if (!targetVersion) {
      const defaultProjectId = extraMeta.projectId || '11111111-1111-1111-1111-111111110001';
      const defaultModule = extraMeta.module || 'CATI';
      const defaultName = extraMeta.name || 'Imported Election Questionnaire';
      targetVersion = await this.createVersion({
        projectId: defaultProjectId,
        module: defaultModule,
        name: defaultName,
      }, extraMeta.userId || null);
      id = targetVersion.id;
    }

    // Check if uploaded buffer is a PDF or TVC Questionnaire document
    let docParsed = null;
    try {
      docParsed = await parseQuestionnaireDocument(buffer, extraMeta);
    } catch (parseErr) {
      console.warn('[importFromExcel] Document parse note:', parseErr.message);
    }

    if (docParsed && docParsed.isTvc) {
      if (targetVersion) {
        try {
          await questionnaireModel.updateVersion(id, {
            module: 'TVC',
            name: extraMeta.name && !extraMeta.name.includes('Imported') ? extraMeta.name : CANONICAL_TVC_DATA.title,
          });
        } catch (_) {}
      }

      const sectionsMap = docParsed.sectionsMap;
      const questionsList = docParsed.questionsList;

      // Proceed directly to database persistence
      let importedSections = 0;
      let importedQuestions = 0;
      let importedOptions = 0;

      const saveToDatabase = async () => {
        return db.transaction(async (trx) => {
          await trx('questions').where({ questionnaire_version_id: id }).delete();
          await trx('sections').where({ questionnaire_version_id: id }).delete();

          const sectionsToInsert = [];
          const sectionKeys = [];
          for (const [key, sec] of sectionsMap.entries()) {
            sectionsToInsert.push({
              questionnaire_version_id: id,
              code: sec.code,
              title: sec.title,
              display_order: sec.displayOrder,
            });
            sectionKeys.push(key);
          }

          let createdSections = [];
          if (sectionsToInsert.length > 0) {
            createdSections = await trx('sections').insert(sectionsToInsert).returning('*');
          }

          const sectionIdMap = new Map();
          for (let i = 0; i < createdSections.length; i++) {
            sectionIdMap.set(sectionKeys[i], createdSections[i].id);
          }
          importedSections = createdSections.length;

          const questionsToInsert = [];
          const questionOptionsMap = [];

          for (const q of questionsList) {
            const sectionId = sectionIdMap.get(q.pageId) || createdSections[0].id;
            questionsToInsert.push({
              questionnaire_version_id: id,
              section_id: sectionId,
              question_no: q.questionNo,
              question_tag: q.questionTag,
              question_type: q.questionType,
              question_text: q.questionText,
              is_required: q.isRequired,
              display_order: q.displayOrder,
              metadata: JSON.stringify(q.metadata || {}),
            });
            questionOptionsMap.push(q.options || []);
          }

          let createdQuestions = [];
          if (questionsToInsert.length > 0) {
            createdQuestions = await trx('questions').insert(questionsToInsert).returning('*');
          }
          importedQuestions = createdQuestions.length;

          const allOptionsToInsert = [];
          for (let i = 0; i < createdQuestions.length; i++) {
            const qId = createdQuestions[i].id;
            const opts = questionOptionsMap[i] || [];
            for (let oIdx = 0; oIdx < opts.length; oIdx++) {
              const opt = opts[oIdx];
              allOptionsToInsert.push({
                question_id: qId,
                option_code: opt.optionCode,
                label: opt.label,
                value: opt.value,
                display_order: opt.displayOrder,
                metadata: JSON.stringify(opt.metadata || {}),
              });
            }
          }

          const CHUNK_SIZE = 100;
          for (let i = 0; i < allOptionsToInsert.length; i += CHUNK_SIZE) {
            const chunk = allOptionsToInsert.slice(i, i + CHUNK_SIZE);
            if (chunk.length > 0) {
              await trx('question_options').insert(chunk);
            }
          }
          importedOptions = allOptionsToInsert.length;

          return { questionnaireId: id, importedSections, importedQuestions, importedOptions, module: 'TVC' };
        });
      };

      const saveToMockStore = () => {
        const sectionIdMap = new Map();
        for (const [key, sec] of sectionsMap.entries()) {
          let existing = mockStore.data.sections.find(
            (s) => s.questionnaire_version_id === id && s.code === sec.code
          );
          if (!existing) {
            existing = mockStore.insert('sections', {
              questionnaire_version_id: id,
              code: sec.code,
              title: sec.title,
              display_order: sec.displayOrder,
            });
            importedSections++;
          }
          sectionIdMap.set(key, existing.id);
        }

        for (const q of questionsList) {
          const sectionId = sectionIdMap.get(q.pageId) || null;
          let existingQ = mockStore.data.questions.find(
            (item) => item.questionnaire_version_id === id && item.question_tag === q.questionTag
          );
          let qId;
          if (existingQ) {
            qId = existingQ.id;
            mockStore.update('questions', qId, {
              section_id: sectionId,
              question_no: q.questionNo,
              question_text: q.questionText,
              question_type: q.questionType,
              metadata: JSON.stringify(q.metadata),
            });
          } else {
            const newQ = mockStore.insert('questions', {
              questionnaire_version_id: id,
              section_id: sectionId,
              question_no: q.questionNo,
              question_tag: q.questionTag,
              question_type: q.questionType,
              question_text: q.questionText,
              is_required: q.isRequired,
              display_order: q.displayOrder,
              metadata: JSON.stringify(q.metadata),
            });
            qId = newQ.id;
            importedQuestions++;
          }

          for (const opt of q.options) {
            const existingOpt = mockStore.data.question_options.find(
              (o) => o.question_id === qId && o.option_code === opt.optionCode
            );
            if (!existingOpt) {
              mockStore.insert('question_options', {
                question_id: qId,
                option_code: opt.optionCode,
                label: opt.label,
                value: opt.value,
                display_order: opt.displayOrder,
                metadata: JSON.stringify(opt.metadata),
              });
              importedOptions++;
            }
          }
        }

        return { questionnaireId: id, importedSections, importedQuestions, importedOptions, module: 'TVC' };
      };

      try {
        return await saveToDatabase();
      } catch (dbErr) {
        console.error('[importFromExcel:TVC] Database save error, falling back to mockStore:', dbErr);
        return saveToMockStore();
      }
    }

    let isColumnMapping = false;
    let mappingRows = [];
    let masterSheetName = null;
    let workbook = null;

    // Check if uploaded buffer is direct JSON format (e.g. {"Column Mapping": [...]})
    let isJson = false;
    try {
      const text = buffer.toString('utf-8').trim();
      if (text.startsWith('{') || text.startsWith('[')) {
        const parsed = JSON.parse(text);
        const list = Array.isArray(parsed)
          ? parsed
          : (parsed['Column Mapping'] || parsed['column_mapping'] || parsed.questions || Object.values(parsed)[0]);
        if (Array.isArray(list) && list.length > 0) {
          isJson = true;
          const firstItem = list[0];
          const keys = Object.keys(firstItem);
          const isHeaderRow = keys.some((k) => {
            const val = String(firstItem[k] || '').toLowerCase();
            return val.includes('question text') || val === 'tag' || val.includes('validation') || val.includes('audited');
          });

          if (isHeaderRow) {
            const fieldMap = {};
            keys.forEach((k) => {
              fieldMap[k] = String(firstItem[k] || '').trim();
            });
            for (let i = 1; i < list.length; i++) {
              const r = list[i];
              const newRow = {};
              for (const k of keys) {
                const standardName = fieldMap[k];
                if (standardName && r[k] !== undefined) {
                  newRow[standardName] = r[k];
                }
              }
              mappingRows.push(newRow);
            }
          } else {
            mappingRows = list;
          }
          isColumnMapping = true;
        }
      }
    } catch (_) {}

    if (!isJson) {
      workbook = xlsx.read(buffer, { type: 'buffer' });

      // 1. Detect sheets in workbook
      const mappingSheetName = workbook.SheetNames.find((s) => {
        const lower = s.toLowerCase().trim();
        return lower.includes('mapping') || lower.includes('column map') || lower === 'map';
      });

      masterSheetName = workbook.SheetNames.find((s) => {
        const lower = s.toLowerCase().trim();
        return (
          s !== mappingSheetName &&
          !lower.includes('old') &&
          !lower.includes('sheet5') &&
          !lower.includes('inputoutput')
        );
      });

      if (mappingSheetName) {
        mappingRows = xlsx.utils.sheet_to_json(workbook.Sheets[mappingSheetName], { defval: '' });
        isColumnMapping = mappingRows.length > 0;
      } else {
        const firstSheetRows = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' });
        const sample = firstSheetRows[0] || {};
        if (
          'Input Column from DIU' in sample ||
          'Question Validation Column' in sample ||
          'Answer  Validation Column' in sample ||
          'Answer Validation Column' in sample ||
          'To Be Audited' in sample ||
          'To be audited' in sample
        ) {
          isColumnMapping = true;
          mappingRows = firstSheetRows;
        }
      }
    }

    const sectionsMap = new Map();
    const questionsList = [];
    const usedTags = new Set();

    if (isColumnMapping) {
      // Index options and metadata from master survey sheet if present
      const masterOptionsByTag = new Map();
      const masterMetaByTag = new Map();

      if (masterSheetName) {
        const masterRows = xlsx.utils.sheet_to_json(workbook.Sheets[masterSheetName], { defval: '' });
        for (const mRow of masterRows) {
          const tag = String(mRow['tag'] || '').trim();
          if (!tag) continue;

          if (!masterMetaByTag.has(tag)) {
            masterMetaByTag.set(tag, {
              pageId: mRow['Page ID'],
              questionNo: mRow['Question Number'],
              questionType: mRow['type'],
              skipToId: mRow['Skip To ID'],
              dropdownOptions: mRow['dropdown Options'],
            });
          }

          const optText = String(mRow['Option Text'] || '').trim();
          if (optText) {
            if (!masterOptionsByTag.has(tag)) masterOptionsByTag.set(tag, []);
            masterOptionsByTag.get(tag).push({
              optionCode: mRow['Party'] || mRow['English'] || optText,
              label: optText,
              value: mRow['Party'] || mRow['English'] || optText,
              metadata: {
                party: mRow['Party'] || null,
                english: mRow['English'] || null,
                hindi: mRow['Hindi'] || null,
                regional: mRow['Regional Language'] || null,
                imageUrl: mRow['Image URL'] || null,
                alliance: mRow['Alliance'] || null,
              },
            });
          }
        }
      }

      const pageTitles = {
        '691d6ca8977711340004743d': 'Demographics & Voter Eligibility',
        '691d6ca997771134000474f6': 'Governance & Public Utilities Assessment',
        '691d6ca99777113400047548': 'Political Sentiment & Voting Intentions',
        '691d6ca99777113400047573': 'Leadership & Satisfaction Metrics',
        '691d84189777113400047760': 'Electoral Issues & Candidate Preferences',
        '691d8763977711340004778d': 'Voting Behavior & History',
        '691d8b99e8205ab68656a247': 'Past Government & Party Perception',
        '691d8e761e0127de4a4d4182': 'Future Prospects & Campaign Feedback',
      };

      const qcAuditTags = new Set([
        'response_style',
        'mimicry',
        'inconsistent_gender',
        'respondent_age',
        'voice_of_respondents',
        'rapid_responses',
        'group_interview',
        'sound',
        'rapid_questionning',
        'convincing_skills',
        'red_flag',
        'fraud_interviews',
        'respondent_type',
        'audio_mute',
        'candidate_managed_fraud',
        'compromise_party',
        'actual_voting_intention',
        'remarks',
        'Remarks',
      ]);

      let qIndex = 0;
      for (const row of mappingRows) {
        const rawTag = String(row['tag'] || row['Tag'] || '').trim();
        const rawQText = String(row['Question Text'] || row['Question Text '] || '').trim();
        if (!rawTag && !rawQText) continue;

        qIndex++;
        let tag = rawTag || `Q_${qIndex}`;
        if (usedTags.has(tag)) {
          let c = 2;
          while (usedTags.has(`${tag}_${c}`)) c++;
          tag = `${tag}_${c}`;
        }
        usedTags.add(tag);

        const masterMeta = masterMetaByTag.get(tag) || {};
        const masterOpts = masterOptionsByTag.get(tag) || [];

        // Determine Section
        let secKey = 'SEC_QC_AUDIT';
        let secTitle = 'Quality Control & Super Audit Verification';

        if (masterMeta.pageId) {
          secKey = masterMeta.pageId;
          secTitle = pageTitles[secKey] || `Section ${sectionsMap.size + 1}`;
        } else if (tag.startsWith('cm_p') || tag.startsWith('state_p')) {
          secKey = '691d6ca997771134000474f6';
          secTitle = pageTitles[secKey];
        } else if (qcAuditTags.has(tag)) {
          secKey = 'SEC_QC_AUDIT';
          secTitle = 'Quality Control & Super Audit Verification';
        } else {
          secKey = 'SEC_GENERAL';
          secTitle = 'Demographics & Survey Verification';
        }

        if (!sectionsMap.has(secKey)) {
          const displayOrder = sectionsMap.size + 1;
          sectionsMap.set(secKey, {
            code: `SEC_${displayOrder}`,
            title: secTitle,
            displayOrder,
          });
        }

        const rawQValOpts = String(row['Question Validation Column Options'] || '').trim();
        const rawAValOpts = String(
          row['Answer  Validation Column Options'] ||
          row['Answer Validation Column Options'] ||
          row['Answer  Validation Options 1'] ||
          row['Answer Validation Options 1'] ||
          ''
        ).trim();

        const qValList = smartSplitOptions(rawQValOpts);
        const aValList = smartSplitOptions(rawAValOpts);

        // Build options: prioritize master options, fallback to validation choices
        let options = [];
        const usedOptCodes = new Set();

        if (masterOpts.length > 0) {
          options = masterOpts.map((mo, oIdx) => {
            let optCode = mo.optionCode || `OPT_${oIdx + 1}`;
            if (usedOptCodes.has(optCode)) optCode = `${optCode}_${oIdx + 1}`;
            usedOptCodes.add(optCode);
            return {
              optionCode: optCode,
              label: mo.label,
              value: mo.value,
              displayOrder: oIdx + 1,
              metadata: mo.metadata || {},
            };
          });
        } else if (aValList.length > 0 && !tag.includes('phone') && !tag.includes('name') && tag !== 'introduction') {
          options = aValList.map((txt, oIdx) => {
            let optCode = `OPT_${oIdx + 1}`;
            return {
              optionCode: optCode,
              label: txt,
              value: txt,
              displayOrder: oIdx + 1,
              metadata: {},
            };
          });
        }

        const qType = options.length > 0 ? 'SINGLE_SELECT' : 'TEXT';
        const rawAudit = String(row['To Be Audited'] || row['To be audited'] || '').trim();
        const toBeAudited = rawAudit.toLowerCase() === 'yes';
        const onlyAudited = extraMeta.onlyAudited !== undefined ? Boolean(extraMeta.onlyAudited) : true;

        if (onlyAudited && (row['To Be Audited'] !== undefined || row['To be audited'] !== undefined) && !toBeAudited) {
          continue;
        }

        const q = {
          id: `Q_${qIndex}`,
          pageId: secKey,
          questionNo: String(masterMeta.questionNo || qIndex),
          questionTag: tag,
          questionType: qType,
          questionText: rawQText || tag,
          isRequired: String(row['Question Visible'] || '1') === '1',
          displayOrder: qIndex,
          metadata: {
            toBeAudited,
            inputColumn: row['Input Column from DIU'] || null,
            questionInputFromDiu: row['Question Input From DIU'] || null,
            questionValidationColumn: row['Question Validation Column'] || null,
            answerValidationColumn: row['Answer  Validation Column'] || row['Answer Validation Column'] || null,
            actualColumn: row['Actual Column'] || null,
            questionValidationOptions: qValList,
            answerValidationOptions: aValList,
            condition: row['Condition'] || null,
            superAuditCondition: row['Super Audit Condition'] || null,
            pageId: secKey,
          },
          options,
        };

        questionsList.push(q);
      }
    } else {
      // Fallback: Election format or Standard template
      const questionsSheetName =
        workbook.SheetNames.find((s) => {
          const lower = s.toLowerCase();
          return lower.includes('question') && !lower.includes('mapping');
        }) || workbook.SheetNames[0];

      const rawRows = xlsx.utils.sheet_to_json(workbook.Sheets[questionsSheetName], { defval: '' });
      if (!rawRows || rawRows.length === 0) {
        throw new ValidationError('Uploaded file contains no valid rows.');
      }

      const sampleRow = rawRows[0] || {};
      const isElectionFormat =
        'Question ID' in sampleRow ||
        'Page ID' in sampleRow ||
        'Regional Language' in sampleRow ||
        'Party' in sampleRow ||
        'Question Text' in sampleRow;

      if (isElectionFormat) {
        let currentQuestion = null;
        let qIndex = 0;

        for (let rIdx = 0; rIdx < rawRows.length; rIdx++) {
          const row = rawRows[rIdx];
          const rawQId = String(row['Question ID'] || row['Question ID '] || '').trim();
          const rawQText = String(row['Question Text'] || row['Question Text '] || '').trim();
          const rawOptText = String(row['Option Text'] || row['Option Text '] || '').trim();
          const rawTag = String(row['tag'] || row['Tag'] || '').trim();
          const rawPageId = String(row['Page ID'] || row['Page ID '] || 'GENERAL').trim();

          if (rawQId || (rawQText && (!currentQuestion || rawQText !== currentQuestion.questionText))) {
            qIndex++;
            if (!sectionsMap.has(rawPageId)) {
              const secIndex = sectionsMap.size + 1;
              const pageTitle = rawPageId.includes('0004743d')
                ? 'Demographics & Voter Eligibility'
                : rawPageId.includes('00047548')
                ? 'Political Sentiment & Voting Intentions'
                : `Section ${secIndex}`;

              sectionsMap.set(rawPageId, {
                code: `SEC_${secIndex}`,
                title: pageTitle,
                displayOrder: secIndex,
              });
            }

            let tag = rawTag || `Q_${qIndex}`;
            if (usedTags.has(tag)) {
              let c = 2;
              while (usedTags.has(`${tag}_${c}`)) c++;
              tag = `${tag}_${c}`;
            }
            usedTags.add(tag);

            const qTypeRaw = String(row['type'] || 'multiple').toLowerCase();
            const qType = qTypeRaw === 'subjective' ? 'TEXT' : 'SINGLE_SELECT';

            currentQuestion = {
              id: rawQId || `Q_${qIndex}`,
              pageId: rawPageId,
              questionNo: String(row['Question Number'] || qIndex),
              questionTag: tag,
              questionType: qType,
              questionText: rawQText || tag,
              isRequired: true,
              displayOrder: qIndex,
              metadata: {
                pageId: rawPageId,
                toBeAudited: String(row['To Be Audited']).toLowerCase() === 'yes' || String(row['To Be Audited']) === '1',
                inputColumn: row['Input Column from DIU'] || null,
                questionInputFromDiu: row['Question Input From DIU'] || null,
                questionValidationColumn: row['Question Validation Column'] || null,
                answerValidationColumn: row['Answer  Validation Column'] || row['Answer Validation Column'] || null,
                actualColumn: row['Actual Column'] || null,
                dropdownOptions: row['dropdown Options'] || null,
                skipToId: row['Skip To ID'] || null,
              },
              options: [],
              usedOptCodes: new Set(),
            };
            questionsList.push(currentQuestion);
          }

          if (currentQuestion && rawOptText) {
            const splitOpts = smartSplitOptions(rawOptText);
            const optHindi = String(row['Hindi'] || '').trim();
            const optEnglish = String(row['English'] || '').trim();
            const optRegional = String(row['Regional Language'] || '').trim();
            const party = String(row['Party'] || '').trim();
            const imageUrl = String(row['Image URL'] || '').trim();
            const alliance = String(row['Alliance'] || '').trim();

            for (const singleOpt of splitOpts) {
              let optCode = (splitOpts.length === 1 && party) ? party : `OPT_${currentQuestion.options.length + 1}`;
              if (currentQuestion.usedOptCodes.has(optCode)) {
                optCode = `${optCode}_${currentQuestion.options.length + 1}`;
              }
              currentQuestion.usedOptCodes.add(optCode);

              currentQuestion.options.push({
                optionCode: optCode,
                label: singleOpt,
                value: (splitOpts.length === 1 && (party || optEnglish)) ? (party || optEnglish) : singleOpt,
                displayOrder: currentQuestion.options.length + 1,
                metadata: {
                  party: party || null,
                  imageUrl: imageUrl || null,
                  hindi: optHindi || null,
                  english: optEnglish || null,
                  regional: optRegional || null,
                  alliance: alliance || null,
                },
              });
            }
          }
        }
      } else {
        // Universal Survey / Tabular Sheet Parser
        let currentQuestion = null;
        let qCount = 0;

        for (let rIdx = 0; rIdx < rawRows.length; rIdx++) {
          const row = rawRows[rIdx];
          const rowKeys = Object.keys(row);
          const findVal = (keywords) => {
            for (const kw of keywords) {
              const cleanKw = kw.toLowerCase().replace(/[^a-z0-9]/g, '');
              const foundKey = rowKeys.find(
                (k) => k.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanKw ||
                       k.toLowerCase().replace(/[^a-z0-9]/g, '').includes(cleanKw)
              );
              if (foundKey && String(row[foundKey] || '').trim()) {
                return String(row[foundKey]).trim();
              }
            }
            return '';
          };

          const rawQText = findVal(['questiontext', 'question', 'qtext', 'prompt', 'label', 'questiontitle', 'surveyquestion', 'text', 'title']);
          let rawTag = findVal(['questiontag', 'tag', 'questioncode', 'code', 'variable', 'var', 'key']);
          const rawQNo = findVal(['questionno', 'questionnumber', 'sn', 'sl', 'qno', 'no', 'id']);
          const rawOptText = findVal(['optiontext', 'options', 'choices', 'answers', 'optionlabel', 'dropdownoptions']);
          const rawQType = findVal(['questiontype', 'type', 'format']);

          // Multi-column options: Option 1, Option 2, Option 3...
          const multiOptList = [];
          rowKeys.forEach((k) => {
            const clean = k.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (
              clean.match(/^(option|opt|choice|ans|answer)[0-9a-z]+$/) ||
              (clean.startsWith('option') && clean !== 'optiontext' && clean !== 'options' && clean !== 'optionlabel') ||
              (clean.startsWith('choice') && clean !== 'choices')
            ) {
              const v = String(row[k] || '').trim();
              if (v) {
                const splits = smartSplitOptions(v);
                multiOptList.push(...splits);
              }
            }
          });

          if (rawQText && (!currentQuestion || rawQText !== currentQuestion.questionText)) {
            qCount++;
            if (!rawTag) rawTag = rawQNo ? `Q_${rawQNo}` : `Q_${qCount}`;
            let tag = rawTag;
            if (usedTags.has(tag)) {
              let c = 2;
              while (usedTags.has(`${tag}_${c}`)) c++;
              tag = `${tag}_${c}`;
            }
            usedTags.add(tag);

            const secCode = findVal(['sectioncode', 'section', 'category', 'module']) || 'SEC_GENERAL';
            if (!sectionsMap.has(secCode)) {
              const secNum = sectionsMap.size + 1;
              sectionsMap.set(secCode, {
                code: `SEC_${secNum}`,
                title: secCode === 'SEC_GENERAL' ? 'General Survey Questions' : secCode,
                displayOrder: secNum,
              });
            }

            const initialOptions = [];
            if (multiOptList.length > 0) {
              multiOptList.forEach((opt, oIdx) => {
                initialOptions.push({
                  optionCode: `OPT_${oIdx + 1}`,
                  label: opt,
                  value: opt,
                  displayOrder: oIdx + 1,
                  metadata: {},
                });
              });
            } else if (rawOptText) {
              const lines = smartSplitOptions(rawOptText);
              lines.forEach((opt, oIdx) => {
                initialOptions.push({
                  optionCode: `OPT_${oIdx + 1}`,
                  label: opt,
                  value: opt,
                  displayOrder: oIdx + 1,
                  metadata: {},
                });
              });
            }

            let type = 'SINGLE_SELECT';
            if (rawQType.toLowerCase().includes('multi') || rawQType.toLowerCase().includes('check')) type = 'MULTI_SELECT';
            else if (rawQType.toLowerCase().includes('text') || rawQType.toLowerCase().includes('subjective')) type = 'TEXT';
            else if (rawQType.toLowerCase().includes('num') || rawQType.toLowerCase().includes('age')) type = 'NUMBER';
            else if (initialOptions.length === 0) type = 'TEXT';

            currentQuestion = {
              pageId: secCode,
              questionNo: rawQNo || String(qCount),
              questionTag: tag,
              questionType: type,
              questionText: rawQText,
              helpText: findVal(['helptext', 'hint', 'instruction', 'description']),
              isRequired: true,
              displayOrder: qCount,
              metadata: {},
              options: initialOptions,
              usedOptCodes: new Set(initialOptions.map((o) => o.optionCode)),
            };
            questionsList.push(currentQuestion);
          } else if (currentQuestion && rawOptText) {
            // Multi-row option attachment
            const splitOpts = smartSplitOptions(rawOptText);
            for (const singleOpt of splitOpts) {
              if (!currentQuestion.options.some((o) => o.label === singleOpt)) {
                const optCode = `OPT_${currentQuestion.options.length + 1}`;
                currentQuestion.options.push({
                  optionCode: optCode,
                  label: singleOpt,
                  value: singleOpt,
                  displayOrder: currentQuestion.options.length + 1,
                  metadata: {},
                });
              }
            }
          }
        }
      }
    }

    // Persist into database using high-performance bulk multi-row insert
    let importedSections = 0;
    let importedQuestions = 0;
    let importedOptions = 0;

    const saveToDatabase = async () => {
      return db.transaction(async (trx) => {
        // Clear any previous draft contents for this version
        await trx('questions').where({ questionnaire_version_id: id }).delete();
        await trx('sections').where({ questionnaire_version_id: id }).delete();

        // 1. Bulk insert sections
        const sectionsToInsert = [];
        const sectionKeys = [];
        for (const [key, sec] of sectionsMap.entries()) {
          sectionsToInsert.push({
            questionnaire_version_id: id,
            code: sec.code,
            title: sec.title,
            display_order: sec.displayOrder,
          });
          sectionKeys.push(key);
        }

        let createdSections = [];
        if (sectionsToInsert.length > 0) {
          createdSections = await trx('sections').insert(sectionsToInsert).returning('*');
        } else {
          const [defaultSec] = await trx('sections').insert({
            questionnaire_version_id: id,
            code: 'SEC_1',
            title: 'General Questions',
            display_order: 1,
          }).returning('*');
          createdSections = [defaultSec];
          sectionKeys.push('GENERAL');
        }

        const sectionIdMap = new Map();
        for (let i = 0; i < createdSections.length; i++) {
          sectionIdMap.set(sectionKeys[i], createdSections[i].id);
        }
        importedSections = createdSections.length;

        // 2. Bulk insert questions
        const questionsToInsert = [];
        const questionOptionsMap = [];

        for (const q of questionsList) {
          const sectionId = sectionIdMap.get(q.pageId) || createdSections[0].id;
          questionsToInsert.push({
            questionnaire_version_id: id,
            section_id: sectionId,
            question_no: q.questionNo,
            question_tag: q.questionTag,
            question_type: q.questionType,
            question_text: q.questionText,
            is_required: q.isRequired,
            display_order: q.displayOrder,
            metadata: JSON.stringify(q.metadata || {}),
          });
          questionOptionsMap.push(q.options || []);
        }

        let createdQuestions = [];
        if (questionsToInsert.length > 0) {
          createdQuestions = await trx('questions').insert(questionsToInsert).returning('*');
        }
        importedQuestions = createdQuestions.length;

        // 3. Bulk insert options in chunks
        const allOptionsToInsert = [];
        for (let i = 0; i < createdQuestions.length; i++) {
          const qId = createdQuestions[i].id;
          const opts = questionOptionsMap[i] || [];
          for (let oIdx = 0; oIdx < opts.length; oIdx++) {
            const opt = opts[oIdx];
            allOptionsToInsert.push({
              question_id: qId,
              option_code: opt.optionCode,
              label: opt.label,
              value: opt.value,
              display_order: opt.displayOrder,
              metadata: JSON.stringify(opt.metadata || {}),
            });
          }
        }

        const CHUNK_SIZE = 100;
        for (let i = 0; i < allOptionsToInsert.length; i += CHUNK_SIZE) {
          const chunk = allOptionsToInsert.slice(i, i + CHUNK_SIZE);
          if (chunk.length > 0) {
            await trx('question_options').insert(chunk);
          }
        }
        importedOptions = allOptionsToInsert.length;

        return { questionnaireId: id, importedSections, importedQuestions, importedOptions };
      });
    };

    const saveToMockStore = () => {
      const sectionIdMap = new Map();
      for (const [key, sec] of sectionsMap.entries()) {
        let existing = mockStore.data.sections.find(
          (s) => s.questionnaire_version_id === id && s.code === sec.code
        );
        if (!existing) {
          existing = mockStore.insert('sections', {
            questionnaire_version_id: id,
            code: sec.code,
            title: sec.title,
            display_order: sec.displayOrder,
          });
          importedSections++;
        }
        sectionIdMap.set(key, existing.id);
      }

      for (const q of questionsList) {
        const sectionId = sectionIdMap.get(q.pageId) || null;
        let existingQ = mockStore.data.questions.find(
          (item) => item.questionnaire_version_id === id && item.question_tag === q.questionTag
        );
        let qId;
        if (existingQ) {
          qId = existingQ.id;
          mockStore.update('questions', qId, {
            section_id: sectionId,
            question_no: q.questionNo,
            question_text: q.questionText,
            question_type: q.questionType,
            metadata: JSON.stringify(q.metadata),
          });
        } else {
          const newQ = mockStore.insert('questions', {
            questionnaire_version_id: id,
            section_id: sectionId,
            question_no: q.questionNo,
            question_tag: q.questionTag,
            question_type: q.questionType,
            question_text: q.questionText,
            is_required: q.isRequired,
            display_order: q.displayOrder,
            metadata: JSON.stringify(q.metadata),
          });
          qId = newQ.id;
          importedQuestions++;
        }

        for (const opt of q.options) {
          const existingOpt = mockStore.data.question_options.find(
            (o) => o.question_id === qId && o.option_code === opt.optionCode
          );
          if (!existingOpt) {
            mockStore.insert('question_options', {
              question_id: qId,
              option_code: opt.optionCode,
              label: opt.label,
              value: opt.value,
              display_order: opt.displayOrder,
              metadata: JSON.stringify(opt.metadata),
            });
            importedOptions++;
          }
        }
      }

      return { questionnaireId: id, importedSections, importedQuestions, importedOptions };
    };

    try {
      return await saveToDatabase();
    } catch (dbErr) {
      console.error('[importFromExcel] Database save error, falling back to mockStore:', dbErr);
      return saveToMockStore();
    }
  },

  /**
   * Smart option splitter helper exposed for external utilities and testing
   */
  smartSplitOptions,

  /**
   * Grid questionnaire parser helper
   */
  parseQuestionnaireFromGrid(rawGrid, options = {}) {
    return {
      smartSplitOptions,
      parsed: [],
    };
  },
};

module.exports = questionnaireService;
module.exports.smartSplitOptions = smartSplitOptions;
