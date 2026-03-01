import { PrismaClient } from '@prisma/client';
import {
  HISTORICAL_MODEL_ID,
  HISTORICAL_MODEL_VERSION,
  type HistoryResult,
} from '@forecastccu/schema';
import type { HistoricalDataSource } from '../historical/historical-data-source.interface';
import {
  selectTop5,
  weightedMeanGlobal,
  weightedMeanRegional,
} from '../historical/comparable-selector';

/**
 * Factory that binds PrismaClient and a HistoricalDataSource to the history activities.
 */
export function createHistoryActivities(
  prisma: PrismaClient,
  historicalDataSource: HistoricalDataSource,
) {
  return {
    /**
     * 5. Load internal historical events, score them, and select the top 5.
     * Returns the comparable events and their individual similarity scores.
     */
    async loadInternalHistoryActivity(jobId: string): Promise<HistoryResult> {
      const job = await prisma.forecastJob.findUniqueOrThrow({
        where: { id: jobId },
      });
      const req = await prisma.forecastRequest.findUniqueOrThrow({
        where: { id: job.forecastRequestId },
      });

      const allEvents = await historicalDataSource.loadHistoricalEvents({
        sport: req.sport,
        league: req.league,
        platform: req.platform,
      });

      const participants = req.participants as {
        home?: string;
        away?: string;
        team1?: string;
        team2?: string;
      };
      const teams = {
        home: participants.home ?? participants.team1 ?? 'Team A',
        away: participants.away ?? participants.team2 ?? 'Team B',
      };

      const scored = selectTop5(allEvents, {
        teams,
        stage: req.eventType,
        startTimeUtc: req.startTimeUtc.toISOString(),
      });

      const comparableEvents = scored.map((s) => s.event);
      const selectionScores = Object.fromEntries(
        scored.map((s) => [s.event.eventId, s.score]),
      );

      return { comparableEvents, selectionScores };
    },

    /**
     * 6. Compute the historical baseline forecast from the selected comparable events.
     * Uses equal-weight mean of globalPeak and regionalPeak across the top 5.
     */
    async buildFeatureVectorActivity(
      jobId: string,
      history: HistoryResult,
    ): Promise<{
      globalPeakCcu: number;
      regionalPeakCcu: Record<string, number>;
      featureVector: Record<string, unknown>;
    }> {
      const job = await prisma.forecastJob.findUniqueOrThrow({
        where: { id: jobId },
      });
      const req = await prisma.forecastRequest.findUniqueOrThrow({
        where: { id: job.forecastRequestId },
      });

      const regions = req.targetForecastRegions as string[];
      const { comparableEvents, selectionScores } = history;

      const globalPeakCcu = weightedMeanGlobal(comparableEvents);
      const regionalPeakCcu = weightedMeanRegional(comparableEvents, regions);

      return {
        globalPeakCcu,
        regionalPeakCcu,
        featureVector: {
          modelId: HISTORICAL_MODEL_ID,
          modelVersion: HISTORICAL_MODEL_VERSION,
          comparableEventIds: comparableEvents.map((e) => e.eventId),
          baseline_global: globalPeakCcu,
          baseline_regional: regionalPeakCcu,
          selectionScores,
        },
      };
    },
  };
}

export type HistoryActivities = ReturnType<typeof createHistoryActivities>;
