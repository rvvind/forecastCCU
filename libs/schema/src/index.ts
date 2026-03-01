export enum Sport {
  NFL = 'NFL',
  IPL = 'IPL',
}

export enum JobStatus {
  queued = 'queued',
  running = 'running',
  succeeded = 'succeeded',
  failed = 'failed',
}

export const FORECAST_TASK_QUEUE = 'forecast-task-queue';
export const FORECAST_WORKFLOW_NAME = 'ForecastWorkflow';

export const PLACEHOLDER_MODEL_ID = 'placeholder-v1';
export const PLACEHOLDER_MODEL_VERSION = '1.0.0';

export interface PlaceholderForecastResult {
  globalPeakCcu: number;
  regionalPeakCcu: Record<string, number>;
  featureVector: Record<string, unknown>;
}

/**
 * Deterministic placeholder forecast logic.
 *
 * base = expectedDurationMinutes * 100
 * regionWeight = 1 / number_of_regions
 * regionalPeak[region] = floor(base * regionWeight)
 * globalPeak = sum(regionalPeak)
 *
 * Given the same inputs this function always returns the same outputs.
 */
export function computePlaceholderForecast(
  expectedDurationMinutes: number,
  regions: string[],
): PlaceholderForecastResult {
  if (regions.length === 0) {
    throw new Error('At least one region is required');
  }

  const base = expectedDurationMinutes * 100;
  const numRegions = regions.length;
  const regionWeight = 1 / numRegions;

  const regionalPeakCcu: Record<string, number> = {};
  for (const region of regions) {
    regionalPeakCcu[region] = Math.floor(base * regionWeight);
  }

  const globalPeakCcu = Object.values(regionalPeakCcu).reduce(
    (sum, v) => sum + v,
    0,
  );

  return {
    globalPeakCcu,
    regionalPeakCcu,
    featureVector: {
      base,
      regionWeight,
      numRegions,
      expectedDurationMinutes,
      modelId: PLACEHOLDER_MODEL_ID,
      modelVersion: PLACEHOLDER_MODEL_VERSION,
    },
  };
}
