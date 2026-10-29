/**
 * @file tvc.service.js
 * @description Business logic layer for Tele-verification (TVC): queue management, call attempts, dispositions, and submission status syncing.
 * Enforces:
 * 1. Single active lead per agent (Agent cannot get a new lead until current one is completed).
 * 2. 20-minute inactivity timeout (Uncompleted leads idle for 20m are automatically redistributed).
 * 3. Atomic lock prevents multiple agents from receiving the same lead.
 * 4. Completed data isolation (Agents only see leads completed by themselves).
 */

const { db } = require('../../database/connection');
const mockStore = require('../../database/mockStore');
const { NotFoundError, ValidationError, ConflictError } = require('../../utils/errors');
const logger = require('../../utils/logger');
const tvcModel = require('./tvc.model');
const { ensureTvcDynamicTables, deriveTvcTableNames } = require('../super-audit/superAuditTables.service');

// Lock timeout duration: 20 minutes (1,200,000 ms)
const LOCK_TIMEOUT_MS = 20 * 60 * 1000;

/**
 * Checks for and releases any TVC leads locked by agents for more than 20 minutes without progress.
 * If agent has clicked 'Process' / is actively verifying (is_processing = true), the lock timer is stopped and lead is NOT released.
 */
const releaseStaleTvcLocks = async () => {
  const now = new Date();
  const threshold = new Date(now.getTime() - LOCK_TIMEOUT_MS);

  // 1. Release in mockStore
  if (mockStore && mockStore.data && Array.isArray(mockStore.data.tvc_leads)) {
    mockStore.data.tvc_leads.forEach((lead) => {
      if (
        lead.status === 'IN_PROGRESS' &&
        !lead.is_processing &&
        lead.agent_id &&
        ((lead.lock_expires_at && new Date(lead.lock_expires_at) <= now) ||
          (lead.locked_at && new Date(lead.locked_at) <= threshold))
      ) {
        logger.info(`[TVC Redistribution] Releasing un-processed lead ${lead.id} from agent ${lead.agent_id} due to 20-min inactivity.`);
        lead.status = 'QUEUED';
        lead.agent_id = null;
        lead.locked_at = null;
        lead.lock_expires_at = null;
        lead.is_processing = false;
        lead.updated_at = now;
      }
    });
  }

  if (mockStore && mockStore.data && Array.isArray(mockStore.data.campaign_leads)) {
    mockStore.data.campaign_leads.forEach((lead) => {
      if (
        lead.assigned_agent_id &&
        lead.allocated_at &&
        !lead.is_processing &&
        new Date(lead.allocated_at) <= threshold &&
        lead.status !== 'COMPLETED'
      ) {
        lead.assigned_agent_id = null;
        lead.allocated_at = null;
        lead.is_processing = false;
        lead.status = 'PENDING';
      }
    });
  }

  // 2. Release in SQL database
  try {
    await db('tvc_leads')
      .where('status', 'IN_PROGRESS')
      .whereNotNull('agent_id')
      .whereNotNull('locked_at')
      .whereRaw("(metadata->>'is_processing' IS NULL OR metadata->>'is_processing' != 'true')")
      .where((builder) => {
        builder
          .where('lock_expires_at', '<=', db.fn.now())
          .orWhere('locked_at', '<=', db.raw(`NOW() - INTERVAL '20 minutes'`));
      })
      .update({
        status: 'QUEUED',
        agent_id: null,
        locked_at: null,
        lock_expires_at: null,
        updated_at: db.fn.now(),
      });

    await db('campaign_leads')
      .whereNotNull('assigned_agent_id')
      .whereNotNull('allocated_at')
      .whereIn('status', ['ASSIGNED', 'PENDING'])
      .where('allocated_at', '<=', db.raw(`NOW() - INTERVAL '20 minutes'`))
      .whereRaw("(metadata->>'is_processing' IS NULL OR metadata->>'is_processing' != 'true')")
      .whereIn('project_id', function () {
        this.select('id').from('projects').where('type', 'TVC').orWhereRaw("enabled_modules::text LIKE '%TVC%'");
      })
      .update({
        assigned_agent_id: null,
        allocated_at: null,
        status: 'PENDING',
        updated_at: db.fn.now(),
      });
  } catch (e) {
    // Database offline fallback already handled in mockStore
  }
};

const tvcService = {
  releaseStaleTvcLocks,

  /**
   * List TVC leads with filters, tenant scoping, role-based scoping, and pagination.
   * Ensures TVC agents can only view completed data verified by themselves.
   * @param {object} filters
   * @param {object} pagination
   * @param {object} tenantContext
   * @param {object} user
   * @returns {Promise<{ leads: Array<object>, total: number }>}
   */
  async listLeads(filters = {}, pagination = {}, tenantContext = {}, user = {}) {
    await releaseStaleTvcLocks();

    const scopedFilters = { ...filters };
    const userRole = (user.role || user.roleName || user.role_name || '').toUpperCase().replace(/\s+/g, '_');
    const userId = user.id || user.userId;

    // Strict Agent Isolation: TVC agents can ONLY see completed data verified by themselves!
    if (userRole === 'TVC_AGENT' && userId) {
      if (
        scopedFilters.status === 'VERIFIED' ||
        scopedFilters.status === 'REJECTED' ||
        scopedFilters.status === 'COMPLETED' ||
        scopedFilters.completedOnly === 'true' ||
        scopedFilters.completedOnly === true
      ) {
        scopedFilters.agentId = userId;
      } else if (scopedFilters.status === 'IN_PROGRESS') {
        scopedFilters.agentId = userId;
      }
    }

    if (tenantContext.vendorId) {
      scopedFilters.vendorId = tenantContext.vendorId;
    }
    if (tenantContext.organizationId && !tenantContext.isMasterAdmin) {
      scopedFilters.organizationId = tenantContext.organizationId;
    }

    const [leads, total] = await Promise.all([
      tvcModel.findAll(scopedFilters, pagination),
      tvcModel.count(scopedFilters),
    ]);

    return { leads, total };
  },

  /**
   * Directly get all completed/verified leads for the authenticated agent
   * @param {string} agentId
   * @param {object} pagination
   * @returns {Promise<{ leads: Array<object>, total: number }>}
   */
  async getMyCompletedLeads(agentId, pagination = {}) {
    const filters = {
      agentId,
      verificationStatus: 'VERIFIED',
    };
    const [tvcResult, totalTvc] = await Promise.all([
      tvcModel.findAll(filters, pagination),
      tvcModel.count(filters),
    ]);

    let leads = [...(tvcResult || [])];
    let total = totalTvc || 0;

    // Include completed TVC verifications from campaign_leads for this agent
    try {
      const campLeads = await db('campaign_leads')
        .join('projects', 'campaign_leads.project_id', 'projects.id')
        .where('campaign_leads.assigned_agent_id', agentId)
        .where((b) => {
          b.where('campaign_leads.status', 'COMPLETED')
            .orWhere('campaign_leads.status', 'VERIFIED')
            .orWhereRaw("campaign_leads.metadata::text LIKE '%tvcVerification%'");
        })
        .where((b) => {
          b.where('projects.type', 'TVC')
            .orWhereRaw("projects.enabled_modules::text LIKE '%TVC%'");
        })
        .select('campaign_leads.*', 'projects.name as project_name')
        .limit(pagination.limit || 50);

      for (const cl of campLeads) {
        if (!leads.some((l) => l.id === cl.id)) {
          const meta = typeof cl.metadata === 'object' && cl.metadata !== null ? cl.metadata : JSON.parse(cl.metadata || '{}');
          leads.push({
            id: cl.id,
            submission_id: meta.submission_id || cl.id,
            respondent_name: cl.respondent_name || meta.full_name || 'Respondent',
            respondent_phone: cl.phone_number || meta.phone_number || 'N/A',
            verification_status: 'VERIFIED',
            disposition: meta.tvc_status || 'Complete',
            audio_recorded: Boolean(meta.tvcVerification?.hasAudioRecording || meta.audio_link),
            verification_score: meta.tvcVerification?.verificationScore ?? 100,
            created_at: cl.updated_at || cl.created_at,
          });
          total += 1;
        }
      }
    } catch (e) {
      if (mockStore && mockStore.data && Array.isArray(mockStore.data.campaign_leads)) {
        const msLeads = mockStore.data.campaign_leads.filter(
          (cl) => cl.assigned_agent_id === agentId && (cl.status === 'COMPLETED' || cl.status === 'VERIFIED')
        );
        for (const cl of msLeads) {
          if (!leads.some((l) => l.id === cl.id)) {
            const meta = typeof cl.metadata === 'object' && cl.metadata !== null ? cl.metadata : JSON.parse(cl.metadata || '{}');
            leads.push({
              id: cl.id,
              submission_id: meta.submission_id || cl.id,
              respondent_name: cl.respondent_name || meta.full_name || 'Respondent',
              respondent_phone: cl.phone_number || meta.phone_number || 'N/A',
              verification_status: 'VERIFIED',
              disposition: meta.tvc_status || 'Complete',
              audio_recorded: Boolean(meta.tvcVerification?.hasAudioRecording || meta.audio_link),
              verification_score: meta.tvcVerification?.verificationScore ?? 100,
              created_at: cl.updated_at || cl.created_at,
            });
            total += 1;
          }
        }
      }
    }

    return { leads, total };
  },

  /**
   * Get single TVC lead by ID with attempt history
   * @param {string} id
   * @returns {Promise<object>}
   */
  async getLeadById(id) {
    const lead = await tvcModel.findById(id);
    if (!lead) {
      throw new NotFoundError(`TVC Lead '${id}' not found`);
    }

    const attempts = await tvcModel.findAttempts(lead.id);

    let responses = [];
    try {
      responses = await db('submission_responses')
        .where('submission_id', lead.submission_id)
        .orderBy('created_at', 'asc');
    } catch (e) {
      responses = mockStore.find('submission_responses', (r) => r.submission_id === lead.submission_id);
    }

    return {
      ...lead,
      attempts,
      responses,
    };
  },

  /**
   * Enqueue a new TVC lead for verification
   * @param {object} data
   * @param {object} [tenantContext]
   * @returns {Promise<object>}
   */
  async createLead(data, tenantContext = {}) {
    let submission = null;
    try {
      submission = await db('submissions').where('id', data.submissionId).first();
    } catch (e) {
      submission = mockStore.findById('submissions', data.submissionId);
    }
    if (!submission) {
      throw new NotFoundError(`Submission '${data.submissionId}' not found`);
    }

    const existingLead = await tvcModel.findBySubmissionId(data.submissionId);
    if (existingLead) {
      throw new ConflictError(`TVC Lead already exists for submission '${data.submissionId}'`);
    }

    const payload = {
      submission_id: data.submissionId,
      project_id: data.projectId || submission.project_id,
      vendor_id: data.vendorId || submission.vendor_id || tenantContext.vendorId || null,
      agentId: null,
      respondent_name: data.respondentName || submission.respondent_name || null,
      phone_number: data.phoneNumber || submission.respondent_phone,
      status: 'QUEUED',
      priority: data.priority !== undefined ? data.priority : (submission.priority || 50),
      total_attempts: 0,
      max_attempts: data.maxAttempts || 3,
      verification_status: 'PENDING',
      verification_score: 0,
      metadata: JSON.stringify(data.metadata || {}),
    };

    const created = await tvcModel.createLead(payload);

    try {
      await db('submissions')
        .where('id', data.submissionId)
        .update({
          tvc_status: 'QUEUED',
          updated_at: db.fn.now(),
        });
    } catch (e) {
      mockStore.updateById('submissions', data.submissionId, { tvc_status: 'QUEUED' });
    }

    return created;
  },

  /**
   * Fetch and lock next queued lead for caller agent.
   * ENFORCES:
   * 1. 1 Agent = Exactly 1 active lead at a time. If an active lead already exists, returns it.
   * 2. Atomic lock prevents multiple agents from getting the same lead.
   * 3. 20-minute auto-expiry lock timer. If 20 minutes pass without activity, lead is auto-redistributed.
   * @param {string} agentId
   * @param {string} [projectId]
   * @param {object} [tenantContext]
   * @returns {Promise<object>}
   */
  async getNextQueuedLead(agentId, projectId = null, tenantContext = {}) {
    if (!agentId) {
      throw new ValidationError('Agent ID is required to fetch next lead');
    }

    // Step 1: Auto-release any expired locks (idle > 20 min) across the system
    await releaseStaleTvcLocks();

    const now = new Date();
    const expiresAt = new Date(now.getTime() + LOCK_TIMEOUT_MS);

    // Step 2: Check if this agent ALREADY has an in-progress lead that is active
    let currentActiveLead = null;

    // Check dynamic TVC Input Table if a TVC project is targeted
    if (projectId) {
      try {
        const proj = await db('projects').where('id', projectId).first();
        if (proj && proj.client_table_name) {
          const hasInTbl = await db.schema.hasTable(proj.client_table_name);
          if (hasInTbl) {
            const activeInDynamic = await db(proj.client_table_name)
              .where('agent_id', agentId)
              .where('tvc_status', 'IN_PROGRESS')
              .first();

            if (activeInDynamic) {
              const subId = activeInDynamic.submission_id_dr || activeInDynamic.submission_id;
              return {
                id: subId,
                submission_id: subId,
                submission_id_dr: subId,
                project_id: projectId,
                agent_id: agentId,
                respondent_name: activeInDynamic.resp_full_name || activeInDynamic.full_name || 'Respondent',
                full_name: activeInDynamic.resp_full_name || activeInDynamic.full_name || 'Respondent',
                phone_number: activeInDynamic.phone_no || 'N/A',
                phone_no: activeInDynamic.phone_no || 'N/A',
                respondent_phone: activeInDynamic.phone_no || 'N/A',
                ac_name: activeInDynamic.ac_name || 'N/A',
                ac_num: activeInDynamic.ac_num || 'N/A',
                caste: activeInDynamic.caste || 'N/A',
                age: activeInDynamic.age || 'N/A',
                gender: activeInDynamic.gender || 'N/A',
                FA: activeInDynamic.FA || activeInDynamic.fa || 'N/A',
                batch_slot: activeInDynamic.batch_slot || 'N/A',
                Date: activeInDynamic.Date || activeInDynamic.date || now.toISOString().split('T')[0],
                status: 'IN_PROGRESS',
                tvc_status: 'IN_PROGRESS',
                source_table: proj.client_table_name,
                attempts: [],
                responses: Object.entries(activeInDynamic).map(([k, v]) => ({
                  question_text: k.toUpperCase(),
                  response_value: String(v || ''),
                })),
                rawRow: activeInDynamic,
                activeLock: true,
                remainingLockSeconds: 1200,
                lockExpiresAt: expiresAt,
                message: 'Active lead currently in progress from TVC Input Table (14 columns).',
              };
            }
          }
        }
      } catch (dynErr) {
        logger.warn(`[TVC Dynamic In-Progress Check] ${dynErr.message}`);
      }
    }

    try {
      currentActiveLead = await db('tvc_leads')
        .where('agent_id', agentId)
        .where('status', 'IN_PROGRESS')
        .where((builder) => {
          builder.whereNull('lock_expires_at').orWhere('lock_expires_at', '>', db.fn.now());
        })
        .first();
    } catch (e) {
      currentActiveLead = (mockStore.data.tvc_leads || []).find(
        (l) => l.agent_id === agentId && l.status === 'IN_PROGRESS' && (!l.lock_expires_at || new Date(l.lock_expires_at) > now)
      );
    }

    // Also check campaign_leads for active in-progress lead for this agent
    if (!currentActiveLead) {
      try {
        const cl = await db('campaign_leads')
          .join('projects', 'campaign_leads.project_id', 'projects.id')
          .select('campaign_leads.*')
          .where('campaign_leads.assigned_agent_id', agentId)
          .where('campaign_leads.status', 'ASSIGNED')
          .where('campaign_leads.allocated_at', '>', db.raw(`NOW() - INTERVAL '20 minutes'`))
          .where((b) => {
            b.where('projects.type', 'TVC').orWhereRaw("projects.enabled_modules::text LIKE '%TVC%'");
          })
          .first();

        if (cl) {
          const meta = typeof cl.metadata === 'object' && cl.metadata !== null ? cl.metadata : JSON.parse(cl.metadata || '{}');
          const responses = Object.entries(meta).map(([key, val]) => ({
            question_text: key.replace(/_/g, ' ').toUpperCase(),
            response_value: typeof val === 'object' ? JSON.stringify(val) : String(val),
          }));

          const allocatedTime = cl.allocated_at ? new Date(cl.allocated_at).getTime() : Date.now();
          const elapsed = Math.floor((Date.now() - allocatedTime) / 1000);
          const remainingSeconds = Math.max(0, 1200 - elapsed);

          return {
            id: cl.id,
            submission_id: meta.submission_id || cl.id,
            project_id: cl.project_id,
            vendor_id: cl.vendor_id,
            agent_id: agentId,
            respondent_name: cl.respondent_name || meta.full_name || 'Respondent',
            respondent_phone: cl.phone_number || meta.phone_number || 'N/A',
            phone_number: cl.phone_number || meta.phone_number || 'N/A',
            status: 'IN_PROGRESS',
            ac_name: cl.constituency || meta.ac_name || 'N/A',
            district: cl.state || meta.district || 'N/A',
            audio_url: meta.audio_link || null,
            original_audio_url: meta.audio_link || null,
            attempts: [],
            responses,
            activeLock: true,
            remainingLockSeconds: remainingSeconds,
            lockExpiresAt: new Date(allocatedTime + LOCK_TIMEOUT_MS),
            message: 'Active lead currently in progress. Complete verification of this lead before receiving another.',
          };
        }
      } catch (clErr) {
        if (mockStore && mockStore.data && Array.isArray(mockStore.data.campaign_leads)) {
          const msCl = mockStore.data.campaign_leads.find(
            (cl) => cl.assigned_agent_id === agentId && cl.status === 'ASSIGNED' && cl.allocated_at && new Date(cl.allocated_at) > new Date(Date.now() - LOCK_TIMEOUT_MS)
          );
          if (msCl) {
            const meta = typeof msCl.metadata === 'object' && msCl.metadata !== null ? msCl.metadata : JSON.parse(msCl.metadata || '{}');
            return {
              id: msCl.id,
              submission_id: meta.submission_id || msCl.id,
              project_id: msCl.project_id,
              vendor_id: msCl.vendor_id,
              agent_id: agentId,
              respondent_name: msCl.respondent_name || meta.full_name || 'Respondent',
              respondent_phone: msCl.phone_number || meta.phone_number || 'N/A',
              phone_number: msCl.phone_number || meta.phone_number || 'N/A',
              status: 'IN_PROGRESS',
              ac_name: msCl.constituency || meta.ac_name || 'N/A',
              district: msCl.state || meta.district || 'N/A',
              audio_url: meta.audio_link || null,
              original_audio_url: meta.audio_link || null,
              attempts: [],
              responses: [],
              activeLock: true,
              remainingLockSeconds: 1200,
              lockExpiresAt: expiresAt,
              message: 'Active lead currently in progress. Complete verification of this lead before receiving another.',
            };
          }
        }
      }
    }

    // If agent already has an active lead, enforce strict single-lead rule: RETURN IT!
    if (currentActiveLead) {
      const remainingSeconds = currentActiveLead.lock_expires_at
        ? Math.max(0, Math.floor((new Date(currentActiveLead.lock_expires_at).getTime() - Date.now()) / 1000))
        : 1200;

      const attempts = await tvcModel.findAttempts(currentActiveLead.id);
      let responses = [];
      try {
        responses = await db('submission_responses').where('submission_id', currentActiveLead.submission_id);
      } catch (e) {
        responses = mockStore.find('submission_responses', (r) => r.submission_id === currentActiveLead.submission_id);
      }

      return {
        ...currentActiveLead,
        attempts,
        responses,
        activeLock: true,
        remainingLockSeconds: remainingSeconds,
        lockExpiresAt: currentActiveLead.lock_expires_at,
        message: 'Active lead currently in progress. Complete verification of this lead before receiving another.',
      };
    }

    // Step 3: Atomically fetch and lock the next queued lead from the pool
    const vendorId = tenantContext.vendorId || null;
    let nextLead = null;

    try {
      await db.transaction(async (trx) => {
        let query = trx('tvc_leads')
          .join('projects', 'tvc_leads.project_id', 'projects.id')
          .select('tvc_leads.*')
          .whereIn('tvc_leads.status', ['QUEUED', 'CALLBACK_SCHEDULED'])
          .where((builder) => {
            builder.whereNull('tvc_leads.agent_id').orWhere('tvc_leads.lock_expires_at', '<', db.fn.now());
          })
          .where((builder) => {
            builder.whereNull('tvc_leads.next_callback_at').orWhere('tvc_leads.next_callback_at', '<=', db.fn.now());
          })
          .where((builder) => {
            builder.where('projects.type', 'TVC')
              .orWhereRaw("projects.enabled_modules::text LIKE '%TVC%'");
          })
          .orderBy('tvc_leads.priority', 'desc')
          .orderBy('tvc_leads.created_at', 'asc')
          .forUpdate()
          .skipLocked();

        if (projectId) query = query.where('tvc_leads.project_id', projectId);
        if (vendorId) query = query.where('tvc_leads.vendor_id', vendorId);

        const found = await query.first();
        if (found) {
          await trx('tvc_leads').where('id', found.id).update({
            agent_id: agentId,
            status: 'IN_PROGRESS',
            locked_at: now,
            lock_expires_at: expiresAt,
            updated_at: now,
          });
          nextLead = {
            ...found,
            agent_id: agentId,
            status: 'IN_PROGRESS',
            locked_at: now,
            lock_expires_at: expiresAt,
          };
        }
      });
    } catch (e) {
      // In-memory mockStore atomic pick
      const unassignedLeads = (mockStore.data.tvc_leads || []).filter((l) => {
        if (projectId && l.project_id !== projectId) return false;
        if (vendorId && l.vendor_id !== vendorId) return false;
        const isQueued = l.status === 'QUEUED' || l.status === 'CALLBACK_SCHEDULED';
        const isUnassigned = !l.agent_id || (l.lock_expires_at && new Date(l.lock_expires_at) <= now);
        return isQueued && isUnassigned;
      });

      if (unassignedLeads.length > 0) {
        unassignedLeads.sort((a, b) => (b.priority || 0) - (a.priority || 0));
        const leadToLock = unassignedLeads[0];
        leadToLock.agent_id = agentId;
        leadToLock.status = 'IN_PROGRESS';
        leadToLock.locked_at = now;
        leadToLock.lock_expires_at = expiresAt;
        leadToLock.updated_at = now;
        nextLead = { ...leadToLock };
      }
    }

    if (!nextLead) {
      // Step 3a: Check dynamic TVC Input Table (14 columns)
      if (projectId) {
        try {
          const proj = await db('projects').where('id', projectId).first();
          if (proj && proj.client_table_name) {
            const hasInTbl = await db.schema.hasTable(proj.client_table_name);
            if (hasInTbl) {
              let pickedDynamic = null;
              await db.transaction(async (trx) => {
                const row = await trx(proj.client_table_name)
                  .where((b) => {
                    b.whereNull('agent_id').orWhere('agent_id', '');
                  })
                  .where((b) => {
                    b.whereNull('tvc_status').orWhereIn('tvc_status', ['PENDING', 'QUEUED']);
                  })
                  .orderBy('submission_id_dr', 'asc')
                  .forUpdate()
                  .skipLocked()
                  .first();

                if (row) {
                  await trx(proj.client_table_name)
                    .where('submission_id_dr', row.submission_id_dr)
                    .update({
                      agent_id: agentId,
                      tvc_status: 'IN_PROGRESS',
                      assignment_time: now.toISOString().replace('T', ' ').substring(0, 19),
                    });
                  pickedDynamic = row;
                }
              });

              if (pickedDynamic) {
                const subId = pickedDynamic.submission_id_dr || pickedDynamic.submission_id;
                return {
                  id: subId,
                  submission_id: subId,
                  submission_id_dr: subId,
                  project_id: projectId,
                  agent_id: agentId,
                  respondent_name: pickedDynamic.resp_full_name || pickedDynamic.full_name || 'Respondent',
                  full_name: pickedDynamic.resp_full_name || pickedDynamic.full_name || 'Respondent',
                  phone_number: pickedDynamic.phone_no || 'N/A',
                  phone_no: pickedDynamic.phone_no || 'N/A',
                  respondent_phone: pickedDynamic.phone_no || 'N/A',
                  ac_name: pickedDynamic.ac_name || 'N/A',
                  ac_num: pickedDynamic.ac_num || 'N/A',
                  caste: pickedDynamic.caste || 'N/A',
                  age: pickedDynamic.age || 'N/A',
                  gender: pickedDynamic.gender || 'N/A',
                  FA: pickedDynamic.FA || pickedDynamic.fa || 'N/A',
                  batch_slot: pickedDynamic.batch_slot || 'N/A',
                  Date: pickedDynamic.Date || pickedDynamic.date || now.toISOString().split('T')[0],
                  status: 'IN_PROGRESS',
                  tvc_status: 'IN_PROGRESS',
                  source_table: proj.client_table_name,
                  attempts: [],
                  responses: Object.entries(pickedDynamic).map(([k, v]) => ({
                    question_text: k.toUpperCase(),
                    response_value: String(v || ''),
                  })),
                  rawRow: pickedDynamic,
                  activeLock: true,
                  remainingLockSeconds: 1200,
                  lockExpiresAt: expiresAt,
                  message: 'New TVC lead assigned from TVC Input Table (14 columns).',
                };
              }
            }
          }
        } catch (dynPickErr) {
          logger.warn(`[TVC Dynamic Pick Warning] ${dynPickErr.message}`);
        }
      }

      // Step 3b: Fallback to campaign_leads pool with strict TVC project scoping
      try {
        let effectiveVendorId = vendorId;
        if (!effectiveVendorId && agentId) {
          const u = await db('users').where('id', agentId).first().catch(() => null);
          if (u && u.vendor_id) effectiveVendorId = u.vendor_id;
        }

        let candLead = null;
        await db.transaction(async (trx) => {
          let q = trx('campaign_leads')
            .join('projects', 'campaign_leads.project_id', 'projects.id')
            .select('campaign_leads.*')
            .whereIn('campaign_leads.status', ['COMPLETED', 'ASSIGNED', 'PENDING'])
            .where((builder) => {
              builder.whereNull('campaign_leads.assigned_agent_id')
                .orWhere('campaign_leads.allocated_at', '<=', db.raw(`NOW() - INTERVAL '20 minutes'`));
            })
            .where((builder) => {
              builder.where('projects.type', 'TVC')
                .orWhereRaw("projects.enabled_modules::text LIKE '%TVC%'");
            });

          if (projectId) {
            q = q.where('campaign_leads.project_id', projectId);
          }
          if (effectiveVendorId) q = q.where('campaign_leads.vendor_id', effectiveVendorId);

          candLead = await q.orderBy('campaign_leads.created_at', 'asc').forUpdate().skipLocked().first();
          if (candLead) {
            await trx('campaign_leads').where('id', candLead.id).update({
              assigned_agent_id: agentId,
              status: 'ASSIGNED',
              allocated_at: now,
              updated_at: now,
            });
          }
        });

        if (candLead) {
          const meta = typeof candLead.metadata === 'object' && candLead.metadata !== null 
            ? candLead.metadata 
            : JSON.parse(candLead.metadata || '{}');

          const responses = Object.entries(meta).map(([key, val]) => ({
            question_text: key.replace(/_/g, ' ').toUpperCase(),
            response_value: typeof val === 'object' ? JSON.stringify(val) : String(val),
          }));

          return {
            id: candLead.id,
            submission_id: meta.submission_id || candLead.id,
            project_id: candLead.project_id,
            vendor_id: candLead.vendor_id,
            agent_id: agentId,
            respondent_name: candLead.respondent_name || meta.full_name || 'Respondent',
            respondent_phone: candLead.phone_number || meta.phone_number || 'N/A',
            phone_number: candLead.phone_number || meta.phone_number || 'N/A',
            status: 'IN_PROGRESS',
            ac_name: candLead.constituency || meta.ac_name || 'N/A',
            district: candLead.state || meta.district || 'N/A',
            audio_url: meta.audio_link || null,
            original_audio_url: meta.audio_link || null,
            attempts: [],
            responses,
            activeLock: true,
            remainingLockSeconds: 1200,
            lockExpiresAt: expiresAt,
            message: 'New TVC lead assigned and locked for 20 minutes.',
          };
        }
      } catch (poolErr) {
        logger.warn('TVC campaign_leads fallback note:', poolErr.message);
      }

      // MockStore fallback for campaign_leads
      if (mockStore && mockStore.data && Array.isArray(mockStore.data.campaign_leads)) {
        const tvcProjectIds = new Set(
          (mockStore.data.projects || [])
            .filter((p) => {
              const mods = Array.isArray(p.enabled_modules) ? p.enabled_modules : [];
              return p.type === 'TVC' || mods.includes('TVC');
            })
            .map((p) => p.id)
        );

        const cand = mockStore.data.campaign_leads.find((cl) => {
          if (projectId && cl.project_id !== projectId) return false;
          if (!projectId && !tvcProjectIds.has(cl.project_id)) return false;
          if (vendorId && cl.vendor_id !== vendorId) return false;
          const isEligible = ['COMPLETED', 'ASSIGNED', 'PENDING'].includes(cl.status);
          const isUnassigned = !cl.assigned_agent_id || (cl.allocated_at && new Date(cl.allocated_at) <= new Date(Date.now() - LOCK_TIMEOUT_MS));
          return isEligible && isUnassigned;
        });

        if (cand) {
          cand.assigned_agent_id = agentId;
          cand.allocated_at = now;
          cand.updated_at = now;
          const meta = typeof cand.metadata === 'object' && cand.metadata !== null ? cand.metadata : JSON.parse(cand.metadata || '{}');
          return {
            id: cand.id,
            submission_id: meta.submission_id || cand.id,
            project_id: cand.project_id,
            vendor_id: cand.vendor_id,
            agent_id: agentId,
            respondent_name: cand.respondent_name || meta.full_name || 'Respondent',
            respondent_phone: cand.phone_number || meta.phone_number || 'N/A',
            phone_number: cand.phone_number || meta.phone_number || 'N/A',
            status: 'IN_PROGRESS',
            ac_name: cand.constituency || meta.ac_name || 'N/A',
            district: cand.state || meta.district || 'N/A',
            audio_url: meta.audio_link || null,
            original_audio_url: meta.audio_link || null,
            attempts: [],
            responses: [],
            activeLock: true,
            remainingLockSeconds: 1200,
            lockExpiresAt: expiresAt,
            message: 'New TVC lead assigned and locked for 20 minutes.',
          };
        }
      }

      throw new NotFoundError('No queued TVC leads currently available in the campaign pool');
    }

    const attempts = await tvcModel.findAttempts(nextLead.id);
    let responses = [];
    try {
      responses = await db('submission_responses').where('submission_id', nextLead.submission_id);
    } catch (e) {
      responses = mockStore.find('submission_responses', (r) => r.submission_id === nextLead.submission_id);
    }

    return {
      ...nextLead,
      attempts,
      responses,
      activeLock: true,
      remainingLockSeconds: 1200,
      lockExpiresAt: expiresAt,
      message: 'New lead assigned and locked for 20 minutes.',
    };
  },

  /**
   * Start processing TVC lead (freezes/stops the 20-minute auto-expiry lock)
   */
  async startProcess(id, userId) {
    const now = new Date();
    let updated = false;

    try {
      const candLead = await db('campaign_leads').where('id', id).first();
      if (candLead) {
        const meta = typeof candLead.metadata === 'object' && candLead.metadata !== null 
          ? candLead.metadata 
          : JSON.parse(candLead.metadata || '{}');
        meta.is_processing = true;
        meta.processing_started_at = now.toISOString();

        await db('campaign_leads').where('id', id).update({
          status: 'IN_PROGRESS',
          metadata: JSON.stringify(meta),
          allocated_at: null, // Clear 20m timer!
          updated_at: now,
        });
        updated = true;
      }
    } catch (e) {
      logger.warn('Failed to update campaign_leads in tvc startProcess:', e.message);
    }

    try {
      const lead = await tvcModel.findById(id);
      if (lead) {
        await tvcModel.updateLead(id, {
          status: 'IN_PROGRESS',
          is_processing: true,
          locked_at: null,
          lock_expires_at: null,
        });
        updated = true;
      }
    } catch (_) {}

    return { id, status: 'PROCESSING', is_processing: true, message: 'TVC Lead processing started. 20-minute lock stopped.' };
  },

  /**
   * Release active lead lock back to the queue
   * @param {string} id
   * @param {object} user
   * @param {string} [reason]
   * @returns {Promise<object>}
   */
  async releaseLead(id, user = {}, reason = 'MANUAL_RELEASE') {
    let lead = await tvcModel.findById(id);
    if (!lead) {
      let candLead = null;
      try {
        candLead = await db('campaign_leads').where('id', id).first();
      } catch (e) {
        candLead = mockStore.findById('campaign_leads', id);
      }
      if (candLead) {
        try {
          await db('campaign_leads').where('id', id).update({
            assigned_agent_id: null,
            allocated_at: null,
            status: 'PENDING',
            updated_at: new Date(),
          });
        } catch (e) {
          mockStore.updateById('campaign_leads', id, {
            assigned_agent_id: null,
            allocated_at: null,
            status: 'PENDING',
            updated_at: new Date(),
          });
        }
        return { id, status: 'QUEUED', message: 'Lead released back to queue' };
      }
      throw new NotFoundError(`TVC Lead '${id}' not found`);
    }

    const updated = await tvcModel.updateLead(id, {
      agent_id: null,
      status: 'QUEUED',
      locked_at: null,
      lock_expires_at: null,
    });

    return updated;
  },

  /**
   * Assign TVC lead to specific agent
   * @param {string} id
   * @param {string} agentId
   * @returns {Promise<object>}
   */
  async assignLead(id, agentId) {
    const lead = await tvcModel.findById(id);
    if (!lead) {
      throw new NotFoundError(`TVC Lead '${id}' not found`);
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + LOCK_TIMEOUT_MS);

    return tvcModel.updateLead(id, {
      agent_id: agentId,
      status: 'IN_PROGRESS',
      locked_at: now,
      lock_expires_at: expiresAt,
    });
  },

  /**
   * Synchronize TVC verification record to the TVC Output table (exact 49 columns).
   * Matches schema of C:/Users/alomg/OneDrive/Documents/tvc.csv
   */
  async syncToTvcOutputTable(project, leadData, attemptData, user = {}) {
    try {
      if (!project) return;
      const outputTableName = project.output1_table_name || (project.client_table_name ? deriveTvcTableNames(project.client_table_name).outputTable : null);
      if (!outputTableName) return;

      // Ensure TVC dynamic tables exist with all 49 columns
      await ensureTvcDynamicTables(project.client_table_name, outputTableName).catch((e) => {
        logger.warn(`[TVC Output Table] Note on table check: ${e.message}`);
      });

      const leadMeta = typeof leadData.metadata === 'object' && leadData.metadata !== null
        ? leadData.metadata
        : (typeof leadData.metadata === 'string' ? JSON.parse(leadData.metadata || '{}') : {});

      const raw = leadData.rawRow || leadMeta || {};
      const answers = attemptData.verificationAnswers || attemptData.answers || {};
      const now = new Date();
      const submissionId = String(
        leadData.submission_id_dr || leadData.submission_id || leadData.id || raw.submission_id_dr || raw.submission_id || ''
      );
      if (!submissionId) return;

      const agentIdentifier = String(user.email || user.id || attemptData.agentId || leadData.agent_id || raw.agent_id || 'tele_verifier');

      const outRow = {
        submission_id: submissionId,
        audio_link: attemptData.recordingUrl || attemptData.audio_url || leadData.audio_url || raw.audio_link || null,
        ac_num: String(leadData.ac_num || raw.ac_num || '101'),
        fa: String(leadData.FA || leadData.fa || raw.FA || raw.fa || 'FA'),
        collector_emailid: String(leadData.collector_emailid || raw.collector_emailid || 'collector@survey.internal'),
        tl_id: String(leadData.tl_id || raw.tl_id || 'TL-01'),
        duration: parseFloat(attemptData.callDuration || leadData.duration || raw.duration || 120),
        submission_date: String(leadData.submission_date || leadData.Date || raw.Date || raw.submission_date || now.toISOString().replace('T', ' ').substring(0, 19)),
        dumping_date: String(leadData.dumping_date || raw.dumping_date || now.toISOString().split('T')[0]),
        batch_slot: String(leadData.batch_slot || raw.batch_slot || now.toISOString().replace('T', ' ').substring(0, 19)),
        religion: String(answers.religion || raw.religion || 'GEN'),
        introduction: String(answers.introduction || (answers.q1Visited === 'NO_NEVER' ? 'No' : 'Yes')),
        ac_name: String(leadData.ac_name || raw.ac_name || leadData.constituency || 'Assembly'),
        full_name: String(leadData.respondent_name || leadData.full_name || raw.resp_full_name || raw.full_name || 'Respondent'),
        gender: String(leadData.gender || raw.gender || 'Male'),
        phone_no: String(leadData.phone_number || leadData.phone_no || raw.phone_no || 'N/A'),
        age: String(answers.actualAge || leadData.age || raw.age || '35'),
        caste: String(answers.caste || leadData.caste || raw.caste || 'General'),
        major_problems: String(answers.major_problems || raw.major_problems || 'Issues identified'),
        party_led_development_state: String(answers.party_led_development_state || raw.party_led_development_state || ''),
        state_govt_change: String(answers.state_govt_change || raw.state_govt_change || 'No'),
        winner_perception_state: String(answers.winner_perception_state || raw.winner_perception_state || ''),
        mla_choice: String(answers.mla_choice || raw.mla_choice || ''),
        vi_mla_choice_followup_for_koibhi: String(answers.vi_mla_choice_followup_for_koibhi || raw.vi_mla_choice_followup_for_koibhi || ''),
        voting_intention_vs_party: String(answers.voting_intention_vs_party || raw.voting_intention_vs_party || ''),
        vi_mla_choice_swap_new: String(answers.vi_mla_choice_swap_new || raw.vi_mla_choice_swap_new || ''),
        vi_mla_choice_swap_3: String(answers.vi_mla_choice_swap_3 || raw.vi_mla_choice_swap_3 || ''),
        vs_past_party: String(answers.vs_past_party || raw.vs_past_party || ''),
        ls_past_party: String(answers.ls_past_party || raw.ls_past_party || ''),
        mla_awareness: String(answers.mla_awareness || raw.mla_awareness || 'Yes'),
        mla_satisfaction: String(answers.mla_satisfaction || raw.mla_satisfaction || ''),
        state_govt_satisfaction: String(answers.state_govt_satisfaction || raw.state_govt_satisfaction || ''),
        cm_satisfaction: String(answers.cm_satisfaction || raw.cm_satisfaction || ''),
        central_govt_satisfaction: String(answers.central_govt_satisfaction || raw.central_govt_satisfaction || ''),
        pm_satisfaction: String(answers.pm_satisfaction || raw.pm_satisfaction || ''),
        cm_choice: String(answers.cm_choice || raw.cm_choice || ''),
        voting_intention_ls_party: String(answers.voting_intention_ls_party || raw.voting_intention_ls_party || ''),
        vs_past_candidate: String(answers.vs_past_candidate || raw.vs_past_candidate || ''),
        nda_vote_reason: String(answers.nda_vote_reason || raw.nda_vote_reason || ''),
        mgb_vote_reason: String(answers.mgb_vote_reason || raw.mgb_vote_reason || ''),
        other_vote_reason: String(answers.other_vote_reason || raw.other_vote_reason || ''),
        situation_followup: String(answers.situation_followup || raw.situation_followup || ''),
        ls_past_candidate: String(answers.ls_past_candidate || raw.ls_past_candidate || ''),
        vs_past_voted_confirmation: String(answers.vs_past_voted_confirmation || raw.vs_past_voted_confirmation || ''),
        ls_past_voted_confirmation: String(answers.ls_past_voted_confirmation || raw.ls_past_voted_confirmation || ''),
        audit_status: String(attemptData.disposition || 'COMPLETED'),
        pushed: '1',
        assignment_time: String(leadData.assignment_time || raw.assignment_time || now.toISOString().replace('T', ' ').substring(0, 19)),
        agent_id: agentIdentifier,
      };

      if (db && db.schema) {
        const hasOut = await db.schema.hasTable(outputTableName).catch(() => false);
        if (hasOut) {
          const existing = await db(outputTableName).where('submission_id', submissionId).first().catch(() => null);
          if (existing) {
            await db(outputTableName).where('submission_id', submissionId).update(outRow);
          } else {
            await db(outputTableName).insert(outRow);
          }
          logger.info(`[TVC 2-Table] Verification successfully synced to TVC Output table "${outputTableName}" (${submissionId}) with 49 columns.`);
        }
      }

      // Also update TVC Input Table status if present
      if (project.client_table_name && db && db.schema) {
        const hasIn = await db.schema.hasTable(project.client_table_name).catch(() => false);
        if (hasIn) {
          await db(project.client_table_name)
            .where('submission_id_dr', submissionId)
            .update({
              tvc_status: attemptData.disposition || 'COMPLETED',
              agent_id: agentIdentifier,
              assignment_time: now.toISOString().replace('T', ' ').substring(0, 19),
            })
            .catch(() => {});
          logger.info(`[TVC 2-Table] Verification status synced to TVC Input table "${project.client_table_name}" (${submissionId}).`);
        }
      }
    } catch (err) {
      logger.warn(`[TVC 2-Table Sync Warning] Could not sync to TVC tables: ${err.message}`);
    }
  },

  /**
   * Record a call attempt and update disposition and lead state.
   * When verification is complete, unlocks the lead and allows agent to fetch the next lead.
   * Updates verification status and persists strictly to local DB with zero external client push.
   * @param {string} id
   * @param {object} attemptData
   * @param {object} user
   * @returns {Promise<object>}
   */
  async logAttempt(id, attemptData, user = {}) {
    let lead = await tvcModel.findById(id);
    if (!lead) {
      let candLead = null;
      try {
        candLead = await db('campaign_leads').where('id', id).first();
      } catch (e) {
        candLead = mockStore.findById('campaign_leads', id);
      }

      // If not in campaign_leads, check dynamic TVC Input tables
      if (!candLead && db && db.schema) {
        try {
          const tvcProjects = await db('projects').where('type', 'TVC').orWhereRaw("enabled_modules::text LIKE '%TVC%'");
          for (const p of tvcProjects) {
            if (p.client_table_name) {
              const hasIn = await db.schema.hasTable(p.client_table_name);
              if (hasIn) {
                const foundRow = await db(p.client_table_name).where('submission_id_dr', id).first();
                if (foundRow) {
                  candLead = {
                    id,
                    submission_id: id,
                    submission_id_dr: id,
                    project_id: p.id,
                    assigned_agent_id: user.id || foundRow.agent_id,
                    respondent_name: foundRow.resp_full_name,
                    phone_number: foundRow.phone_no,
                    rawRow: foundRow,
                    metadata: foundRow,
                  };
                  break;
                }
              }
            }
          }
        } catch (dynErr) {
          logger.warn(`[TVC logAttempt dynamic lookup] ${dynErr.message}`);
        }
      }

      if (candLead) {
        const agentId = user.id || candLead.assigned_agent_id;
        const meta = typeof candLead.metadata === 'object' && candLead.metadata !== null 
          ? candLead.metadata 
          : JSON.parse(candLead.metadata || '{}');

        const isVerified = attemptData.disposition === 'Complete' || attemptData.disposition === 'VERIFIED';
        const isRejected = ['Incomplete Form', 'Multiple Survey', 'Not A Voter', 'REFUSED', 'GHOST_SURVEY', 'CONNECTED_DISCREPANCY'].includes(attemptData.disposition);
        const attemptNum = Number(candLead.attempt_count || 0) + 1;

        let newStatus = 'PENDING';
        if (isVerified) {
          newStatus = 'COMPLETED';
        } else if (isRejected) {
          newStatus = 'REJECTED';
        } else if (attemptNum >= 3) {
          newStatus = 'UNREACHABLE';
        }

        const updatePayload = {
          status: newStatus,
          attempt_count: attemptNum,
          assigned_agent_id: isVerified ? agentId : null,
          allocated_at: isVerified ? new Date() : null,
          updated_at: new Date(),
          metadata: JSON.stringify({
            ...meta,
            tvcVerification: attemptData,
            tvc_status: attemptData.disposition,
            tvc_notes: attemptData.notes,
          }),
        };

        try {
          await db('campaign_leads').where('id', candLead.id).update(updatePayload);
        } catch (dbErr) {
          if (mockStore && mockStore.updateById) {
            mockStore.updateById('campaign_leads', candLead.id, updatePayload);
          }
        }

        // Update submissions table tvc_status in internal DB if matching record exists
        const submissionId = meta.submission_id || candLead.id;
        try {
          await db('submissions')
            .where('submission_id', submissionId)
            .orWhere('id', submissionId)
            .update({
              tvc_status: isVerified ? 'PASSED' : isRejected ? 'FAILED' : 'QUEUED',
              updated_at: new Date(),
            });
        } catch (subErr) {
          if (mockStore && mockStore.updateById) {
            mockStore.updateById('submissions', submissionId, {
              tvc_status: isVerified ? 'PASSED' : isRejected ? 'FAILED' : 'QUEUED',
            });
          }
        }

        // Sync to TVC 2-Table output (49 columns)
        try {
          const project = await db('projects').where('id', candLead.project_id).first().catch(() => null);
          await this.syncToTvcOutputTable(project, candLead, attemptData, user);
        } catch (syncErr) {
          logger.warn(`[TVC Output Sync] ${syncErr.message}`);
        }

        logger.info(`[TVC_LOG_ATTEMPT] Verification for lead '${candLead.id}' saved strictly to internal DB.`);

        return {
          id: candLead.id,
          status: attemptData.disposition,
          isCompleted: true,
          canFetchNext: true,
        };
      }

      throw new NotFoundError(`TVC Lead '${id}' not found`);
    }

    const attemptNumber = Number(lead.total_attempts || 0) + 1;
    const agentId = user.id || lead.agent_id;

    // 1. Insert attempt record
    const attemptRecord = await tvcModel.createAttempt({
      tvc_lead_id: lead.id,
      agent_id: agentId,
      attempt_number: attemptNumber,
      dialer_call_id: attemptData.dialerCallId || null,
      call_status: attemptData.callStatus || 'ANSWERED',
      disposition: attemptData.disposition,
      call_duration: attemptData.callDuration || 0,
      recording_url: attemptData.recordingUrl || null,
      verification_answers: JSON.stringify(attemptData.verificationAnswers || attemptData.verificationResult || {}),
      notes: attemptData.notes || null,
      callback_time: attemptData.callbackTime || null,
      attempted_at: new Date(),
    });

    // 2. Disposition state machine logic
    let newLeadStatus = lead.status;
    let newVerificationStatus = lead.verification_status;
    let newNextCallbackAt = null;
    let verificationScore = attemptData.verificationScore !== undefined ? attemptData.verificationScore : lead.verification_score;
    let isCompleted = false;

    switch (attemptData.disposition) {
      case 'Complete':
      case 'CONNECTED_VERIFIED':
      case 'VERIFIED':
        newLeadStatus = 'COMPLETED';
        newVerificationStatus = 'VERIFIED';
        verificationScore = verificationScore || 100;
        isCompleted = true;
        break;

      case 'Incomplete Form':
      case 'Multiple Survey':
      case 'Not A Voter':
      case 'CONNECTED_DISCREPANCY':
      case 'GHOST_SURVEY':
      case 'REFUSED':
        newLeadStatus = 'FAILED';
        newVerificationStatus = 'FAILED';
        verificationScore = verificationScore || 0;
        isCompleted = true;
        break;

      case 'Call Disconnected':
      case 'Ringing':
      case 'Not Reachable':
      case 'Invalid Number':
      case 'Number Busy':
      case 'Voice Issue':
      case 'Switched Off':
      case 'CALLBACK_REQUESTED':
      case 'CALLBACK':
        if (attemptData.disposition === 'CALLBACK_REQUESTED' || attemptData.disposition === 'CALLBACK') {
          newLeadStatus = 'CALLBACK_SCHEDULED';
          newNextCallbackAt = attemptData.callbackTime || new Date(Date.now() + 4 * 60 * 60 * 1000);
          isCompleted = true;
          break;
        }
        // Fallthrough for tele-connection drops / unreachability
      case 'BUSY':
      case 'NO_ANSWER':
      case 'SWITCHED_OFF':
      case 'WRONG_NUMBER':
      case 'UNREACHABLE':
      default:
        if (attemptNumber >= Number(lead.max_attempts || 3)) {
          newLeadStatus = 'MAX_ATTEMPTS_EXCEEDED';
          newVerificationStatus = 'UNREACHABLE';
          isCompleted = true;
        } else {
          newLeadStatus = 'QUEUED';
          isCompleted = true; // Released back to queue for later re-dialing
        }
        break;
    }

    const updateLeadPayload = {
      total_attempts: attemptNumber,
      last_attempt_at: new Date(),
      last_disposition: attemptData.disposition,
      status: newLeadStatus,
      verification_status: newVerificationStatus,
      verification_score: verificationScore,
      next_callback_at: newNextCallbackAt,
      // If completed or freed, clear lock so agent is immediately eligible for next lead!
      ...(isCompleted
        ? {
            agent_id: newLeadStatus === 'COMPLETED' || newLeadStatus === 'FAILED' ? agentId : null,
            locked_at: null,
            lock_expires_at: null,
            completed_at: new Date(),
          }
        : {
            locked_at: new Date(),
            lock_expires_at: new Date(Date.now() + LOCK_TIMEOUT_MS),
          }),
    };

    const updatedLead = await tvcModel.updateLead(lead.id, updateLeadPayload);

    // Sync status to canonical submissions table
    let submissionTvcStatus = 'IN_PROGRESS';
    if (newVerificationStatus === 'VERIFIED') submissionTvcStatus = 'VERIFIED';
    else if (newVerificationStatus === 'FAILED') submissionTvcStatus = 'FAILED';
    else if (newLeadStatus === 'MAX_ATTEMPTS_EXCEEDED') submissionTvcStatus = 'UNREACHABLE';

    try {
      await db('submissions')
        .where('id', lead.submission_id)
        .update({
          tvc_status: submissionTvcStatus,
          updated_at: db.fn.now(),
        });
    } catch (e) {
      if (mockStore && mockStore.updateById) {
        mockStore.updateById('submissions', lead.submission_id, { tvc_status: submissionTvcStatus });
      }
    }

    // Sync to TVC 2-Table output (49 columns)
    try {
      const project = await db('projects').where('id', lead.project_id).first().catch(() => null);
      await this.syncToTvcOutputTable(project, lead, attemptData, user);
    } catch (syncErr) {
      logger.warn(`[TVC Output Sync] ${syncErr.message}`);
    }

    return {
      attempt: attemptRecord,
      lead: updatedLead,
      isCompleted,
      canFetchNext: isCompleted,
    };
  },

  /**
   * Find attempt history for a lead
   * @param {string} id
   * @returns {Promise<Array<object>>}
   */
  async getAttempts(id) {
    const lead = await tvcModel.findById(id);
    if (!lead) {
      throw new NotFoundError(`TVC Lead '${id}' not found`);
    }

    return tvcModel.findAttempts(lead.id);
  },

  /**
   * Get TVC metrics and dispositions breakdown
   * @param {object} filters
   * @param {object} tenantContext
   * @returns {Promise<object>}
   */
  async getMetrics(filters = {}, tenantContext = {}) {
    const scopedFilters = { ...filters };
    if (tenantContext.vendorId) {
      scopedFilters.vendorId = tenantContext.vendorId;
    }
    return tvcModel.getMetrics(scopedFilters);
  },
};

module.exports = tvcService;
