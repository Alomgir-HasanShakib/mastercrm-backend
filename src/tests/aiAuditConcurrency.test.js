/**
 * @file aiAuditConcurrency.test.js
 * @description Comprehensive Concurrency & Race Condition Verification Suite:
 * - Verifies that concurrent AI auditors (AI Auditor #1 and AI Auditor #2) never audit the same lead twice.
 * - Verifies atomic state reservation with FOR UPDATE SKIP LOCKED & locked_by_auditor.
 * - Verifies human auditor queue isolation (human auditors cannot grab AI-locked leads).
 * - Verifies idempotent duplicate submission guard when saving audit decisions.
 */

const { db } = require('../database/connection');
const aiWorkerPool = require('../modules/capi/capiAiWorkerPool.service');
const capiService = require('../modules/capi/capi.service');
const mockStore = require('../database/mockStore');

describe('AI Audit Concurrency & Race Condition Prevention Suite', () => {
  let testProject = null;
  let createdLeadIds = [];

  beforeAll(async () => {
    const existing = await db('projects').first();
    const uniqueSuffix = Date.now().toString().slice(-6);

    // Create dedicated CAPI test project so queue tests are 100% isolated
    const [project] = await db('projects').insert({
      name: 'AI Concurrency Test Campaign ' + uniqueSuffix,
      project_code: 'CONC_' + uniqueSuffix,
      code: 'CONC_' + uniqueSuffix,
      client_id: existing?.client_id || null,
      organization_id: existing?.organization_id || null,
      type: 'CAPI',
      status: 'ACTIVE',
      created_at: new Date(),
      updated_at: new Date(),
    }).returning('*');
    testProject = project;
  });

  afterAll(async () => {
    if (testProject) {
      try {
        await db('campaign_leads').where('project_id', testProject.id).del();
        await db('projects').where('id', testProject.id).del();
      } catch {}
    }
  });

  afterEach(async () => {
    // Clear in-memory reservation tracking
    aiWorkerPool.clearCurrentlyProcessingLeadIds();
    // Clean up test leads created during test runs
    if (createdLeadIds.length > 0) {
      try {
        await db('campaign_leads').whereIn('id', createdLeadIds).del();
      } catch {}
      createdLeadIds = [];
    }
    // Stop pool if running
    aiWorkerPool.stopWorkerPool();
  });

  test('1. Two concurrent AI workers calling fetchNextLeadForAi at the exact same millisecond NEVER receive the same lead', async () => {
    if (!testProject) return;

    // Create a single pending test lead
    const [lead] = await db('campaign_leads').insert({
      project_id: testProject.id,
      phone_number: '9876543210',
      respondent_name: 'Race Condition Test Subject',
      status: 'PENDING',
      audit_status: 'PENDING',
      locked_by_auditor: null,
      surveyed_at: null,
      created_at: new Date(),
      updated_at: new Date(),
    }).returning('*');

    createdLeadIds.push(lead.id);

    // AI Auditor #1 and AI Auditor #2 fetch simultaneously at the exact same millisecond
    const [result1, result2] = await Promise.all([
      aiWorkerPool.fetchNextLeadForAi('AI_Auditor_#1', testProject.id),
      aiWorkerPool.fetchNextLeadForAi('AI_Auditor_#2', testProject.id),
    ]);

    // Exactly one worker must have claimed the lead; the other worker must receive null (or a different lead)
    const claimedByWorker1 = Boolean(result1 && result1.id === lead.id);
    const claimedByWorker2 = Boolean(result2 && result2.id === lead.id);

    // Both workers MUST NEVER claim the same lead
    expect(claimedByWorker1 && claimedByWorker2).toBe(false);
    expect(claimedByWorker1 || claimedByWorker2).toBe(true);

    const winningWorker = claimedByWorker1 ? 'AI_Auditor_#1' : 'AI_Auditor_#2';

    // Verify DB state of the claimed lead
    const dbLead = await db('campaign_leads').where('id', lead.id).first();
    expect(dbLead.status).toBe('IN_PROGRESS');
    expect(dbLead.audit_status).toBe('IN_PROGRESS');
    expect(dbLead.locked_by_auditor).toBe(winningWorker);
    expect(dbLead.locked_at).not.toBeNull();
  });

  test('2. Multiple concurrent AI workers distribute distinct leads without any overlap', async () => {
    if (!testProject) return;

    // Insert 3 distinct pending test leads
    const insertedLeads = await db('campaign_leads').insert([
      {
        project_id: testProject.id,
        phone_number: '9876543211',
        respondent_name: 'Lead Alpha',
        status: 'PENDING',
        audit_status: 'PENDING',
        locked_by_auditor: null,
        surveyed_at: null,
        created_at: new Date(Date.now() - 3000),
      },
      {
        project_id: testProject.id,
        phone_number: '9876543212',
        respondent_name: 'Lead Beta',
        status: 'PENDING',
        audit_status: 'PENDING',
        locked_by_auditor: null,
        surveyed_at: null,
        created_at: new Date(Date.now() - 2000),
      },
      {
        project_id: testProject.id,
        phone_number: '9876543213',
        respondent_name: 'Lead Gamma',
        status: 'PENDING',
        audit_status: 'PENDING',
        locked_by_auditor: null,
        surveyed_at: null,
        created_at: new Date(Date.now() - 1000),
      },
    ]).returning('*');

    for (const l of insertedLeads) {
      createdLeadIds.push(l.id);
    }

    // Launch 3 AI auditors concurrently
    const [res1, res2, res3] = await Promise.all([
      aiWorkerPool.fetchNextLeadForAi('AI_Auditor_#1', testProject.id),
      aiWorkerPool.fetchNextLeadForAi('AI_Auditor_#2', testProject.id),
      aiWorkerPool.fetchNextLeadForAi('AI_Auditor_#3', testProject.id),
    ]);

    const claimedIds = [res1?.id, res2?.id, res3?.id].filter(Boolean);
    const uniqueClaimedIds = new Set(claimedIds);

    // Each claimed lead must be strictly unique (no two workers got the same ID)
    expect(uniqueClaimedIds.size).toBe(claimedIds.length);
    expect(claimedIds.length).toBe(3);
  });

  test('3. Human auditor queue cannot pick up leads currently locked by an AI auditor', async () => {
    if (!testProject) return;

    const [aiLockedLead] = await db('campaign_leads').insert({
      project_id: testProject.id,
      phone_number: '9876543214',
      respondent_name: 'AI Claimed Lead',
      status: 'IN_PROGRESS',
      audit_status: 'IN_PROGRESS',
      locked_by_auditor: 'AI_Auditor_#1',
      locked_at: new Date(),
      allocated_at: new Date(),
      surveyed_at: null,
      created_at: new Date(),
    }).returning('*');

    createdLeadIds.push(aiLockedLead.id);

    const humanAuditorId = '55555555-5555-5555-5555-555555555506'; // CAPI Auditor User ID
    const nextQueued = await capiService.getNextQueuedAudit(humanAuditorId, testProject.id, {
      role: 'CAPI_AUDITOR',
    });

    // Human auditor must NOT receive the AI-locked lead
    if (nextQueued) {
      expect(nextQueued.id).not.toBe(aiLockedLead.id);
    }
  });

  test('4. Idempotent guard blocks duplicate audit decision submissions for already-audited leads', async () => {
    if (!testProject) return;

    // Create an already completed/audited lead
    const [completedLead] = await db('campaign_leads').insert({
      project_id: testProject.id,
      phone_number: '9876543215',
      respondent_name: 'Completed Lead',
      status: 'COMPLETED',
      audit_status: 'PASS',
      surveyed_at: new Date(),
      created_at: new Date(),
      metadata: JSON.stringify({
        outputData: {
          audit_status: 'PASS',
          score: 100,
          audited_by: 'ai_auditor_#1@crm.system',
        },
      }),
    }).returning('*');

    createdLeadIds.push(completedLead.id);

    // Attempt duplicate submission by AI Auditor #2
    const result = await capiService.submitDecision(
      completedLead.id,
      {
        decision: 'PASS',
        score: 100,
        feedback: 'Duplicate audit attempt',
      },
      {
        email: 'ai_auditor_#2@crm.system',
        role: 'AI_AUDITOR',
      }
    );

    // Must be idempotently blocked without duplicating or failing
    expect(result.isDuplicateBlocked).toBe(true);
    expect(result.status).toBe('COMPLETED');
  });

  test('5. Concurrent AI Worker Pool running parallel workers NEVER records duplicate audits for the same lead in recentAudits feed', async () => {
    if (!testProject) return;

    // Insert 2 distinct pending test leads for this campaign
    const testLeads = await db('campaign_leads').insert([
      {
        project_id: testProject.id,
        phone_number: '9876543221',
        respondent_name: 'Lead Multi 1',
        status: 'PENDING',
        audit_status: 'PENDING',
        locked_by_auditor: null,
        surveyed_at: null,
        created_at: new Date(Date.now() - 2000),
      },
      {
        project_id: testProject.id,
        phone_number: '9876543222',
        respondent_name: 'Lead Multi 2',
        status: 'PENDING',
        audit_status: 'PENDING',
        locked_by_auditor: null,
        surveyed_at: null,
        created_at: new Date(Date.now() - 1000),
      },
    ]).returning('*');

    for (const l of testLeads) {
      createdLeadIds.push(l.id);
    }

    // Start 2 concurrent AI workers in fastMode
    await aiWorkerPool.startWorkerPool({
      concurrency: 2,
      projectId: testProject.id,
      bypassCutoff: true,
      fastMode: true,
    });

    // Allow workers to process both leads
    await new Promise((resolve) => setTimeout(resolve, 3500));
    aiWorkerPool.stopWorkerPool();

    const status = aiWorkerPool.getPoolStatus();
    const auditedList = status.stats.recentAudits.filter(a => testLeads.some(tl => tl.id === a.leadId));

    // Verify no duplicates in the session's recentAudits feed
    const leadIdsInFeed = auditedList.map(a => a.leadId);
    const uniqueLeadIdsInFeed = new Set(leadIdsInFeed);

    expect(uniqueLeadIdsInFeed.size).toBe(leadIdsInFeed.length);
  });
});
