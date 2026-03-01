/**
 * Unit tests for history activities.
 *
 * Uses a mock PrismaClient and StubHistoricalDataSource – no database or network needed.
 * Run: npm --workspace services/worker run test
 */
import { createHistoryActivities } from '../src/activities/history.activities';
import { StubHistoricalDataSource } from '../src/historical/stub-historical-data-source';
import {
  HISTORICAL_MODEL_ID,
  HISTORICAL_MODEL_VERSION,
  type ComparableEvent,
} from '@forecastccu/schema';

// ── Fixtures ──────────────────────────────────────────────────────────────

const makeEvent = (overrides: Partial<ComparableEvent> = {}): ComparableEvent => ({
  eventId: 'evt-1',
  sport: 'NFL',
  league: 'NFL Regular Season',
  platform: 'peacock',
  teams: { home: 'Chiefs', away: 'Eagles' },
  stage: 'game',
  startTimeUtc: '2025-09-07T20:00:00Z',
  globalPeak: 3_000_000,
  regionalPeak: { US: 2_700_000, GB: 200_000, CA: 100_000 },
  ...overrides,
});

// ── Minimal Prisma mock ────────────────────────────────────────────────────

function buildMockPrisma(reqOverrides: Record<string, unknown> = {}) {
  return {
    forecastJob: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        id: 'job-1',
        forecastRequestId: 'req-1',
      }),
    },
    forecastRequest: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        id: 'req-1',
        sport: 'NFL',
        league: 'NFL Regular Season',
        platform: 'peacock',
        eventType: 'game',
        startTimeUtc: new Date('2025-09-07T20:00:00Z'),
        participants: { home: 'Chiefs', away: 'Eagles' },
        targetForecastRegions: ['US', 'GB', 'CA'],
        ...reqOverrides,
      }),
    },
  } as unknown as import('@prisma/client').PrismaClient;
}

// ── loadInternalHistoryActivity ───────────────────────────────────────────

describe('loadInternalHistoryActivity', () => {
  it('returns top 5 comparable events from the data source', async () => {
    const events: ComparableEvent[] = Array.from({ length: 8 }, (_, i) =>
      makeEvent({ eventId: `evt-${i}` }),
    );
    const { loadInternalHistoryActivity } = createHistoryActivities(
      buildMockPrisma(),
      new StubHistoricalDataSource(events),
    );

    const result = await loadInternalHistoryActivity('job-1');

    expect(result.comparableEvents).toHaveLength(5);
  });

  it('returns all events when fewer than 5 are available', async () => {
    const events = [makeEvent(), makeEvent({ eventId: 'evt-2' })];
    const { loadInternalHistoryActivity } = createHistoryActivities(
      buildMockPrisma(),
      new StubHistoricalDataSource(events),
    );

    const result = await loadInternalHistoryActivity('job-1');

    expect(result.comparableEvents).toHaveLength(2);
  });

  it('returns selectionScores keyed by eventId', async () => {
    const events = [makeEvent({ eventId: 'evt-a' }), makeEvent({ eventId: 'evt-b' })];
    const { loadInternalHistoryActivity } = createHistoryActivities(
      buildMockPrisma(),
      new StubHistoricalDataSource(events),
    );

    const result = await loadInternalHistoryActivity('job-1');

    expect(result.selectionScores).toHaveProperty('evt-a');
    expect(result.selectionScores).toHaveProperty('evt-b');
    // Both events are perfect matches (same teams + stage + hour + year) → score 100
    expect(result.selectionScores['evt-a']).toBe(100);
  });

  it('ranks the most similar event first', async () => {
    const highScore = makeEvent({ eventId: 'evt-high', teams: { home: 'Chiefs', away: 'Eagles' } });
    const lowScore = makeEvent({ eventId: 'evt-low', teams: { home: 'Cowboys', away: 'Giants' } });
    const { loadInternalHistoryActivity } = createHistoryActivities(
      buildMockPrisma(),
      new StubHistoricalDataSource([lowScore, highScore]),
    );

    const result = await loadInternalHistoryActivity('job-1');

    expect(result.comparableEvents[0].eventId).toBe('evt-high');
  });

  it('handles empty historical dataset gracefully', async () => {
    const { loadInternalHistoryActivity } = createHistoryActivities(
      buildMockPrisma(),
      new StubHistoricalDataSource([]),
    );

    const result = await loadInternalHistoryActivity('job-1');

    expect(result.comparableEvents).toHaveLength(0);
    expect(result.selectionScores).toEqual({});
  });

  it('uses home/away from request participants', async () => {
    const prisma = buildMockPrisma({
      participants: { home: 'Patriots', away: 'Cowboys' },
    });
    const events = [
      makeEvent({ eventId: 'patriots-cowboys', teams: { home: 'Patriots', away: 'Cowboys' } }),
      makeEvent({ eventId: 'chiefs-eagles', teams: { home: 'Chiefs', away: 'Eagles' } }),
    ];
    const { loadInternalHistoryActivity } = createHistoryActivities(
      prisma,
      new StubHistoricalDataSource(events),
    );

    const result = await loadInternalHistoryActivity('job-1');

    expect(result.comparableEvents[0].eventId).toBe('patriots-cowboys');
  });
});

// ── buildFeatureVectorActivity ─────────────────────────────────────────────

describe('buildFeatureVectorActivity', () => {
  it('computes globalPeakCcu as the mean of comparable events', async () => {
    const events: ComparableEvent[] = [
      makeEvent({ eventId: 'a', globalPeak: 1_000_000 }),
      makeEvent({ eventId: 'b', globalPeak: 3_000_000 }),
    ];
    const { buildFeatureVectorActivity } = createHistoryActivities(
      buildMockPrisma(),
      new StubHistoricalDataSource([]),
    );

    const result = await buildFeatureVectorActivity('job-1', {
      comparableEvents: events,
      selectionScores: { a: 80, b: 60 },
    });

    expect(result.globalPeakCcu).toBe(2_000_000);
  });

  it('computes regionalPeakCcu for each target region', async () => {
    const events: ComparableEvent[] = [
      makeEvent({ eventId: 'a', regionalPeak: { US: 1_000_000, GB: 100_000, CA: 50_000 } }),
      makeEvent({ eventId: 'b', regionalPeak: { US: 3_000_000, GB: 300_000, CA: 150_000 } }),
    ];
    const { buildFeatureVectorActivity } = createHistoryActivities(
      buildMockPrisma(),
      new StubHistoricalDataSource([]),
    );

    const result = await buildFeatureVectorActivity('job-1', {
      comparableEvents: events,
      selectionScores: {},
    });

    expect(result.regionalPeakCcu.US).toBe(2_000_000);
    expect(result.regionalPeakCcu.GB).toBe(200_000);
    expect(result.regionalPeakCcu.CA).toBe(100_000);
  });

  it('includes comparableEventIds, baseline_global, baseline_regional in featureVector', async () => {
    const events = [makeEvent({ eventId: 'evt-x', globalPeak: 5_000_000 })];
    const { buildFeatureVectorActivity } = createHistoryActivities(
      buildMockPrisma(),
      new StubHistoricalDataSource([]),
    );

    const result = await buildFeatureVectorActivity('job-1', {
      comparableEvents: events,
      selectionScores: { 'evt-x': 90 },
    });

    expect(result.featureVector.comparableEventIds).toEqual(['evt-x']);
    expect(result.featureVector.baseline_global).toBe(5_000_000);
    expect(result.featureVector.modelId).toBe(HISTORICAL_MODEL_ID);
    expect(result.featureVector.modelVersion).toBe(HISTORICAL_MODEL_VERSION);
  });

  it('includes selectionScores in featureVector', async () => {
    const { buildFeatureVectorActivity } = createHistoryActivities(
      buildMockPrisma(),
      new StubHistoricalDataSource([]),
    );

    const result = await buildFeatureVectorActivity('job-1', {
      comparableEvents: [makeEvent({ eventId: 'e1' })],
      selectionScores: { e1: 75 },
    });

    expect((result.featureVector.selectionScores as Record<string, number>).e1).toBe(75);
  });

  it('returns zero peaks when no comparable events are provided', async () => {
    const { buildFeatureVectorActivity } = createHistoryActivities(
      buildMockPrisma(),
      new StubHistoricalDataSource([]),
    );

    const result = await buildFeatureVectorActivity('job-1', {
      comparableEvents: [],
      selectionScores: {},
    });

    expect(result.globalPeakCcu).toBe(0);
    expect(result.regionalPeakCcu).toEqual({ US: 0, GB: 0, CA: 0 });
  });

  it('changing the dataset changes the forecast output (acceptance)', async () => {
    const { buildFeatureVectorActivity } = createHistoryActivities(
      buildMockPrisma(),
      new StubHistoricalDataSource([]),
    );

    const smallResult = await buildFeatureVectorActivity('job-1', {
      comparableEvents: [makeEvent({ eventId: 'small', globalPeak: 500_000 })],
      selectionScores: {},
    });
    const largeResult = await buildFeatureVectorActivity('job-1', {
      comparableEvents: [makeEvent({ eventId: 'large', globalPeak: 10_000_000 })],
      selectionScores: {},
    });

    expect(smallResult.globalPeakCcu).not.toBe(largeResult.globalPeakCcu);
    expect(smallResult.globalPeakCcu).toBe(500_000);
    expect(largeResult.globalPeakCcu).toBe(10_000_000);
  });

  it('is deterministic – same comparable events yield same output', async () => {
    const events = [
      makeEvent({ eventId: 'a', globalPeak: 2_000_000 }),
      makeEvent({ eventId: 'b', globalPeak: 4_000_000 }),
    ];
    const history = { comparableEvents: events, selectionScores: {} };
    const { buildFeatureVectorActivity } = createHistoryActivities(
      buildMockPrisma(),
      new StubHistoricalDataSource([]),
    );

    const r1 = await buildFeatureVectorActivity('job-1', history);
    const r2 = await buildFeatureVectorActivity('job-1', history);

    expect(r1.globalPeakCcu).toBe(r2.globalPeakCcu);
    expect(r1.regionalPeakCcu).toEqual(r2.regionalPeakCcu);
  });

  it('works without web enrichment (no enrichment data needed)', async () => {
    // buildFeatureVectorActivity only reads from forecastRequest; no enrichmentSnapshot lookup.
    // This test verifies it completes successfully with a prisma that has no enrichmentSnapshot.
    const prismaNoEnrichment = {
      ...buildMockPrisma(),
      // enrichmentSnapshot intentionally absent
    } as unknown as import('@prisma/client').PrismaClient;

    const { buildFeatureVectorActivity } = createHistoryActivities(
      prismaNoEnrichment,
      new StubHistoricalDataSource([makeEvent()]),
    );

    await expect(
      buildFeatureVectorActivity('job-1', {
        comparableEvents: [makeEvent()],
        selectionScores: {},
      }),
    ).resolves.not.toThrow();
  });
});
