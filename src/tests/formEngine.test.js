/**
 * @file formEngine.test.js
 * @description Comprehensive automated test suite for Automated Form Engine:
 * - Unit tests for safe isomorphic Rule Engine & TVC branch parity
 * - Integration tests for legacy MH-CAPI-R1 workbook fixture (100 rows, 66 auditable, collisions)
 * - Authoritative server-side validation & target export
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');

const {
  evaluateRule,
  evaluateAtomicCondition,
  evaluateFormRules,
  validateRuleAST,
  validateSubmissionPayload,
} = require('../modules/rules/ruleEngine');

const importerService = require('../modules/imports/importer.service');
const { GUJARAT_PC_AC_FIXTURE } = require('../modules/lookups/lookup.service');

// TVC Form definition test fixture matching legacy React DataProcessTVC component
const TVC_QUESTIONS_FIXTURE = [
  { id: 'Q0', t: 'Introduction', q: { label: 'Introduction Consent' }, a: { type: 'select' }, defaultVisible: true },
  { id: 'Q1', t: 'family_member', q: { label: '1. Family Member' }, a: { type: 'select', options: ['family_self', 'family_other', 'no'] }, defaultVisible: true },
  {
    id: 'Q2',
    t: 'gender',
    q: { label: '2. Gender' },
    a: { type: 'select', options: ['Male', 'Female', 'Cant_Say'] },
    visibilityRule: { path: 'answers.family_member', operator: 'in', values: ['family_self', 'family_other'] },
  },
  {
    id: 'Q3',
    t: 'assembly_verification',
    q: { label: '3. Assembly Verification' },
    a: { type: 'select', options: ['yes', 'not_a_voter', 'no'] },
    visibilityRule: { path: 'answers.family_member', operator: 'in', values: ['family_self', 'family_other'] },
  },
  {
    id: 'Q3_1',
    t: 'Lok_Sabha',
    q: { label: '3.1 Lok Sabha' },
    a: { type: 'select', options: Object.keys(GUJARAT_PC_AC_FIXTURE) },
    metadata: { isPcQuestion: true },
    visibilityRule: {
      all: [
        { path: 'answers.family_member', operator: 'in', values: ['family_self', 'family_other'] },
        { path: 'answers.assembly_verification', operator: 'eq', value: 'no' },
      ],
    },
  },
  {
    id: 'Q3_2',
    t: 'vidhan_sabha',
    q: { label: '3.2 Vidhan Sabha' },
    a: { type: 'select', options: [] },
    metadata: { isAcQuestion: true, parentPcKey: 'Lok_Sabha' },
    visibilityRule: {
      all: [
        { path: 'answers.family_member', operator: 'in', values: ['family_self', 'family_other'] },
        { path: 'answers.assembly_verification', operator: 'eq', value: 'no' },
      ],
    },
  },
  {
    id: 'Q4',
    t: 'field_agent_visit',
    q: { label: '4. Field Agent Visit' },
    a: { type: 'select', options: ['survey_conducted', 'demographics_only', 'no', 'do_not_remember'] },
    visibilityRule: { path: 'answers.family_member', operator: 'in', values: ['family_self', 'family_other'] },
  },
  {
    id: 'Q5',
    t: 'field_agent_visit_confirmation',
    q: { label: '5. Field Agent Visit Confirmation' },
    a: { type: 'select', options: ['whispering', 'self_answers'] },
    visibilityRule: {
      all: [
        { path: 'answers.family_member', operator: 'in', values: ['family_self', 'family_other'] },
        { path: 'answers.field_agent_visit', operator: 'eq', value: 'survey_conducted' },
      ],
    },
  },
  {
    id: 'Q6',
    t: 'survey_process',
    q: { label: '6. Survey Process' },
    a: { type: 'select', options: ['Good', 'Very Good', 'Bad'] },
    visibilityRule: { path: 'answers.family_member', operator: 'eq', value: 'family_self' },
  },
  {
    id: 'Q7',
    t: 'agent_influence_attempt',
    q: { label: '7. Agent Influence Attempt' },
    a: { type: 'select', options: ['BJP', 'INC', 'AAP', 'others'] },
    visibilityRule: { path: 'answers.family_member', operator: 'eq', value: 'family_self' },
  },
  {
    id: 'Q7_actual',
    t: 'agent_influence_attempt_actual',
    q: { label: '7. Actual' },
    a: { type: 'text' },
    visibilityRule: {
      all: [
        { path: 'answers.family_member', operator: 'eq', value: 'family_self' },
        { path: 'answers.agent_influence_attempt', operator: 'eq', value: 'others' },
      ],
    },
  },
  {
    id: 'Q8',
    t: 'local_leader_accompany',
    q: { label: '8. Local Leader Accompany' },
    a: { type: 'select', options: ['yes', 'no'] },
    visibilityRule: { path: 'answers.family_member', operator: 'eq', value: 'family_self' },
  },
  {
    id: 'Q9',
    t: 'local_leader_accompany_1',
    q: { label: '9. Know Leader' },
    a: { type: 'select', options: ['yes', 'no'] },
    visibilityRule: {
      all: [
        { path: 'answers.family_member', operator: 'eq', value: 'family_self' },
        { path: 'answers.local_leader_accompany', operator: 'eq', value: 'yes' },
      ],
    },
  },
  {
    id: 'Q10',
    t: 'local_leader_accompany_2',
    q: { label: '10. How Know' },
    a: { type: 'select', options: ['sarpanch', 'political_leader', 'local_person'] },
    visibilityRule: {
      all: [
        { path: 'answers.family_member', operator: 'eq', value: 'family_self' },
        { path: 'answers.local_leader_accompany', operator: 'eq', value: 'yes' },
        { path: 'answers.local_leader_accompany_1', operator: 'eq', value: 'yes' },
      ],
    },
  },
  {
    id: 'Q11',
    t: 'local_leader_accompany_3',
    q: { label: '11. How Identified' },
    a: { type: 'select', options: ['Badge', 'ID', 'Self'] },
    visibilityRule: {
      all: [
        { path: 'answers.family_member', operator: 'eq', value: 'family_self' },
        { path: 'answers.local_leader_accompany', operator: 'eq', value: 'yes' },
        { path: 'answers.local_leader_accompany_1', operator: 'eq', value: 'yes' },
        { path: 'answers.local_leader_accompany_2', operator: 'in', values: ['sarpanch', 'political_leader'] },
      ],
    },
  },
  { id: 'Q14', t: 'Closure_message', q: { label: '14. Closure' }, a: { type: 'text' }, defaultVisible: true },
];

const isJest = typeof describe === 'function';
const suiteDescribe = isJest ? describe : (name, fn) => fn();
const suiteTest = isJest ? test : (name, fn) => {
  try {
    fn();
    console.log(`  ✓ PASS: ${name}`);
  } catch (err) {
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    Error: ${err.message}`);
    throw err;
  }
};

suiteDescribe('Automated Form Engine Test Suite (Phases 0 - 5)', () => {
  const test = suiteTest;

  test('1. Operators allowlist and safe evaluation', () => {
    const ctx = { answers: { age: 25, role: 'auditor', score: 85 } };
    assert.strictEqual(evaluateRule({ path: 'answers.age', operator: 'gte', value: 18 }, ctx), true);
    assert.strictEqual(evaluateRule({ path: 'answers.age', operator: 'lt', value: 20 }, ctx), false);
    assert.strictEqual(evaluateRule({ path: 'answers.role', operator: 'in', values: ['admin', 'auditor'] }, ctx), true);
    assert.strictEqual(evaluateRule({ path: 'answers.role', operator: 'not_in', values: ['guest'] }, ctx), true);
    assert.strictEqual(evaluateRule({ path: 'answers.score', operator: 'eq', value: 85 }, ctx), true);
    assert.strictEqual(evaluateRule({ path: 'answers.score', operator: 'ne', value: 100 }, ctx), true);
  });

  test('2. Combinators: nested all, any, not', () => {
    const ctx = { answers: { a: 1, b: 2, c: 3 } };
    assert.strictEqual(
      evaluateRule({ all: [{ path: 'answers.a', operator: 'eq', value: 1 }, { path: 'answers.b', operator: 'eq', value: 2 }] }, ctx),
      true
    );
    assert.strictEqual(
      evaluateRule({ any: [{ path: 'answers.a', operator: 'eq', value: 99 }, { path: 'answers.b', operator: 'eq', value: 2 }] }, ctx),
      true
    );
    assert.strictEqual(
      evaluateRule({ not: { path: 'answers.a', operator: 'eq', value: 99 } }, ctx),
      true
    );
  });

  test('3. TVC Branch Parity: Q1 No -> Q2–Q13 are hidden', () => {
    const answers = { family_member: 'no' };
    const evalResult = evaluateFormRules(TVC_QUESTIONS_FIXTURE, answers);
    assert.strictEqual(evalResult.visibleMap['Q0'], true);
    assert.strictEqual(evalResult.visibleMap['Q1'], true);
    assert.strictEqual(evalResult.visibleMap['Q2'], false);
    assert.strictEqual(evalResult.visibleMap['Q3'], false);
    assert.strictEqual(evalResult.visibleMap['Q3_1'], false);
    assert.strictEqual(evalResult.visibleMap['Q4'], false);
    assert.strictEqual(evalResult.visibleMap['Q6'], false);
    assert.strictEqual(evalResult.visibleMap['Q14'], true);
  });

  test('4. TVC Branch Parity: Q1 family_other -> Q4/Q5 shown, but Q6–Q11 hidden', () => {
    const answers = { family_member: 'family_other', field_agent_visit: 'survey_conducted' };
    const evalResult = evaluateFormRules(TVC_QUESTIONS_FIXTURE, answers);
    assert.strictEqual(evalResult.visibleMap['Q2'], true);
    assert.strictEqual(evalResult.visibleMap['Q3'], true);
    assert.strictEqual(evalResult.visibleMap['Q4'], true);
    assert.strictEqual(evalResult.visibleMap['Q5'], true);
    assert.strictEqual(evalResult.visibleMap['Q6'], false); // Q6 only for family_self
    assert.strictEqual(evalResult.visibleMap['Q7'], false);
    assert.strictEqual(evalResult.visibleMap['Q8'], false);
  });

  test('5. TVC Branch Parity: Q3 assembly_verification "no" shows Q3.1 Lok_Sabha and Q3.2 vidhan_sabha', () => {
    const answersNo = { family_member: 'family_self', assembly_verification: 'no' };
    const evalNo = evaluateFormRules(TVC_QUESTIONS_FIXTURE, answersNo);
    assert.strictEqual(evalNo.visibleMap['Q3_1'], true);
    assert.strictEqual(evalNo.visibleMap['Q3_2'], true);

    const answersYes = { family_member: 'family_self', assembly_verification: 'yes' };
    const evalYes = evaluateFormRules(TVC_QUESTIONS_FIXTURE, answersYes);
    assert.strictEqual(evalYes.visibleMap['Q3_1'], false);
    assert.strictEqual(evalYes.visibleMap['Q3_2'], false);
  });

  test('6. TVC Branch Parity: Q8-Q11 Local Leader Accompany progressive cascade', () => {
    // Q8 No -> Q9, Q10, Q11 hidden
    const ansQ8No = { family_member: 'family_self', local_leader_accompany: 'no' };
    const resQ8No = evaluateFormRules(TVC_QUESTIONS_FIXTURE, ansQ8No);
    assert.strictEqual(resQ8No.visibleMap['Q9'], false);
    assert.strictEqual(resQ8No.visibleMap['Q10'], false);
    assert.strictEqual(resQ8No.visibleMap['Q11'], false);

    // Q8 Yes, Q9 Yes, Q10 political_leader -> Q11 shown
    const ansQ10Leader = {
      family_member: 'family_self',
      local_leader_accompany: 'yes',
      local_leader_accompany_1: 'yes',
      local_leader_accompany_2: 'political_leader',
    };
    const resQ10 = evaluateFormRules(TVC_QUESTIONS_FIXTURE, ansQ10Leader);
    assert.strictEqual(resQ10.visibleMap['Q9'], true);
    assert.strictEqual(resQ10.visibleMap['Q10'], true);
    assert.strictEqual(resQ10.visibleMap['Q11'], true);

    // Q10 local_person -> Q11 hidden
    const ansQ10Local = {
      family_member: 'family_self',
      local_leader_accompany: 'yes',
      local_leader_accompany_1: 'yes',
      local_leader_accompany_2: 'local_person',
    };
    const resQ10Local = evaluateFormRules(TVC_QUESTIONS_FIXTURE, ansQ10Local);
    assert.strictEqual(resQ10Local.visibleMap['Q11'], false);
  });

  test('7. Q7 Actual input field enabled only when Q7 option is "others"', () => {
    const ansBJP = { family_member: 'family_self', agent_influence_attempt: 'BJP' };
    assert.strictEqual(evaluateFormRules(TVC_QUESTIONS_FIXTURE, ansBJP).visibleMap['Q7_actual'], false);

    const ansOthers = { family_member: 'family_self', agent_influence_attempt: 'others' };
    assert.strictEqual(evaluateFormRules(TVC_QUESTIONS_FIXTURE, ansOthers).visibleMap['Q7_actual'], true);
  });

  test('8. Clear newly hidden answers on branch shift', () => {
    // Upstream answer changes from others to BJP: Q7_actual value must be cleared
    const answers = { family_member: 'family_self', agent_influence_attempt: 'BJP', Q7_actual: 'Old Text' };
    const evalRes = evaluateFormRules(TVC_QUESTIONS_FIXTURE, answers, {}, { clearOnHide: true });
    assert.strictEqual(evalRes.normalizedAnswers.Q7_actual, undefined);
  });

  test('9. Authoritative Server Validation rejects hidden answers', () => {
    // Attempting to submit hidden Q7_actual value when Q7 is BJP
    const payload = {
      answers: { family_member: 'family_self', agent_influence_attempt: 'BJP', agent_influence_attempt_actual: 'Hacked Value' },
      disposition: 'complete',
    };
    const valResult = validateSubmissionPayload(TVC_QUESTIONS_FIXTURE, payload);
    assert.strictEqual(valResult.valid, false);
    assert.ok(valResult.errors.some((e) => e.code === 'HIDDEN_FIELD_VALUE_DISALLOWED'));
  });

  test('10. Authoritative Server Validation enforces dependent lookups (Kachchh -> Abdasa valid, Kachchh -> Nikol invalid)', () => {
    const lookupHierarchy = GUJARAT_PC_AC_FIXTURE;

    // Valid pair: Kachchh -> Abdasa
    const validPayload = {
      answers: { family_member: 'family_self', assembly_verification: 'no', Lok_Sabha: 'Kachchh', vidhan_sabha: 'Abdasa' },
      disposition: 'complete',
    };
    const resValid = validateSubmissionPayload(TVC_QUESTIONS_FIXTURE, validPayload, { lookupHierarchy });
    assert.strictEqual(resValid.errors.filter((e) => e.field === 'vidhan_sabha').length, 0);

    // Invalid pair: Kachchh -> Nikol (Nikol is under Ahmedabad East!)
    const invalidPayload = {
      answers: { family_member: 'family_self', assembly_verification: 'no', Lok_Sabha: 'Kachchh', vidhan_sabha: 'Nikol' },
      disposition: 'complete',
    };
    const resInvalid = validateSubmissionPayload(TVC_QUESTIONS_FIXTURE, invalidPayload, { lookupHierarchy });
    assert.ok(resInvalid.errors.some((e) => e.code === 'INVALID_DEPENDENT_LOOKUP_CHOICE'));
  });

  // --- INTEGRATION TESTS: REAL LEGACY MH-CAPI-R1 WORKBOOK ---
  console.log('\n--- Integration Tests: Legacy MH-CAPI-R1 Workbook Fixture ---');

  const mhFilePath = 'c:/Users/alomg/Downloads/Column Mapping __ MH-CAPI-R1.xlsx';
  if (fs.existsSync(mhFilePath)) {
    const mhBuffer = fs.readFileSync(mhFilePath);
    const mhWb = XLSX.read(mhBuffer, { type: 'buffer' });

    test('11. Profile detector correctly identifies legacy_mh_capi_r1 profile', () => {
      const profile = importerService.detectProfile(mhWb);
      assert.strictEqual(profile, 'legacy_mh_capi_r1');
    });

    test('12. Legacy MH-CAPI parser extracts exactly 100 mapping rows', () => {
      const parsed = importerService.parseLegacyMhCapi(mhWb);
      assert.strictEqual(parsed.summary.totalMappingRows, 100);
      assert.strictEqual(parsed.schema.questions.length, 100);
    });

    test('13. Exactly 66 rows are marked auditable', () => {
      const parsed = importerService.parseLegacyMhCapi(mhWb);
      assert.strictEqual(parsed.summary.auditableCount, 66);
    });

    test('14. Exactly 2 section headings without tags preserved with sourceRow pointers', () => {
      const parsed = importerService.parseLegacyMhCapi(mhWb);
      assert.strictEqual(parsed.summary.headingCount, 2);
    });

    test('15. Blank Condition (P) and Super Audit (Q) columns yield REQUIRES_DECISION, zero invented rules', () => {
      const parsed = importerService.parseLegacyMhCapi(mhWb);
      const missingConditionIssues = parsed.issues.filter((i) => i.issue_code === 'MISSING_BRANCH_CONDITION');
      assert.ok(missingConditionIssues.length > 50);
      // Verify no invented rules exist in parsed questions
      parsed.schema.questions.forEach((q) => {
        assert.strictEqual(q.conditions.length, 0);
      });
    });

    test('16. Shared key collisions tracked: full_name, vs_vote_now, and introduction', () => {
      const parsed = importerService.parseLegacyMhCapi(mhWb);
      const collisionIssues = parsed.issues.filter((i) => i.issue_code === 'SHARED_KEY_COLLISION');
      const collisionKeys = collisionIssues.map((i) => i.details?.key);
      assert.ok(collisionKeys.includes('full_name'));
      assert.ok(collisionKeys.includes('vs_vote_now'));
      assert.ok(collisionKeys.includes('introduction'));
    });

    test('17. Exact legacy keys and typos preserved (winner_perception_state_quastion_validation, rapid_questionning, Remarks)', () => {
      const parsed = importerService.parseLegacyMhCapi(mhWb);
      const qRemarks = parsed.schema.questions.find((q) => q.t === 'Remarks');
      assert.ok(qRemarks);

      const qWinner = parsed.schema.questions.find((q) => q.t === 'winner_perception_state');
      assert.ok(qWinner);
      assert.strictEqual(qWinner.audit.questionValidationColumn, 'winner_perception_state_quastion_validation');

      const qRapid = parsed.schema.questions.find((q) => q.t === 'rapid_questionning');
      assert.ok(qRapid);
    });

    test('18. Indian scripts & Unicode labels preserved without corruption', () => {
      const parsed = importerService.parseLegacyMhCapi(mhWb);
      const qIntro = parsed.schema.questions.find((q) => q.t === 'introduction');
      assert.ok(qIntro.q.label.includes('नमस्कार सर/मॅडम'));
      assert.ok(qIntro.q.label.includes('मार्किट रिसर्च कंपनी'));
    });

    test('19. InputOutput sheet output columns parsed into target layout', () => {
      const parsed = importerService.parseLegacyMhCapi(mhWb);
      assert.ok(Array.isArray(parsed.schema.exportLayout?.output2Columns));
      assert.ok(parsed.schema.exportLayout.output2Columns.includes('submission_id'));
      assert.ok(parsed.schema.exportLayout.output2Columns.includes('disposition'));
    });

    test('20. Strict To Be Audited === "Yes" filter: only active audited questions are returned when onlyAudited: true', () => {
      const parsedAudited = importerService.parseLegacyMhCapi(mhWb, { onlyAudited: true });
      assert.strictEqual(parsedAudited.schema.questions.length, 66);
      parsedAudited.schema.questions.forEach((q) => {
        assert.strictEqual(q.audit.toBeAudited, true);
        assert.strictEqual(q.q.important, true);
      });

      const tags = parsedAudited.schema.questions.map((q) => q.t);
      // Strictly included:
      const expectedAudited = [
        'introduction', 'ac_name', 'first_name', 'last_name',
        'gender', 'phone_no', 'age', 'religion',
        'caste_gen', 'caste_obc', 'caste_st', 'caste_sc',
        'major_problems', 'state_govt_change', 'winner_perception_state'
      ];
      expectedAudited.forEach((tag) => {
        assert.ok(tags.includes(tag), `Tag ${tag} must be included in audited questions`);
      });

      // Strictly excluded:
      const expectedExcluded = [
        'voter_id', 'locality', 'locality_confirmation', 'urban_rural',
        'native_state', 'category', 'qualification', 'monthly_income',
        'occupation', 'muslim_welfare', 'hide_1', 'hide_2'
      ];
      expectedExcluded.forEach((tag) => {
        assert.ok(!tags.includes(tag), `Tag ${tag} must NOT be included in audited questions`);
      });
    });

    test('21. Unicode Marathi, Hindi, English and validation options preserved accurately without font corruption', () => {
      const parsed = importerService.parseLegacyMhCapi(mhWb);
      
      // Test caste_gen options from Master sheet
      const qCasteGen = parsed.schema.questions.find((q) => q.t === 'caste_gen');
      assert.ok(qCasteGen);
      assert.ok(qCasteGen.a.options.length > 0);
      const baniyaOpt = qCasteGen.a.options.find((o) => o.label.includes('बनिया/जैन/मारवाड़ी'));
      assert.ok(baniyaOpt, 'Must preserve Marathi/Hindi Devanagari Unicode in option label');
      assert.strictEqual(baniyaOpt.english, 'Baniya / Jain / Marwari');

      // Test religion options
      const qReligion = parsed.schema.questions.find((q) => q.t === 'religion');
      assert.ok(qReligion);
      const hinduOpt = qReligion.a.options.find((o) => o.label.includes('हिंदू'));
      assert.ok(hinduOpt, 'Must preserve Hindu option with Hindi/Marathi fonts');

      // Test answerValidationOptions from Column Mapping
      const qWinner = parsed.schema.questions.find((q) => q.t === 'winner_perception_state');
      assert.ok(qWinner);
      assert.ok(qWinner.audit.validationOptions.length > 0);
      assert.ok(qWinner.audit.validationOptions.includes('Yes - No Prompting Done'));
      assert.ok(qWinner.audit.validationOptions.some((o) => o.includes("Sharad Pawar's")));

      // Test introduction validation options
      const qIntro = parsed.schema.questions.find((q) => q.t === 'introduction');
      assert.ok(qIntro);
      assert.ok(qIntro.audit.validationOptions.includes('Yes - Perfect introduction'));
    });
  } else {
    console.warn('Skipping MH-CAPI file test: file not found at ' + mhFilePath);
  }
});

