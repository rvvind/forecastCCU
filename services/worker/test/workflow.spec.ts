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

// Silence Temporal logs during tests
Runtime.install({ logger: new DefaultLogger('WARN') });

describe('ForecastWorkflow – orchestration', () => {
  let testEnv: TestWorkflowEnvironment;

  beforeAll(async () => {
    testEnv = await TestWorkflowEnvironment.createLocal();
  });

  afterAll(async () => {
    await testEnv?.teardown();
  });

  async function runWorkflow(
    activities: Partial<ForecastActivities>,
    jobId = 'test-job-001',
  ) {
    const worker = await Worker.create({
      connection: testEnv.nativeConnection,
      taskQueue: FORECAST_TASK_QUEUE,
      workflowsPath: require.resolve('../src/workflows/forecast.workflow'),
      activities,
    });

    const result = await worker.runUntil(
      testEnv.client.workflow.execute(ForecastWorkflow, {
        taskQueue: FORECAST_TASK_QUEUE,
        workflowId: `test-${jobId}-${Date.now()}`,
        args: [jobId],
      }),
    );

    return result;
  }

  it('executes all five activities in order', async () => {
    const callOrder: string[] = [];

    const mockActivities: ForecastActivities = {
      validateInputActivity: async () => { callOrder.push('validate'); },
      generatePlaceholderForecastActivity: async () => {
        callOrder.push('generate');
        return { globalPeakCcu: 12000, regionalPeakCcu: { US: 6000, GB: 6000 }, featureVector: {} };
      },
      persistForecastVersionActivity: async () => {
        callOrder.push('persist');
        return { versionNumber: 1, versionId: 'v1' };
      },
      computeDiffActivity: async () => { callOrder.push('diff'); },
      markJobCompleteActivity: async () => { callOrder.push('complete'); },
      markJobFailedActivity: async () => { callOrder.push('failed'); },
    };

    await runWorkflow(mockActivities, 'order-test');

    expect(callOrder).toEqual(['validate', 'generate', 'persist', 'diff', 'complete']);
  });

  it('calls markJobFailedActivity when an activity throws', async () => {
    let failedCalled = false;

    const mockActivities: ForecastActivities = {
      validateInputActivity: async () => {
        throw new Error('Simulated validation failure');
      },
      generatePlaceholderForecastActivity: async () => ({
        globalPeakCcu: 0,
        regionalPeakCcu: {},
        featureVector: {},
      }),
      persistForecastVersionActivity: async () => ({
        versionNumber: 1,
        versionId: 'v1',
      }),
      computeDiffActivity: async () => {},
      markJobCompleteActivity: async () => {},
      markJobFailedActivity: async (_jobId, reason) => {
        failedCalled = true;
        expect(reason).toContain('Simulated validation failure');
      },
    };

    await expect(runWorkflow(mockActivities, 'fail-test')).rejects.toBeInstanceOf(
      WorkflowFailedError,
    );
    expect(failedCalled).toBe(true);
  });

  it('does NOT call computeDiffActivity when versionNumber is 1', async () => {
    let diffCalled = false;

    const mockActivities: ForecastActivities = {
      validateInputActivity: async () => {},
      generatePlaceholderForecastActivity: async () => ({
        globalPeakCcu: 10000,
        regionalPeakCcu: { US: 10000 },
        featureVector: {},
      }),
      persistForecastVersionActivity: async () => ({
        versionNumber: 1,
        versionId: 'v1',
      }),
      computeDiffActivity: async (_jobId, versionNumber) => {
        if (versionNumber > 1) diffCalled = true;
      },
      markJobCompleteActivity: async () => {},
      markJobFailedActivity: async () => {},
    };

    await runWorkflow(mockActivities, 'no-diff-test');
    expect(diffCalled).toBe(false);
  });

  it('calls computeDiffActivity when versionNumber is 2', async () => {
    let diffVersionNumber: number | undefined;

    const mockActivities: ForecastActivities = {
      validateInputActivity: async () => {},
      generatePlaceholderForecastActivity: async () => ({
        globalPeakCcu: 10000,
        regionalPeakCcu: { US: 10000 },
        featureVector: {},
      }),
      persistForecastVersionActivity: async () => ({
        versionNumber: 2,
        versionId: 'v2',
      }),
      computeDiffActivity: async (_jobId, versionNumber) => {
        diffVersionNumber = versionNumber;
      },
      markJobCompleteActivity: async () => {},
      markJobFailedActivity: async () => {},
    };

    await runWorkflow(mockActivities, 'diff-v2-test');
    expect(diffVersionNumber).toBe(2);
  });
});
