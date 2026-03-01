/**
 * Unit tests for enrichment activities.
 *
 * Uses a mock PrismaClient and StubSearchProvider – no database or network needed.
 * Run: npm --workspace services/worker run test
 */
import { createEnrichmentActivities } from '../src/activities/enrichment.activities';
import { StubSearchProvider } from '../src/providers/stub-search.provider';
import type { SearchOutcome } from '../src/providers/search-provider.interface';

// ── Minimal Prisma mock ────────────────────────────────────────────────────

function buildMockPrisma(overrides: Record<string, unknown> = {}) {
  const snapshots = new Map<string, Record<string, unknown>>();

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
        participants: { home: 'Chiefs', away: 'Eagles' },
      }),
    },
    enrichmentSnapshot: {
      findUnique: jest.fn().mockImplementation(({ where }: { where: { jobId: string } }) =>
        Promise.resolve(snapshots.get(where.jobId) ?? null),
      ),
      create: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
        snapshots.set(data.jobId as string, data);
        return Promise.resolve(data);
      }),
      update: jest.fn().mockImplementation(
        ({ where, data }: { where: { jobId: string }; data: Record<string, unknown> }) => {
          const existing = snapshots.get(where.jobId) ?? {};
          const updated = { ...existing, ...data };
          snapshots.set(where.jobId, updated);
          return Promise.resolve(updated);
        },
      ),
    },
    ...overrides,
  } as unknown as import('@prisma/client').PrismaClient;
}

// ── createEnrichmentPlanActivity ───────────────────────────────────────────

describe('createEnrichmentPlanActivity – NFL', () => {
  it('generates 3 NFL-specific queries using home/away participants', async () => {
    const prisma = buildMockPrisma();
    const { createEnrichmentPlanActivity } = createEnrichmentActivities(
      prisma,
      new StubSearchProvider(),
    );

    const { queries } = await createEnrichmentPlanActivity('job-1');

    expect(queries).toHaveLength(3);
    expect(queries[0]).toContain('Chiefs vs Eagles');
    expect(queries[0]).toContain('injury report');
    expect(queries[1]).toContain('playoff implications');
    expect(queries[2]).toContain('national broadcast');
  });
});

describe('createEnrichmentPlanActivity – IPL', () => {
  it('generates 3 IPL-specific queries', async () => {
    const prisma = buildMockPrisma({
      forecastRequest: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'req-1',
          sport: 'IPL',
          participants: { home: 'Mumbai Indians', away: 'Chennai Super Kings' },
        }),
      },
    });
    const { createEnrichmentPlanActivity } = createEnrichmentActivities(
      prisma,
      new StubSearchProvider(),
    );

    const { queries } = await createEnrichmentPlanActivity('job-1');

    expect(queries).toHaveLength(3);
    expect(queries[0]).toContain('points table');
    expect(queries[1]).toContain('stage implications');
    expect(queries[2]).toContain('marquee players');
  });
});

// ── executeWebSearchActivity ───────────────────────────────────────────────

describe('executeWebSearchActivity – all searches succeed', () => {
  it('persists one source per query', async () => {
    const prisma = buildMockPrisma();
    const { executeWebSearchActivity } = createEnrichmentActivities(
      prisma,
      new StubSearchProvider(),
    );

    await executeWebSearchActivity('job-1', [
      'Chiefs vs Eagles injury report',
      'Chiefs vs Eagles playoff implications',
      'Chiefs vs Eagles national broadcast',
    ]);

    expect(prisma.enrichmentSnapshot.create).toHaveBeenCalledTimes(1);
    const created = (prisma.enrichmentSnapshot.create as jest.Mock).mock
      .calls[0][0].data;
    expect(created.sources).toHaveLength(3);
    expect(created.sources.every((s: { isMissing?: boolean }) => !s.isMissing)).toBe(true);
  });

  it('populates citationHash for each source', async () => {
    const prisma = buildMockPrisma();
    const { executeWebSearchActivity } = createEnrichmentActivities(
      prisma,
      new StubSearchProvider(),
    );

    await executeWebSearchActivity('job-1', ['query-a', 'query-b']);

    const created = (prisma.enrichmentSnapshot.create as jest.Mock).mock
      .calls[0][0].data;
    const hashes = created.sources.map((s: { citationHash: string }) => s.citationHash);
    // All hashes should be non-empty strings
    hashes.forEach((h: string) => expect(h).toMatch(/^[0-9a-f]{32}$/));
    // Each source has a different query, so hashes must be unique regardless of URL/snippet
    expect(new Set(hashes).size).toBe(hashes.length);
  });

  it('stores a minimum of 2 sources for 3 queries', async () => {
    const prisma = buildMockPrisma();
    const { executeWebSearchActivity } = createEnrichmentActivities(
      prisma,
      new StubSearchProvider(),
    );

    await executeWebSearchActivity('job-1', ['q1', 'q2', 'q3']);

    const created = (prisma.enrichmentSnapshot.create as jest.Mock).mock
      .calls[0][0].data;
    expect(created.sources.length).toBeGreaterThanOrEqual(2);
  });
});

describe('executeWebSearchActivity – one query fails', () => {
  it('workflow continues and marks the failing source as missing', async () => {
    const results = new Map<string, SearchOutcome>([
      ['q-fail', { success: false, error: 'Provider timeout' }],
    ]);
    const provider = new StubSearchProvider(
      results,
      { success: true, result: { url: 'https://ok.com', snippet: 'ok', rawPayload: {} } },
    );
    const prisma = buildMockPrisma();
    const { executeWebSearchActivity } = createEnrichmentActivities(prisma, provider);

    await executeWebSearchActivity('job-1', ['q-ok', 'q-fail', 'q-ok2']);

    const created = (prisma.enrichmentSnapshot.create as jest.Mock).mock
      .calls[0][0].data;
    expect(created.sources).toHaveLength(3);

    const missing = created.sources.filter((s: { isMissing?: boolean }) => s.isMissing);
    const found = created.sources.filter((s: { isMissing?: boolean }) => !s.isMissing);
    expect(missing).toHaveLength(1);
    expect(found).toHaveLength(2);
  });
});

describe('executeWebSearchActivity – all queries fail', () => {
  it('stores missing-evidence records and workflow continues (no exception thrown)', async () => {
    const provider = new StubSearchProvider(
      undefined,
      { success: false, error: 'Network unreachable' },
    );
    const prisma = buildMockPrisma();
    const { executeWebSearchActivity } = createEnrichmentActivities(prisma, provider);

    await expect(
      executeWebSearchActivity('job-1', ['q1', 'q2', 'q3']),
    ).resolves.toBeUndefined();

    const created = (prisma.enrichmentSnapshot.create as jest.Mock).mock
      .calls[0][0].data;
    expect(created.sources).toHaveLength(3);
    expect(created.sources.every((s: { isMissing?: boolean }) => s.isMissing)).toBe(true);
  });
});

describe('executeWebSearchActivity – idempotency', () => {
  it('skips creation if snapshot already exists for this job', async () => {
    const prisma = buildMockPrisma({
      enrichmentSnapshot: {
        findUnique: jest.fn().mockResolvedValue({ jobId: 'job-1', sources: [] }),
        create: jest.fn(),
        update: jest.fn(),
      },
    });
    const { executeWebSearchActivity } = createEnrichmentActivities(
      prisma,
      new StubSearchProvider(),
    );

    await executeWebSearchActivity('job-1', ['q1']);

    expect(prisma.enrichmentSnapshot.create).not.toHaveBeenCalled();
  });
});

// ── normalizeEvidenceActivity ──────────────────────────────────────────────

describe('normalizeEvidenceActivity', () => {
  it('computes normalizedContext from successful sources', async () => {
    const sources = [
      {
        url: 'https://a.com',
        snippet: 'text a',
        isMissing: false,
        citationHash: 'aaaa',
        retrievedAt: new Date().toISOString(),
        rawPayload: {},
        extractedFacts: {},
      },
      {
        url: '',
        snippet: '',
        isMissing: true,
        citationHash: 'bbbb',
        retrievedAt: new Date().toISOString(),
        rawPayload: {},
        extractedFacts: {},
      },
    ];

    const prisma = buildMockPrisma({
      enrichmentSnapshot: {
        findUnique: jest.fn().mockResolvedValue({
          jobId: 'job-1',
          sources,
          normalizedContext: {},
        }),
        create: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
    });
    const { normalizeEvidenceActivity } = createEnrichmentActivities(
      prisma,
      new StubSearchProvider(),
    );

    await normalizeEvidenceActivity('job-1');

    const updateCall = (prisma.enrichmentSnapshot.update as jest.Mock).mock.calls[0][0];
    const ctx = updateCall.data.normalizedContext;
    expect(ctx.totalSources).toBe(2);
    expect(ctx.successfulSources).toBe(1);
    expect(ctx.urls).toEqual(['https://a.com']);
    expect(ctx.snippets).toEqual(['text a']);
  });

  it('is idempotent – skips update if normalizedContext already set', async () => {
    const prisma = buildMockPrisma({
      enrichmentSnapshot: {
        findUnique: jest.fn().mockResolvedValue({
          jobId: 'job-1',
          sources: [],
          normalizedContext: { totalSources: 1, successfulSources: 1, snippets: [], urls: [] },
        }),
        create: jest.fn(),
        update: jest.fn(),
      },
    });
    const { normalizeEvidenceActivity } = createEnrichmentActivities(
      prisma,
      new StubSearchProvider(),
    );

    await normalizeEvidenceActivity('job-1');

    expect(prisma.enrichmentSnapshot.update).not.toHaveBeenCalled();
  });

  it('no-ops gracefully if snapshot does not exist', async () => {
    const prisma = buildMockPrisma({
      enrichmentSnapshot: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        update: jest.fn(),
      },
    });
    const { normalizeEvidenceActivity } = createEnrichmentActivities(
      prisma,
      new StubSearchProvider(),
    );

    await expect(normalizeEvidenceActivity('job-1')).resolves.toBeUndefined();
    expect(prisma.enrichmentSnapshot.update).not.toHaveBeenCalled();
  });
});
