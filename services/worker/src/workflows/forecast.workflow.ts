/**
 * ForecastWorkflow
 *
 * Runs inside the Temporal sandbox – must only import from @temporalio/workflow.
 * All side-effects (DB, external calls) happen inside activities.
 */
import { proxyActivities } from '@temporalio/workflow';
import type { ForecastActivities } from '../activities/forecast.activities';

const {
  validateInputActivity,
  generatePlaceholderForecastActivity,
  persistForecastVersionActivity,
  computeDiffActivity,
  markJobCompleteActivity,
  markJobFailedActivity,
} = proxyActivities<ForecastActivities>({
  startToCloseTimeout: '2 minutes',
  retry: {
    maximumAttempts: 3,
    initialInterval: '1s',
    backoffCoefficient: 2,
  },
});

export async function ForecastWorkflow(jobId: string): Promise<void> {
  try {
    // Step 1 – validate input and transition job → running
    await validateInputActivity(jobId);

    // Step 2 – deterministic placeholder forecast
    const forecast = await generatePlaceholderForecastActivity(jobId);

    // Step 3 – persist immutable ForecastVersion
    const { versionNumber } = await persistForecastVersionActivity(
      jobId,
      forecast,
    );

    // Step 4 – compute diff vs previous version
    await computeDiffActivity(jobId, versionNumber);

    // Step 5 – finalise job
    await markJobCompleteActivity(jobId);
  } catch (err) {
    // Best-effort: mark the job as failed so the API reflects the error.
    // We re-throw so Temporal also marks the workflow execution as failed.
    const reason = err instanceof Error ? err.message : String(err);
    await markJobFailedActivity(jobId, reason);
    throw err;
  }
}
