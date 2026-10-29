/**
 * @file voice-fraud.model.js
 * @description Data access layer for Agent Voice Baseline Profiles and Voice Fraud Incident Records.
 */

const { db, withDbFallback } = require('../../database/connection');
const mockStore = require('../../database/mockStore');
const logger = require('../../utils/logger');
const { v4: uuidv4 } = require('uuid');

class VoiceFraudModel {
  /**
   * Find baseline voice profile by agentId
   * @param {string} agentId
   * @returns {Promise<object|null>}
   */
  async findBaselineByAgentId(agentId) {
    if (!agentId) return null;
    return withDbFallback(
      () =>
        db('agent_voice_profiles')
          .where({ agent_id: String(agentId), status: 'ACTIVE' })
          .orderBy('created_at', 'desc')
          .first(),
      () => {
        const profiles = mockStore.agent_voice_profiles || [];
        return (
          profiles.find(
            (p) => String(p.agent_id) === String(agentId) && p.status === 'ACTIVE'
          ) || null
        );
      }
    );
  }

  /**
   * Upsert agent voice baseline profile
   * @param {object} profileData
   * @returns {Promise<object>}
   */
  async upsertAgentProfile(profileData) {
    const existing = await this.findBaselineByAgentId(profileData.agent_id);
    const id = existing ? existing.id : profileData.id || uuidv4();
    const now = new Date();

    const record = {
      id,
      agent_id: String(profileData.agent_id),
      agent_name: profileData.agent_name,
      role: profileData.role || 'CATI_AGENT',
      audio_url: profileData.audio_url,
      storage_path: profileData.storage_path || null,
      embedding: typeof profileData.embedding === 'object' ? JSON.stringify(profileData.embedding) : profileData.embedding,
      sample_duration_sec: profileData.sample_duration_sec || 0,
      snr_db: profileData.snr_db || 30.0,
      pitch_f0: profileData.pitch_f0 || null,
      enrolled_by: profileData.enrolled_by || null,
      status: 'ACTIVE',
      metadata: typeof profileData.metadata === 'object' ? JSON.stringify(profileData.metadata) : profileData.metadata,
      updated_at: now,
    };

    if (!existing) {
      record.created_at = now;
    }

    return withDbFallback(
      async () => {
        if (existing) {
          const [updated] = await db('agent_voice_profiles')
            .where({ id })
            .update(record)
            .returning('*');
          return updated;
        } else {
          const [inserted] = await db('agent_voice_profiles')
            .insert(record)
            .returning('*');
          return inserted;
        }
      },
      () => {
        if (!mockStore.agent_voice_profiles) {
          mockStore.agent_voice_profiles = [];
        }
        if (existing) {
          const idx = mockStore.agent_voice_profiles.findIndex((p) => p.id === id);
          if (idx !== -1) {
            mockStore.agent_voice_profiles[idx] = { ...mockStore.agent_voice_profiles[idx], ...record };
            return mockStore.agent_voice_profiles[idx];
          }
        }
        mockStore.agent_voice_profiles.unshift(record);
        return record;
      }
    );
  }

  /**
   * Lists all agent voice profiles
   * @param {object} [filters]
   * @returns {Promise<Array<object>>}
   */
  async listAgentProfiles(filters = {}) {
    return withDbFallback(
      () => {
        let q = db('agent_voice_profiles').orderBy('created_at', 'desc');
        if (filters.status) q = q.where('status', filters.status);
        if (filters.agent_id) q = q.where('agent_id', filters.agent_id);
        return q;
      },
      () => {
        let list = [...(mockStore.agent_voice_profiles || [])];
        if (filters.status) list = list.filter((p) => p.status === filters.status);
        if (filters.agent_id) list = list.filter((p) => p.agent_id === filters.agent_id);
        return list;
      }
    );
  }

  /**
   * Delete or archive agent baseline profile
   * @param {string} agentId
   * @returns {Promise<boolean>}
   */
  async deleteAgentProfile(agentId) {
    return withDbFallback(
      async () => {
        await db('agent_voice_profiles').where({ agent_id: String(agentId) }).delete();
        return true;
      },
      () => {
        if (mockStore.agent_voice_profiles) {
          mockStore.agent_voice_profiles = mockStore.agent_voice_profiles.filter(
            (p) => String(p.agent_id) !== String(agentId)
          );
        }
        return true;
      }
    );
  }

  /**
   * Create a new voice fraud incident record
   * @param {object} fraudData
   * @returns {Promise<object>}
   */
  async createFraudRecord(fraudData) {
    const isUuid = fraudData.id && typeof fraudData.id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(fraudData.id);
    const id = isUuid ? fraudData.id : uuidv4();
    const now = new Date();

    const record = {
      id,
      lead_id: String(fraudData.lead_id),
      project_id: fraudData.project_id || null,
      agent_id: String(fraudData.agent_id),
      agent_name: fraudData.agent_name || 'Unknown Agent',
      fraud_type: fraudData.fraud_type, // VOICE_MISMATCH, SELF_INTERVIEW_MIMICRY, BASELINE_VOICE_MISSING
      confidence_score: fraudData.confidence_score !== undefined ? fraudData.confidence_score : 0.9,
      similarity_score: fraudData.similarity_score !== undefined ? fraudData.similarity_score : null,
      status: fraudData.status || 'UNDER_REVIEW',
      recording_url: fraudData.recording_url || null,
      baseline_audio_url: fraudData.baseline_audio_url || null,
      details: typeof fraudData.details === 'object' ? fraudData.details : JSON.parse(fraudData.details || '{}'),
      notes: fraudData.notes || null,
      resolved_by: fraudData.resolved_by || null,
      resolved_at: fraudData.resolved_at || null,
      created_at: now,
      updated_at: now,
    };

    return withDbFallback(
      async () => {
        const [inserted] = await db('voice_fraud_records')
          .insert({
            ...record,
            details: JSON.stringify(record.details),
          })
          .returning('*');
        return inserted;
      },
      () => {
        if (!mockStore.voice_fraud_records) {
          mockStore.voice_fraud_records = [];
        }
        mockStore.voice_fraud_records.unshift(record);
        return record;
      }
    );
  }

  /**
   * Query fraud records with pagination and filters
   * @param {object} filters
   * @returns {Promise<{ records: Array<object>, total: number }>}
   */
  async findFraudRecords(filters = {}) {
    const page = parseInt(filters.page || 1, 10);
    const limit = parseInt(filters.limit || 50, 10);
    const offset = (page - 1) * limit;

    return withDbFallback(
      async () => {
        let q = db('voice_fraud_records');
        if (filters.status && filters.status !== 'ALL') {
          q = q.where('status', filters.status);
        }
        if (filters.fraud_type && filters.fraud_type !== 'ALL') {
          q = q.where('fraud_type', filters.fraud_type);
        }
        if (filters.agent_id) {
          q = q.where('agent_id', filters.agent_id);
        }
        if (filters.project_id) {
          q = q.where('project_id', filters.project_id);
        }
        if (filters.search) {
          const s = `%${filters.search.toLowerCase()}%`;
          q = q.where((builder) => {
            builder.whereRaw('LOWER(agent_name) LIKE ?', [s])
              .orWhereRaw('LOWER(lead_id) LIKE ?', [s]);
          });
        }

        const countRes = await q.clone().count('id as total').first();
        const total = parseInt(countRes?.total || 0, 10);
        const records = await q.orderBy('created_at', 'desc').limit(limit).offset(offset);
        return { records, total };
      },
      () => {
        let list = [...(mockStore.voice_fraud_records || [])];
        if (filters.status && filters.status !== 'ALL') {
          list = list.filter((r) => r.status === filters.status);
        }
        if (filters.fraud_type && filters.fraud_type !== 'ALL') {
          list = list.filter((r) => r.fraud_type === filters.fraud_type);
        }
        if (filters.agent_id) {
          list = list.filter((r) => String(r.agent_id) === String(filters.agent_id));
        }
        if (filters.project_id) {
          list = list.filter((r) => String(r.project_id) === String(filters.project_id));
        }
        if (filters.search) {
          const s = filters.search.toLowerCase();
          list = list.filter(
            (r) =>
              (r.agent_name || '').toLowerCase().includes(s) ||
              (r.lead_id || '').toLowerCase().includes(s)
          );
        }
        const total = list.length;
        const records = list.slice(offset, offset + limit);
        return { records, total };
      }
    );
  }

  /**
   * Find fraud record by ID
   * @param {string} id
   * @returns {Promise<object|null>}
   */
  async findFraudRecordById(id) {
    return withDbFallback(
      () => db('voice_fraud_records').where({ id }).first(),
      () => {
        const records = mockStore.voice_fraud_records || [];
        return records.find((r) => r.id === id) || null;
      }
    );
  }

  /**
   * Update fraud record status (CONFIRMED_FRAUD, UNDER_REVIEW, DISMISSED)
   * @param {string} id
   * @param {object} updateData
   * @returns {Promise<object|null>}
   */
  async updateFraudRecordStatus(id, updateData) {
    const now = new Date();
    const payload = {
      status: updateData.status,
      notes: updateData.notes || undefined,
      resolved_by: updateData.resolved_by || null,
      resolved_at: now,
      updated_at: now,
    };

    return withDbFallback(
      async () => {
        const [updated] = await db('voice_fraud_records')
          .where({ id })
          .update(payload)
          .returning('*');
        return updated;
      },
      () => {
        const records = mockStore.voice_fraud_records || [];
        const record = records.find((r) => r.id === id);
        if (record) {
          Object.assign(record, payload);
          return record;
        }
        return null;
      }
    );
  }

  /**
   * Returns aggregate counts and metrics for the Voice Fraud Radar
   * @returns {Promise<object>}
   */
  async getFraudStats() {
    const { records: allRecords } = await this.findFraudRecords({ limit: 10000 });
    const total = allRecords.length;
    const voiceMismatch = allRecords.filter((r) => r.fraud_type === 'VOICE_MISMATCH').length;
    const mimicry = allRecords.filter((r) => r.fraud_type === 'SELF_INTERVIEW_MIMICRY').length;
    const missingBaseline = allRecords.filter((r) => r.fraud_type === 'BASELINE_VOICE_MISSING').length;
    const confirmed = allRecords.filter((r) => r.status === 'CONFIRMED_FRAUD').length;
    const underReview = allRecords.filter((r) => r.status === 'UNDER_REVIEW').length;
    const dismissed = allRecords.filter((r) => r.status === 'DISMISSED').length;

    // Enrolled agents count vs total agents
    const enrolledProfiles = await this.listAgentProfiles();
    const enrolledAgentIds = new Set(enrolledProfiles.map((p) => String(p.agent_id)));

    const allUsers = mockStore.users || [];
    const agentRoles = ['CATI_AGENT', 'CAPI_AUDITOR', 'CAPI_AGENT', 'TVC_AGENT', 'FA_AGENT'];
    const agents = allUsers.filter((u) => {
      const roleObj = (mockStore.roles || []).find((r) => r.id === u.role_id);
      return roleObj && agentRoles.includes(roleObj.slug);
    });

    const totalAgentsCount = Math.max(agents.length, enrolledAgentIds.size);
    const enrolledAgentsCount = enrolledAgentIds.size;
    const missingAgentsCount = Math.max(0, totalAgentsCount - enrolledAgentsCount);

    return {
      total,
      voiceMismatch,
      mimicry,
      missingBaseline,
      confirmed,
      underReview,
      dismissed,
      totalAgentsCount,
      enrolledAgentsCount,
      missingAgentsCount,
      enrolledPercentage: totalAgentsCount > 0 ? parseFloat(((enrolledAgentsCount / totalAgentsCount) * 100).toFixed(1)) : 100,
    };
  }
}

module.exports = new VoiceFraudModel();
