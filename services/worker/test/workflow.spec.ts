/**
 * Workflow orchestration tests using @temporalio/testing.
 *
 * These tests run the ForecastWorkflow against mock activities
 * in a lightweight Temporal test environment (no server needed).
 *
 * Run: npm --workspace services/worker run test
 */
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker, Runtime, DefaultLogger } from '@temporalio/worker';
import { WorkflowFailedError } from '@temporalio/client';
import { FORECAST_TASK_QUEUE } from '@forecastccu/schema';
import { ForecastWorkflow } from '../src/workflows/forecast.workflow';
import type { ForecastActivities } from '../src/activities/forecast.activities';
import type { EnrichmentActivities } from '../src/activities/enrichment.activities';
import type { HistoryActivities } from '../src/activities/history.activities';

// Silence Temporal logs during tests
Runtime.install({ logger: new DefaultLogger('WARN') });

type AllActivities = ForecastActivities & EnrichmentActivities & HistoryActivities;

const defaultHistory = {
  comparableEvents: [],
  selectionScores: {},
};

const defaultForecast = {
  globalPeakCcu: 3_000_000,
  regionalPeakCcu: { US: 2_700_000, GB: 200_000, CA: 100_000 },
  featureVector: {
    modelId: 'historical-baseline-v1',
    modelVersion: '1.0.0',
    comparableEventIds: [],
    baseline_global: 3_000_000,
    baseline_regional: { US: 2_700_000, GB: 200_000, CA: 100_000 },
    selectionScores: {},
  },
};

function buildMockActivities(
  overrides: Partial<AllActivities> = {},
): AllActivities {
  return {
    validateInputActivity: async () => {},
    createEnrichmentPlanActivity: async () => ({ queries: ['q1', 'q2', 'q3'] }),
    executeWebSearchActivity: async () => {},
    normalizeEvidenceActivity: async () => {},
    loadInternalHistoryActivity: async () => defaultHistory,
    buildFeatureVectorActivity: async () => defaultForecast,
    persistForecastVersionActivity: async () => ({ versionNumber: 1, versionId: 'v1' }),
    computeDiffActivity: async () => {},
    markJobCompleteActivity: async () => {},
    markJobFailedActivity: async () => {},
    // Kept for backward compat but not used in the main workflow path
    generatePlaceholderForecastActivity: async () => ({
      globalPeakCcu: 0,
      regionalPeakCcu: {},
      featureVector: {},
    }),
    ...overrides,
  };
}

describe('ForecastWorkflow – orchestration', () => {
  let testEnv: TestWorkflowEnvironment;

  beforeAll(async () => {
    testEnv = await TestWorkflowEnvironment.createLocal();
  });

  afterAll(async () => {
    await testEnv?.teardown();
  });

  async function runWorkflow(activities: AllActivities, jobId = 'test-job-001') {
    const worker = await Worker.create({
      connection: testEnv.nativeConnection,
      taskQueue: FORECAST_TASK_QUEUE,
      workflowsPath: require.resolve('../src/workflows/forecast.workflow'),
      activities,
    });

    return worker.runUntil(
      testEnv.client.workflow.execute(ForecastWorkflow, {
        taskQueue: FORECAST_TASK_QUEUE,
        workflowId: `test-${jobId}-${Date.now()}`,
        args: [jobId],
      }),
    );
  }

  // ── Happy path ─────────────────────────────────────────────────────────

  it('executes all nine activities in order', async () => {
    const callOrder: string[] = [];

    const activities = buildMockActivities({
      validateInputActivity: async () => { callOrder.push('validate'); },
      createEnrichmentPlanActivity: async () => {
        callOrder.push('plan');
        return { queries: ['q1', 'q2'] };
      },
      executeWebSearchActivity: async () => { callOrder.push('search'); },
      normalizeEvidenceActivity: async () => { callOrder.push('normalize'); },
      loadInternalHistoryActivity: async () => {
        callOrder.push('loadHistory');
        return defaultHistory;
      },
      buildFeatureVectorActivity: async () => {
        callOrder.push('buildFV');
        return defaultForecast;
      },
      persistForecastVersionActivity: async () => {
        callOrder.push('persist');
        return { versionNumber: 1, versionId: 'v1' };
      },
      computeDiffActivity: async () => { callOrder.push('diff'); },
      markJobCompleteActivity: async () => { callOrder.push('complete'); },
    });

    await runWorkflow(activities, 'order-test');

    expect(callOrder).toEqual([
      'validate',
      'plan',
      'search',
      'normalize',
      'loadHistory',
      'buildFV',
      'persist',
      'diff',
      'complete',
    ]);
  });

  it('passes queries from createEnrichmentPlanActivity to executeWebSearchActivity', async () => {
    const capturedQueries: string[] = [];

    const activities = buildMockActivities({
      createEnrichmentPlanActivity: async () => ({
        queries: ['q-nfl-1', 'q-nfl-2', 'q-nfl-3'],
      }),
      executeWebSearchActivity: async (_jobId, queries) => {
        capturedQueries.push(...queries);
      },
    });

    await runWorkflow(activities, 'queries-test');

    expect(capturedQueries).toEqual(['q-nfl-1', 'q-nfl-2', 'q-nfl-3']);
  });

  it('passes history result from loadInternalHistoryActivity to buildFeatureVectorActivity', async () => {
    const history = {
      comparableEvents: [
        {
          eventId: 'evt-pass-test',
          sport: 'NFL',
          league: 'NFL Regular Season',
          platform: 'peacock',
          teams: { home: 'Chiefs', away: 'Eagles' },
          stage: 'game',
          startTimeUtc: '2025-09-07T20:00:00Z',
          globalPeak: 3_000_000,
          regionalPeak: { US: 2_700_000 },
        },
      ],
      selectionScores: { 'evt-pass-test': 100 },
    };

    let capturedHistory: typeof history | undefined;

    const activities = buildMockActivities({
      loadInternalHistoryActivity: async () => history,
      buildFeatureVectorActivity: async (_jobId, h) => {
        capturedHistory = h as typeof history;
        return defaultForecast;
      },
    });

    await runWorkflow(activities, 'history-pass-test');

    expect(capturedHistory?.comparableEvents[0].eventId).toBe('evt-pass-test');
    expect(capturedHistory?.selectionScores['evt-pass-test']).toBe(100);
  });

  // ── Failure handling ───────────────────────────────────────────────────

  it('calls markJobFailedActivity when validateInput throws', async () => {
    let failedCalled = false;

    const activities = buildMockActivities({
      validateInputActivity: async () => {
        throw new Error('Simulated validation failure');
      },
      markJobFailedActivity: async (_jobId, _reason) => {
        failedCalled = true;
      },
    });

    await expect(runWorkflow(activities, 'fail-validate')).rejects.toBeInstanceOf(
      WorkflowFailedError,
    );
    expect(failedCalled).toBe(true);
  });

  it('continues when executeWebSearchActivity succeeds (even with partial failures internally)', async () => {
    let normalizeReached = false;

    const activities = buildMockActivities({
      executeWebSearchActivity: async () => {
        // Simulate: searches ran but some failed – activity does NOT throw
      },
      normalizeEvidenceActivity: async () => { normalizeReached = true; },
    });

    await runWorkflow(activities, 'partial-search');
    expect(normalizeReached).toBe(true);
  });

  it('proceeds to buildFeatureVectorActivity after loadInternalHistoryActivity', async () => {
    let buildFVReached = false;

    const activities = buildMockActivities({
      loadInternalHistoryActivity: async () => defaultHistory,
      buildFeatureVectorActivity: async () => {
        buildFVReached = true;
        return defaultForecast;
      },
    });

    await runWorkflow(activities, 'history-to-build');
    expect(buildFVReached).toBe(true);
  });

  // ── Version / diff logic ───────────────────────────────────────────────

  it('does NOT invoke computeDiff side-effects for versionNumber=1', async () => {
    let diffVersionSeen: number | undefined;

    const activities = buildMockActivities({
      persistForecastVersionActivity: async () => ({ versionNumber: 1, versionId: 'v1' }),
      computeDiffActivity: async (_jobId, versionNumber) => {
        diffVersionSeen = versionNumber;
      },
    });

    await runWorkflow(activities, 'no-diff-test');
    // computeDiffActivity IS called with versionNumber=1 but the activity
    // implementation does nothing for versionNumber <= 1.
    expect(diffVersionSeen).toBe(1);
  });

  it('passes versionNumber=2 to computeDiffActivity on rerun', async () => {
    let diffVersionSeen: number | undefined;

    const activities = buildMockActivities({
      persistForecastVersionActivity: async () => ({ versionNumber: 2, versionId: 'v2' }),
      computeDiffActivity: async (_jobId, versionNumber) => {
        diffVersionSeen = versionNumber;
      },
    });

    await runWorkflow(activities, 'diff-v2-test');
    expect(diffVersionSeen).toBe(2);
  });
});
