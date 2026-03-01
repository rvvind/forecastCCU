import { createHash } from 'crypto';
import { PrismaClient, Prisma } from '@prisma/client';
import { uuidv7 } from 'uuidv7';
import type { EnrichmentSource, NormalizedContext } from '@forecastccu/schema';
import type { SearchProvider } from '../providers/search-provider.interface';

function computeCitationHash(query: string, url: string, snippet: string, retrievedAt: string): string {
  return createHash('sha256')
    .update(`${query}|${url}|${snippet}|${retrievedAt}`)
    .digest('hex')
    .slice(0, 32);
}

function buildEnrichmentQueries(
  sport: string,
  participants: Record<string, string>,
): string[] {
  const team1 = participants.home ?? participants.team1 ?? 'Team A';
  const team2 = participants.away ?? participants.team2 ?? 'Team B';

  if (sport === 'NFL') {
    return [
      `${team1} vs ${team2} injury report`,
      `${team1} vs ${team2} playoff implications`,
      `${team1} vs ${team2} national broadcast`,
    ];
  }

  // IPL (and any future sport falls here until explicit support added)
  return [
    `${team1} vs ${team2} points table`,
    `${team1} vs ${team2} stage implications`,
    `${team1} vs ${team2} marquee players`,
  ];
}

function extractFacts(snippet: string, query: string): Record<string, unknown> {
  const numbers = (snippet.match(/\b\d+\b/g) ?? []).map(Number);
  const wordCount = snippet.split(/\s+/).filter(Boolean).length;
  return { query, wordCount, numbersFound: numbers };
}

/**
 * Factory that binds PrismaClient and a SearchProvider to all enrichment activities.
 */
export function createEnrichmentActivities(
  prisma: PrismaClient,
  searchProvider: SearchProvider,
) {
  return {
    /**
     * 2. Generate the list of search queries for this forecast request.
     */
    async createEnrichmentPlanActivity(
      jobId: string,
    ): Promise<{ queries: string[] }> {
      const job = await prisma.forecastJob.findUniqueOrThrow({
        where: { id: jobId },
      });
      const req = await prisma.forecastRequest.findUniqueOrThrow({
        where: { id: job.forecastRequestId },
      });

      const participants = req.participants as Record<string, string>;
      const queries = buildEnrichmentQueries(req.sport, participants);
      return { queries };
    },

    /**
     * 3. Execute web searches for each query.
     * Failures are stored as missing-evidence entries; the workflow continues.
     * Idempotent: skips creation if snapshot already exists for this job.
     */
    async executeWebSearchActivity(
      jobId: string,
      queries: string[],
    ): Promise<void> {
      // Idempotency guard
      const existing = await prisma.enrichmentSnapshot.findUnique({
        where: { jobId },
      });
      if (existing) return;

      const job = await prisma.forecastJob.findUniqueOrThrow({
        where: { id: jobId },
      });

      const sources: EnrichmentSource[] = [];

      for (const query of queries) {
        const retrievedAt = new Date().toISOString();
        const outcome = await searchProvider.search(query);

        if (outcome.success) {
          sources.push({
            url: outcome.result.url,
            retrievedAt,
            rawPayload: outcome.result.rawPayload,
            snippet: outcome.result.snippet,
            extractedFacts: extractFacts(outcome.result.snippet, query),
            citationHash: computeCitationHash(
              query,
              outcome.result.url,
              outcome.result.snippet,
              retrievedAt,
            ),
          });
        } else {
          // Mark missing evidence and continue
          sources.push({
            url: '',
            retrievedAt,
            rawPayload: { error: outcome.error, query },
            snippet: '',
            extractedFacts: { query },
            citationHash: computeCitationHash(query, '', '', retrievedAt),
            isMissing: true,
          });
        }
      }

      await prisma.enrichmentSnapshot.create({
        data: {
          id: uuidv7(),
          forecastRequestId: job.forecastRequestId,
          jobId,
          retrievedAt: new Date(),
          searchQueries: queries as unknown as Prisma.InputJsonValue,
          sources: sources as unknown as Prisma.InputJsonValue,
          normalizedContext: {},
        },
      });
    },

    /**
     * 4. Compute normalizedContext from the raw sources.
     * Idempotent: skips if normalizedContext is already populated.
     * Once set, the snapshot record is effectively frozen.
     */
    async normalizeEvidenceActivity(jobId: string): Promise<void> {
      const snapshot = await prisma.enrichmentSnapshot.findUnique({
        where: { jobId },
      });
      if (!snapshot) return;

      const ctx = snapshot.normalizedContext as Record<string, unknown>;
      if (Object.keys(ctx).length > 0) return; // Already normalized

      const sources = snapshot.sources as unknown as EnrichmentSource[];
      const successful = sources.filter((s) => !s.isMissing);

      const normalizedContext: NormalizedContext = {
        totalSources: sources.length,
        successfulSources: successful.length,
        snippets: successful.map((s) => s.snippet).filter(Boolean),
        urls: successful.map((s) => s.url).filter(Boolean),
      };

      await prisma.enrichmentSnapshot.update({
        where: { jobId },
        data: { normalizedContext: normalizedContext as unknown as Prisma.InputJsonValue },
      });
    },
  };
}

export type EnrichmentActivities = ReturnType<typeof createEnrichmentActivities>;
