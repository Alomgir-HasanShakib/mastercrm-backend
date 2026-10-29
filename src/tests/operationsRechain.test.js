/**
 * @file operationsRechain.test.js
 * @description Automated Unit & Integration tests for Data Rechain Engine and Operational Dashboard Analytics.
 */

const operationsService = require('../modules/operations/operations.service');

describe('Data Rechain (Recycling & Re-routing) Engine', () => {
  const mockAdminUser = {
    id: '11111111-1111-1111-1111-111111110001',
    organization_id: '00000000-0000-0000-0000-000000000001',
    email: 'admin@nvp.in',
  };

  test('1. Previews candidate records for a specific date (2026-10-05)', async () => {
    const preview = await operationsService.previewRechain({
      targetDate: '2026-10-05',
      rechainAll: false,
      module: 'ALL',
    });

    expect(preview).toBeDefined();
    expect(preview.targetDate).toBe('2026-10-05');
    expect(preview.totalCandidates).toBeGreaterThan(0);
    expect(preview.breakdown).toHaveProperty('submissions');
    expect(preview.breakdown).toHaveProperty('capiAudits');
    expect(preview.breakdown).toHaveProperty('tvcLeads');
  });

  test('2. Rechains incomplete records for 2026-10-05 and resets back to PENDING queue', async () => {
    const result = await operationsService.executeRechain(
      {
        targetDate: '2026-10-05',
        rechainAll: false,
        module: 'ALL',
        clearOrphanedOutputs: true,
        reason: 'Recycling stalled field data from 5th Oct',
      },
      mockAdminUser
    );

    expect(result).toBeDefined();
    expect(result.totalRecycled).toBeGreaterThan(0);
    expect(result.message).toContain('recycled and sent back to Pending queue');
    expect(result.recycledBreakdown.submissions).toBeGreaterThan(0);
    expect(result.clearedOutputs).toBeGreaterThanOrEqual(0);
  });

  test('3. Rechains all incomplete records across all dates when rechainAll is true', async () => {
    const result = await operationsService.executeRechain(
      {
        rechainAll: true,
        module: 'CAPI',
        clearOrphanedOutputs: true,
        reason: 'Reset stalled CAPI audits across all dates',
      },
      mockAdminUser
    );

    expect(result).toBeDefined();
    expect(result.targetDate).toBe('ALL');
    expect(result.module).toBe('CAPI');
    expect(result.totalRecycled).toBeGreaterThan(0);
  });

  test('4. Dashboard operational insights returns real-time KPIs, throughput, speedometers, and AC distribution', async () => {
    const insights = await operationsService.getDashboardInsights({});

    expect(insights).toBeDefined();
    expect(insights.kpiSummary).toHaveProperty('totalSubmissions');
    expect(insights.kpiSummary.totalSubmissions).toHaveProperty('change');
    expect(insights.liveModules.length).toBeGreaterThanOrEqual(5);

    // Verify vendor speedometers (dynamically derived from active DB vendors)
    expect(Array.isArray(insights.vendorSpeedometers)).toBe(true);
    if (insights.vendorSpeedometers.length > 0) {
      expect(insights.vendorSpeedometers[0]).toHaveProperty('throughput');
      expect(insights.vendorSpeedometers[0]).toHaveProperty('qcPassRate');
    }

    // Verify AC distribution
    expect(Array.isArray(insights.geographicDistribution.topACs)).toBe(true);
    expect(Array.isArray(insights.geographicDistribution.states)).toBe(true);

    // Verify disposition breakdown
    expect(Array.isArray(insights.dispositionBreakdown)).toBe(true);
  });
});
