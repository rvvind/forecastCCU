/**
 * ForecastWorkflow
 *
 * Runs inside the Temporal sandbox – must only import from @temporalio/workflow.
 * All side-effects (DB, external calls) happen inside activities.
 */
import { proxyActivities, ActivityFailure, ApplicationFailure } from '@temporalio/workflow';
import type { ForecastActivities } from '../activities/forecast.activities';
import type { EnrichmentActivities } from '../activities/enrichment.activities';
import type { HistoryActivities } from '../activities/history.activities';

const {
  validateInputActivity,
  // Enrichment
  createEnrichmentPlanActivity,
  executeWebSearchActivity,
  normalizeEvidenceActivity,
  // Historical baseline
  loadInternalHistoryActivity,
  buildFeatureVectorActivity,
  // Forecast persistence
  persistForecastVersionActivity,
  computeDiffActivity,
  markJobCompleteActivity,
  markJobFailedActivity,
} = proxyActivities<ForecastActivities & EnrichmentActivities & HistoryActivities>({
  startToCloseTimeout: '5 minutes',
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

    // Step 2 – build search query plan based on sport + participants
    const { queries } = await createEnrichmentPlanActivity(jobId);

    // Step 3 – execute web searches; failures stored as missing evidence
    await executeWebSearchActivity(jobId, queries);

    // Step 4 – normalize raw evidence into structured context
    await normalizeEvidenceActivity(jobId);

    // Step 5 – load internal historical events and select top 5 comparables
    const history = await loadInternalHistoryActivity(jobId);

    // Step 6 – compute historical baseline forecast from comparables
    const forecast = await buildFeatureVectorActivity(jobId, history);

    // Step 7 – persist immutable ForecastVersion
    const { versionNumber } = await persistForecastVersionActivity(
      jobId,
      forecast,
    );

    // Step 8 – compute diff vs previous version
    await computeDiffActivity(jobId, versionNumber);

    // Step 9 – finalise job
    await markJobCompleteActivity(jobId);
  } catch (err) {
    // Temporal wraps activity errors in ActivityFailure; extract the original message.
    let reason: string;
    if (err instanceof ActivityFailure && err.cause instanceof ApplicationFailure) {
      reason = err.cause.message;
    } else {
      reason = err instanceof Error ? err.message : String(err);
    }
    await markJobFailedActivity(jobId, reason);
    throw err;
  }
}
