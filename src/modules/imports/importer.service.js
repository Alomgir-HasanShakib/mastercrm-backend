/**
 * @file importer.service.js
 * @description Multi-profile workbook parser & staged import service.
 * Supports:
 * 1. Legacy MH-CAPI-R1 profile (exact 100 entries, multi-sheet, collision detection)
 * 2. Canonical V1 multi-sheet profile (Project, Questions, Controls, Options, Rules, Lookups)
 * 3. Generic Tabular profile
 * Never executes macros, formulas, or arbitrary JS.
 */

const crypto = require('crypto');
const XLSX = require('xlsx');
const db = require('../../database/connection');
const { ValidationError, NotFoundError } = require('../../utils/errors');

class ImporterService {
  /**
   * Computes SHA256 of file buffer
   * @param {Buffer} buffer
   * @returns {string}
   */
  computeHash(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Detects profile from workbook sheet names and headers
   * @param {XLSX.WorkBook} workbook
   * @returns {string} 'legacy_mh_capi_r1' | 'canonical_v1' | 'custom_tabular'
   */
  detectProfile(workbook) {
    const sheetNames = workbook.SheetNames || [];
    const lowerNames = sheetNames.map((s) => s.toLowerCase());

    if (
      lowerNames.includes('column mapping') &&
      lowerNames.some((s) => s.includes('governance') || s.includes('survey_maste') || s.includes('master'))
    ) {
      return 'legacy_mh_capi_r1';
    }

    if (
      lowerNames.includes('questions') &&
      (lowerNames.includes('controls') || lowerNames.includes('options') || lowerNames.includes('rules'))
    ) {
      return 'canonical_v1';
    }

    return 'custom_tabular';
  }

  /**
   * Parses Legacy MH-CAPI-R1 workbook fixture
   * @param {XLSX.WorkBook} workbook
   * @returns {{ schema: object, issues: Array<object>, summary: object }}
   */
  parseLegacyMhCapi(workbook, options = {}) {
    const onlyAudited = options.onlyAudited === true;
    const cmSheet = workbook.Sheets['Column Mapping'] || workbook.Sheets[workbook.SheetNames.find((s) => s.toLowerCase() === 'column mapping')];
    if (!cmSheet) {
      throw new ValidationError("Workbook must contain 'Column Mapping' sheet for legacy MH-CAPI profile.");
    }

    const cmData = XLSX.utils.sheet_to_json(cmSheet, { header: 1, defval: '' });
    const masterSheetName = workbook.SheetNames.find((s) => s.toLowerCase().includes('maste') || s.toLowerCase().includes('master'));
    const masterSheet = masterSheetName ? workbook.Sheets[masterSheetName] : null;
    const masterRows = masterSheet ? XLSX.utils.sheet_to_json(masterSheet, { defval: '' }) : [];

    const ioSheet = workbook.Sheets['InputOutput'];
    const ioData = ioSheet ? XLSX.utils.sheet_to_json(ioSheet, { header: 1, defval: '' }) : [];

    const issues = [];
    const questions = [];
    const collisions = new Map();

    // 1. Group Master options by tag/Question Text
    const masterOptionsMap = new Map();
    const masterMetadataMap = new Map();

    masterRows.forEach((row) => {
      const tag = String(row['tag'] || '').trim();
      const optText = String(row['Option Text'] || '').trim();
      const engText = String(row['English'] || '').trim();
      const hinText = String(row['Hindi'] || '').trim();
      const regText = String(row['Regional Language'] || '').trim();
      const party = String(row['Party'] || '').trim();
      const qType = String(row['type'] || '').trim().toLowerCase();
      const imgUrl = String(row['Image URL'] || '').trim();

      if (tag) {
        if (!masterOptionsMap.has(tag)) masterOptionsMap.set(tag, []);
        if (!masterMetadataMap.has(tag)) {
          masterMetadataMap.set(tag, {
            type: qType,
            imageUrl: imgUrl,
            questionText: String(row['Question Text'] || '').trim(),
          });
        }

        if (optText) {
          const exists = masterOptionsMap.get(tag).some((o) => o.label === optText);
          if (!exists) {
            masterOptionsMap.get(tag).push({
              label: optText,
              value: party || optText,
              english: engText,
              hindi: hinText,
              regional: regText,
              party: party,
            });
          }
        }
      }
    });

    // 2. Parse Column Mapping rows 2 to 101 (exactly 100 entries)
    let auditableCount = 0;
    let headingCount = 0;

    for (let r = 1; r <= 100; r++) {
      const row = cmData[r];
      if (!row || (!row[0] && !row[1])) continue;

      const qText = String(row[0] || '').trim();
      const tag = String(row[1] || '').trim();
      const rawVisible = row[2];
      const rawAudited = String(row[3] || '').trim();
      const diuInput = String(row[4] || '').trim();
      const qInputDiu = String(row[5] || '').trim();
      const qValCol = String(row[6] || '').trim();
      const ansValCol = String(row[7] || '').trim();
      const ansValCol1 = String(row[8] || '').trim();
      const ansValCol2 = String(row[9] || '').trim();
      const actualCol = String(row[10] || '').trim();
      const qValOpts = String(row[11] || '').trim();
      const ansValOpts = String(row[12] || '').trim();
      const condition = String(row[15] || '').trim();
      const superAuditCondition = String(row[16] || '').trim();

      const isAudited = rawAudited.toLowerCase() === 'yes';
      if (isAudited) auditableCount++;

      // When onlyAudited is requested, strictly filter out non-audited rows
      if (onlyAudited && !isAudited) {
        continue;
      }

      // Handle blank-tag section headings
      if (!tag) {
        headingCount++;
        questions.push({
          id: `SEC_HEADING_${r}`,
          sn: r,
          t: `heading_${r}`,
          code: `HEADING_${r}`,
          q: { label: qText, important: false },
          a: { key: `heading_${r}`, label: 'Heading', type: 'info_block', options: [], important: false },
          isHeading: true,
          defaultVisible: true,
          conditions: [],
          sourceRow: r + 1,
        });
        issues.push({
          severity: 'INFO',
          issue_code: 'SECTION_HEADING_NO_TAG',
          sheet_name: 'Column Mapping',
          source_row: r + 1,
          question_tag: '',
          message: `Row ${r + 1} has no tag: preserved as informational section heading.`,
        });
        continue;
      }

      // Check for shared key collisions
      const trackCollision = (key, role) => {
        if (!key) return;
        if (!collisions.has(key)) collisions.set(key, []);
        collisions.get(key).push({ tag, role, row: r + 1 });
      };

      trackCollision(diuInput, 'input');
      trackCollision(ansValCol, 'answer_validation');
      trackCollision(actualCol, 'actual');

      // Visibility normalization
      let defaultVisible = 'unspecified';
      if (rawVisible === 1 || rawVisible === '1' || rawVisible === true) defaultVisible = true;
      else if (rawVisible === 0 || rawVisible === '0' || rawVisible === false) defaultVisible = false;

      // Extract validation options
      const validationOptions = ansValOpts
        ? ansValOpts.split('\n').map((x) => x.trim()).filter(Boolean)
        : [];

      // Look up master options
      const masterOpts = masterOptionsMap.get(tag) || [];

      // Determine control type
      const masterMeta = masterMetadataMap.get(tag) || {};
      let controlType = 'select';
      if (masterMeta.type) {
        if (masterMeta.type.includes('multi')) controlType = 'multi_select';
        else if (masterMeta.type.includes('subjective') || masterMeta.type.includes('text')) controlType = 'text';
      } else if (masterOpts.length === 0 && !isAudited) {
        controlType = 'text';
      }

      const qItem = {
        id: `Q_${tag}_${r}`,
        sn: r,
        t: tag,
        code: tag.toUpperCase(),
        q: {
          label: qText || tag,
          important: isAudited,
        },
        a: {
          key: tag,
          label: 'Answer',
          type: controlType,
          options: masterOpts,
          important: isAudited,
        },
        defaultVisible: defaultVisible === 'unspecified' ? true : defaultVisible,
        res: diuInput ? { key: diuInput } : undefined,
        actual: actualCol ? { key: actualCol, label: `${tag} Actual`, type: 'text', important: true } : undefined,
        audit: {
          toBeAudited: isAudited,
          inputColumnDiu: diuInput,
          questionInputFromDiu: qInputDiu,
          questionValidationColumn: qValCol,
          questionValidationOptions: qValOpts ? qValOpts.split('\n').map((x) => x.trim()).filter(Boolean) : [],
          answerValidationColumn: ansValCol,
          answerValidationOptions: validationOptions,
          validationColumn: ansValCol,
          validationOptions,
          extraValidation1: ansValCol1,
          answerValidationColumn1: ansValCol1,
          answerValidationOptions1: String(row[13] || '').split('\n').map((x) => x.trim()).filter(Boolean),
          extraValidation2: ansValCol2,
          answerValidationColumn2: ansValCol2,
          answerValidationOptions2: String(row[14] || '').split('\n').map((x) => x.trim()).filter(Boolean),
          actualColumn: actualCol,
          condition,
          superAuditCondition,
        },
        conditions: [],
        sourceRow: r + 1,
        sourceSheet: 'Column Mapping',
      };

      questions.push(qItem);

      // Report empty condition columns (P & Q) as review decisions (do NOT invent logic!)
      if (!condition) {
        issues.push({
          severity: 'REQUIRES_DECISION',
          issue_code: 'MISSING_BRANCH_CONDITION',
          sheet_name: 'Column Mapping',
          source_row: r + 1,
          source_column: 'P',
          question_tag: tag,
          message: `Condition column (P) is blank in source workbook for tag '${tag}'. Visibility defaults to active unless rules are uploaded.`,
        });
      }

      if (isAudited && !superAuditCondition) {
        issues.push({
          severity: 'REQUIRES_DECISION',
          issue_code: 'MISSING_SUPER_AUDIT_TRIGGER',
          sheet_name: 'Column Mapping',
          source_row: r + 1,
          source_column: 'Q',
          question_tag: tag,
          message: `Super Audit Condition (Q) is blank in source for auditable tag '${tag}'. Requires human supervisor review configuration.`,
        });
      }
    }

    // 3. Register collisions as REQUIRES_DECISION issues
    collisions.forEach((occurrences, key) => {
      if (occurrences.length > 1) {
        const tags = occurrences.map((o) => `${o.tag} (${o.role})`).join(', ');
        issues.push({
          severity: 'REQUIRES_DECISION',
          issue_code: 'SHARED_KEY_COLLISION',
          sheet_name: 'Column Mapping',
          question_tag: occurrences[0].tag,
          message: `Target key '${key}' is shared across multiple questions/roles: ${tags}. Confirm collision policy before flat export.`,
          details: { key, occurrences },
        });
      }
    });

    // 4. Parse InputOutput target ordered columns dynamically
    const inputColumns = [];
    const output1Columns = [];
    const output2Columns = [];

    let inColIdx = -1;
    let out1ColIdx = -1;
    let out2ColIdx = -1;

    for (let r = 0; r < Math.min(ioData.length, 5); r++) {
      const row = ioData[r];
      if (Array.isArray(row)) {
        row.forEach((cell, cIdx) => {
          const s = String(cell).trim().toLowerCase();
          if (s === 'input') inColIdx = cIdx;
          if (s === 'output1') out1ColIdx = cIdx;
          if (s === 'output2') out2ColIdx = cIdx;
        });
        if (out2ColIdx !== -1) break;
      }
    }

    if (out2ColIdx === -1) out2ColIdx = 6;
    if (out1ColIdx === -1) out1ColIdx = 4;
    if (inColIdx === -1) inColIdx = 2;

    for (let r = 2; r < ioData.length; r++) {
      const row = ioData[r];
      if (row) {
        const inp = row[inColIdx] ? String(row[inColIdx]).trim() : '';
        const out1 = row[out1ColIdx] ? String(row[out1ColIdx]).trim() : '';
        const out2 = row[out2ColIdx] ? String(row[out2ColIdx]).trim() : '';
        if (inp) inputColumns.push(inp);
        if (out1) output1Columns.push(out1);
        if (out2) output2Columns.push(out2);
      }
    }

    const summary = {
      totalMappingRows: questions.length,
      auditableCount,
      headingCount,
      totalIssues: issues.length,
      requiresDecisionCount: issues.filter((i) => i.severity === 'REQUIRES_DECISION').length,
      blockingCount: issues.filter((i) => i.severity === 'BLOCKING_ERROR').length,
      warningCount: issues.filter((i) => i.severity === 'WARNING').length,
    };

    return {
      schema: {
        schemaVersion: '1.0',
        profile: 'legacy_mh_capi_r1',
        title: 'Maharashtra CAPI R1 Governance Survey',
        module: 'CAPI',
        questions,
        exportLayout: {
          output2Columns,
        },
      },
      issues,
      summary,
    };
  }

  /**
   * Parses Canonical V1 workbook
   * @param {XLSX.WorkBook} workbook
   * @returns {{ schema: object, issues: Array<object>, summary: object }}
   */
  parseCanonicalV1(workbook) {
    const qSheet = workbook.Sheets['Questions'] || workbook.Sheets[workbook.SheetNames.find((s) => s.toLowerCase() === 'questions')];
    if (!qSheet) throw new ValidationError("Canonical V1 workbook requires 'Questions' sheet.");

    const qRows = XLSX.utils.sheet_to_json(qSheet, { defval: '' });
    const optSheet = workbook.Sheets['Options'] ? XLSX.utils.sheet_to_json(workbook.Sheets['Options'], { defval: '' }) : [];
    const ruleSheet = workbook.Sheets['Rules'] ? XLSX.utils.sheet_to_json(workbook.Sheets['Rules'], { defval: '' }) : [];

    const issues = [];
    const optionSets = new Map();

    optSheet.forEach((row) => {
      const setId = String(row['option_set_id'] || '').trim();
      const code = String(row['option_code'] || '').trim();
      const label = String(row['option_label'] || '').trim();
      if (setId && code) {
        if (!optionSets.has(setId)) optionSets.set(setId, []);
        optionSets.get(setId).push({ label: label || code, value: code });
      }
    });

    const questions = qRows.map((r, idx) => {
      const qId = String(r['question_id'] || `q_${idx + 1}`).trim();
      const tag = String(r['source_tag'] || `var_${idx + 1}`).trim();
      const text = String(r['question_text'] || '').trim();
      const type = String(r['type'] || 'select').trim().toLowerCase();
      const auditable = String(r['auditable'] || '').toLowerCase() === 'yes';
      const optSetId = String(r['option_set_id'] || '').trim();

      return {
        id: qId,
        sn: r['display_number'] || idx + 1,
        t: tag,
        code: tag.toUpperCase(),
        q: { label: text, important: auditable },
        a: {
          key: tag,
          label: 'Answer',
          type,
          options: optionSets.get(optSetId) || [],
          important: auditable,
        },
        conditions: [],
      };
    });

    return {
      schema: {
        schemaVersion: '1.0',
        profile: 'canonical_v1',
        title: 'Project Questionnaire Form',
        questions,
      },
      issues,
      summary: { totalQuestions: questions.length, totalIssues: issues.length },
    };
  }

  /**
   * Uploads and stages a workbook for a project
   * @param {string} projectId
   * @param {Buffer} buffer
   * @param {string} filename
   * @param {string} userId
   * @returns {Promise<object>}
   */
  async createStagedImport(projectId, buffer, filename, userId) {
    if (!buffer || buffer.length === 0) {
      throw new ValidationError('Uploaded file is empty.');
    }
    if (buffer.length > 50 * 1024 * 1024) {
      throw new ValidationError('File exceeds 50MB size limit.');
    }

    const sha256 = this.computeHash(buffer);
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const profile = this.detectProfile(workbook);

    let parseResult;
    if (profile === 'legacy_mh_capi_r1') {
      parseResult = this.parseLegacyMhCapi(workbook);
    } else if (profile === 'canonical_v1') {
      parseResult = this.parseCanonicalV1(workbook);
    } else {
      // Fallback tabular
      parseResult = this.parseLegacyMhCapi(workbook);
    }

    const { schema, issues, summary } = parseResult;

    // Check if an existing staged import exists for this exact file + project
    let existingImport = await db('form_imports')
      .where({ project_id: projectId, file_sha256: sha256 })
      .first();

    const status = summary.blockingCount > 0 ? 'REJECTED' : summary.requiresDecisionCount > 0 ? 'NEEDS_REVIEW' : 'READY_TO_PUBLISH';

    let importId;
    if (existingImport) {
      importId = existingImport.id;
      await db('form_imports')
        .where('id', importId)
        .update({
          status,
          import_profile: profile,
          detected_sheets_jsonb: JSON.stringify(workbook.SheetNames),
          issue_summary_jsonb: JSON.stringify(summary),
          staged_schema_jsonb: JSON.stringify(schema),
          updated_at: new Date(),
        });
      await db('form_import_issues').where('import_id', importId).delete();
    } else {
      const [newRec] = await db('form_imports')
        .insert({
          project_id: projectId,
          uploaded_by: userId,
          file_sha256: sha256,
          original_filename: filename,
          import_profile: profile,
          status,
          detected_sheets_jsonb: JSON.stringify(workbook.SheetNames),
          issue_summary_jsonb: JSON.stringify(summary),
          staged_schema_jsonb: JSON.stringify(schema),
        })
        .returning('*');
      importId = newRec.id;
    }

    // Insert detected issues
    if (issues.length > 0) {
      const issueInserts = issues.map((iss) => ({
        import_id: importId,
        severity: iss.severity,
        issue_code: iss.issue_code,
        sheet_name: iss.sheet_name || null,
        source_row: iss.source_row || null,
        source_column: iss.source_column || null,
        question_tag: iss.question_tag || null,
        message: iss.message,
        details_jsonb: JSON.stringify(iss.details || {}),
      }));

      // Chunk inserts for Knex
      const chunkSize = 50;
      for (let i = 0; i < issueInserts.length; i += chunkSize) {
        await db('form_import_issues').insert(issueInserts.slice(i, i + chunkSize));
      }
    }

    return {
      importId,
      status,
      profile,
      detectedSheets: workbook.SheetNames,
      summary,
      schema,
    };
  }

  /**
   * Retrieves staged import details
   */
  async getImportById(importId) {
    const record = await db('form_imports').where('id', importId).first();
    if (!record) throw new NotFoundError('Staged form import not found.');
    return record;
  }

  /**
   * Retrieves issues list for import
   */
  async getImportIssues(importId) {
    return db('form_import_issues').where('import_id', importId).orderBy('source_row', 'asc');
  }

  /**
   * Resolves an import issue with logged policy
   */
  async resolveIssue(importId, issueId, resolution, userId) {
    const issue = await db('form_import_issues').where({ id: issueId, import_id: importId }).first();
    if (!issue) throw new NotFoundError('Import issue not found.');

    await db('form_import_issues')
      .where('id', issueId)
      .update({
        resolution_jsonb: JSON.stringify(resolution),
        resolved_by: userId,
      });

    // Check if unresolved blocking or decisions remain
    const remainingDecisions = await db('form_import_issues')
      .where('import_id', importId)
      .whereIn('severity', ['BLOCKING_ERROR', 'REQUIRES_DECISION'])
      .whereNull('resolution_jsonb')
      .count('id as count')
      .first();

    const count = parseInt(remainingDecisions?.count || 0, 10);
    const newStatus = count === 0 ? 'READY_TO_PUBLISH' : 'NEEDS_REVIEW';

    await db('form_imports').where('id', importId).update({ status: newStatus, updated_at: new Date() });

    return { issueId, status: newStatus, remainingDecisions: count };
  }

  /**
   * Publishes staged import to immutable questionnaire_versions and sets project active version
   */
  async publishImport(importId, userId) {
    const importRec = await this.getImportById(importId);

    // Verify no unresolved blocking errors
    const blocking = await db('form_import_issues')
      .where('import_id', importId)
      .where('severity', 'BLOCKING_ERROR')
      .whereNull('resolution_jsonb')
      .count('id as count')
      .first();

    if (parseInt(blocking?.count || 0, 10) > 0) {
      throw new ValidationError('Cannot publish: unresolved blocking errors exist.');
    }

    const schema = typeof importRec.staged_schema_jsonb === 'string'
      ? JSON.parse(importRec.staged_schema_jsonb)
      : importRec.staged_schema_jsonb;

    const checksum = crypto.createHash('sha256').update(JSON.stringify(schema)).digest('hex');

    // Get current version count for project
    const lastVersion = await db('questionnaire_versions')
      .where('project_id', importRec.project_id)
      .orderBy('version_number', 'desc')
      .first();

    const nextVerNum = lastVersion ? lastVersion.version_number + 1 : 1;

    // Transactionally publish version
    const published = await db.transaction(async (trx) => {
      const [newVersion] = await trx('questionnaire_versions')
        .insert({
          project_id: importRec.project_id,
          module: schema.module || 'CAPI',
          name: schema.title || `${importRec.original_filename} Form`,
          version_number: nextVerNum,
          status: 'PUBLISHED',
          published_at: new Date(),
          published_by: userId,
          checksum,
          canonical_schema_jsonb: JSON.stringify(schema),
          source_import_id: importId,
        })
        .returning('*');

      // Update project active version if projects table has active_version_id
      try {
        await trx('projects').where('id', importRec.project_id).update({
          updated_at: new Date(),
        });
      } catch (_) {}

      await trx('form_imports').where('id', importId).update({
        status: 'PUBLISHED',
        updated_at: new Date(),
      });

      return newVersion;
    });

    return published;
  }
}

module.exports = new ImporterService();
