import { PrismaClient } from '@prisma/client';
import { uuidv7 } from 'uuidv7';
import {
  computePlaceholderForecast,
  PLACEHOLDER_MODEL_ID,
  PLACEHOLDER_MODEL_VERSION,
} from '@forecastccu/schema';

/**
 * Factory that binds a PrismaClient to all forecast activities.
 * Using a factory allows dependency injection and easy test mocking.
 */
export function createForecastActivities(prisma: PrismaClient) {
  return {
    /**
     * 1. Mark the job as running and verify the request exists.
     */
    async validateInputActivity(jobId: string): Promise<void> {
      const job = await prisma.forecastJob.findUniqueOrThrow({
        where: { id: jobId },
      });
      await prisma.forecastRequest.findUniqueOrThrow({
        where: { id: job.forecastRequestId },
      });
      await prisma.forecastJob.update({
        where: { id: jobId },
        data: { status: 'running', startedAt: new Date() },
      });
    },

    /**
     * 2. Apply the deterministic placeholder forecast formula.
     */
    async generatePlaceholderForecastActivity(jobId: string): Promise<{
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
      return computePlaceholderForecast(req.expectedDurationMinutes, regions);
    },

    /**
     * 3. Persist the ForecastVersion record.
     * Idempotent: if a version for this versionNumber already exists, returns it.
     */
    async persistForecastVersionActivity(
      jobId: string,
      forecast: {
        globalPeakCcu: number;
        regionalPeakCcu: Record<string, number>;
        featureVector: Record<string, unknown>;
      },
    ): Promise<{ versionNumber: number; versionId: string }> {
      const job = await prisma.forecastJob.findUniqueOrThrow({
        where: { id: jobId },
      });
      const { forecastRequestId } = job;

      const existingCount = await prisma.forecastVersion.count({
        where: { forecastRequestId },
      });
      const versionNumber = existingCount + 1;

      // Idempotency guard: if this exact versionNumber was already persisted
      // (e.g. activity retried after partial commit) return the existing record.
      const existing = await prisma.forecastVersion.findUnique({
        where: {
          forecastRequestId_versionNumber: { forecastRequestId, versionNumber },
        },
      });
      if (existing) {
        return { versionNumber: existing.versionNumber, versionId: existing.id };
      }

      const version = await prisma.forecastVersion.create({
        data: {
          id: uuidv7(),
          forecastRequestId,
          versionNumber,
          modelId: PLACEHOLDER_MODEL_ID,
          modelVersion: PLACEHOLDER_MODEL_VERSION,
          globalPeakCcu: forecast.globalPeakCcu,
          regionalPeakCcu: forecast.regionalPeakCcu,
          featureVector: forecast.featureVector,
        },
      });
      return { versionNumber: version.versionNumber, versionId: version.id };
    },

    /**
     * 4. Compute and persist the diff between versionNumber-1 and versionNumber.
     * No-op if toVersionNumber <= 1 (first version has no predecessor).
     */
    async computeDiffActivity(
      jobId: string,
      toVersionNumber: number,
    ): Promise<void> {
      if (toVersionNumber <= 1) return;

      const job = await prisma.forecastJob.findUniqueOrThrow({
        where: { id: jobId },
      });
      const { forecastRequestId } = job;
      const fromVersionNumber = toVersionNumber - 1;

      const [fromVer, toVer] = await Promise.all([
        prisma.forecastVersion.findUniqueOrThrow({
          where: {
            forecastRequestId_versionNumber: {
              forecastRequestId,
              versionNumber: fromVersionNumber,
            },
          },
        }),
        prisma.forecastVersion.findUniqueOrThrow({
          where: {
            forecastRequestId_versionNumber: {
              forecastRequestId,
              versionNumber: toVersionNumber,
            },
          },
        }),
      ]);

      const outputDiff = {
        globalPeakCcu: {
          from: fromVer.globalPeakCcu,
          to: toVer.globalPeakCcu,
          delta: toVer.globalPeakCcu - fromVer.globalPeakCcu,
        },
        regionalPeakCcu: {
          from: fromVer.regionalPeakCcu,
          to: toVer.regionalPeakCcu,
        },
        modelVersion: {
          from: fromVer.modelVersion,
          to: toVer.modelVersion,
        },
      };

      // Upsert to be idempotent on retry
      await prisma.forecastDiff.upsert({
        where: {
          forecastRequestId_fromVersion_toVersion: {
            forecastRequestId,
            fromVersion: fromVersionNumber,
            toVersion: toVersionNumber,
          },
        },
        create: {
          id: uuidv7(),
          forecastRequestId,
          fromVersion: fromVersionNumber,
          toVersion: toVersionNumber,
          inputDiff: {},
          outputDiff,
        },
        update: {},
      });
    },

    /**
     * 5. Finalise the job as succeeded.
     */
    async markJobCompleteActivity(jobId: string): Promise<void> {
      await prisma.forecastJob.update({
        where: { id: jobId },
        data: { status: 'succeeded', finishedAt: new Date() },
      });
    },

    /**
     * Error path: mark the job as failed.
     */
    async markJobFailedActivity(
      jobId: string,
      reason: string,
    ): Promise<void> {
      await prisma.forecastJob.update({
        where: { id: jobId },
        data: {
          status: 'failed',
          finishedAt: new Date(),
          failureDetails: { reason },
        },
      });
    },
  };
}

export type ForecastActivities = ReturnType<typeof createForecastActivities>;
