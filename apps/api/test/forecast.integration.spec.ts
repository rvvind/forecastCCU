/**
 * Integration tests for the ForecastCCU API.
 *
 * These tests require a live PostgreSQL database.
 * Set DATABASE_URL to a test database before running.
 *
 * Run: npm --workspace apps/api run test:integration
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Prisma } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TemporalService } from '../src/temporal/temporal.service';
import { uuidv7 } from 'uuidv7';
import {
  computePlaceholderForecast,
  PLACEHOLDER_MODEL_ID,
  PLACEHOLDER_MODEL_VERSION,
  HISTORICAL_MODEL_ID,
  HISTORICAL_MODEL_VERSION,
  type EnrichmentSource,
  type ComparableEvent,
} from '@forecastccu/schema';

// ── Stubs ──────────────────────────────────────────────────────────────────

class TemporalServiceStub {
  async onModuleInit() {}
  async onModuleDestroy() {}
  async startForecastWorkflow(_jobId: string): Promise<string> {
    return `stub-workflow-${_jobId}`;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Simulates the complete workflow synchronously against the test DB.
 * Uses a stub search provider: all queries succeed with fixture data.
 */
async function runForecastWorkflowDirect(
  prisma: PrismaService,
  jobId: string,
): Promise<void> {
  const job = await prisma.forecastJob.findUniqueOrThrow({ where: { id: jobId } });
  const req = await prisma.forecastRequest.findUniqueOrThrow({
    where: { id: job.forecastRequestId },
  });

  // Step 1 – Mark running
  await prisma.forecastJob.update({
    where: { id: jobId },
    data: { status: 'running', startedAt: new Date() },
  });

  // Steps 2–4 – Enrichment (stub data; no real search calls)
  const participants = req.participants as Record<string, string>;
  const team1 = participants.home ?? 'Team A';
  const team2 = participants.away ?? 'Team B';

  const queries =
    req.sport === 'NFL'
      ? [
          `${team1} vs ${team2} injury report`,
          `${team1} vs ${team2} playoff implications`,
          `${team1} vs ${team2} national broadcast`,
        ]
      : [
          `${team1} vs ${team2} points table`,
          `${team1} vs ${team2} stage implications`,
          `${team1} vs ${team2} marquee players`,
        ];

  const sources: EnrichmentSource[] = queries.map((query, i) => {
    const retrievedAt = new Date().toISOString();
    return {
      url: `https://stub.example.com/result-${i}`,
      retrievedAt,
      rawPayload: { stub: true, query },
      snippet: `Stub result for: ${query}`,
      extractedFacts: { query, wordCount: 5 },
      citationHash: Buffer.from(`${query}-${retrievedAt}`).toString('hex').slice(0, 32),
    };
  });

  // Upsert enrichment snapshot (idempotent)
  const existingSnapshot = await prisma.enrichmentSnapshot.findUnique({
    where: { jobId },
  });
  if (!existingSnapshot) {
    await prisma.enrichmentSnapshot.create({
      data: {
        id: uuidv7(),
        forecastRequestId: req.id,
        jobId,
        retrievedAt: new Date(),
        searchQueries: queries as unknown as Prisma.InputJsonValue,
        sources: sources as unknown as Prisma.InputJsonValue,
        normalizedContext: {
          totalSources: sources.length,
          successfulSources: sources.length,
          snippets: sources.map((s) => s.snippet),
          urls: sources.map((s) => s.url),
        } as unknown as Prisma.InputJsonValue,
      },
    });
  }

  // Steps 5–6 – Historical baseline forecast
  const regions = req.targetForecastRegions as string[];

  // Inline stub comparable events (mirrors InMemoryHistoricalDataSource NFL fixtures)
  const stubEvents: ComparableEvent[] = [
    {
      eventId: 'nfl-2023-rs-kc-phi',
      sport: 'NFL', league: 'NFL Regular Season', platform: 'peacock',
      teams: { home: 'Chiefs', away: 'Eagles' }, stage: 'game',
      startTimeUtc: '2023-10-01T20:00:00Z',
      globalPeak: 2_800_000,
      regionalPeak: { US: 2_500_000, GB: 200_000, CA: 100_000 },
    },
    {
      eventId: 'nfl-2024-rs-kc-bal',
      sport: 'NFL', league: 'NFL Regular Season', platform: 'peacock',
      teams: { home: 'Chiefs', away: 'Ravens' }, stage: 'game',
      startTimeUtc: '2024-09-05T20:15:00Z',
      globalPeak: 3_200_000,
      regionalPeak: { US: 2_900_000, GB: 200_000, CA: 100_000 },
    },
    {
      eventId: 'nfl-2022-rs-ram-bucs',
      sport: 'NFL', league: 'NFL Regular Season', platform: 'fox',
      teams: { home: 'Rams', away: 'Buccaneers' }, stage: 'game',
      startTimeUtc: '2022-11-06T18:00:00Z',
      globalPeak: 2_200_000,
      regionalPeak: { US: 1_900_000, GB: 200_000, CA: 100_000 },
    },
  ];

  // Equal-weight mean
  const globalPeakCcu = Math.round(
    stubEvents.reduce((s, e) => s + e.globalPeak, 0) / stubEvents.length,
  );
  const regionalPeakCcu: Record<string, number> = {};
  for (const region of regions) {
    regionalPeakCcu[region] = Math.round(
      stubEvents.reduce((s, e) => s + (e.regionalPeak[region] ?? 0), 0) / stubEvents.length,
    );
  }
  const comparableEventIds = stubEvents.map((e) => e.eventId);

  const existingCount = await prisma.forecastVersion.count({
    where: { forecastRequestId: req.id },
  });
  const versionNumber = existingCount + 1;

  await prisma.forecastVersion.create({
    data: {
      id: uuidv7(),
      forecastRequestId: req.id,
      versionNumber,
      modelId: HISTORICAL_MODEL_ID,
      modelVersion: HISTORICAL_MODEL_VERSION,
      globalPeakCcu,
      regionalPeakCcu: regionalPeakCcu as unknown as Prisma.InputJsonValue,
      featureVector: {
        modelId: HISTORICAL_MODEL_ID,
        modelVersion: HISTORICAL_MODEL_VERSION,
        comparableEventIds,
        baseline_global: globalPeakCcu,
        baseline_regional: regionalPeakCcu,
        selectionScores: {},
      } as unknown as Prisma.InputJsonValue,
    },
  });

  // Step 7 – Compute diff
  if (versionNumber > 1) {
    const fromVer = await prisma.forecastVersion.findUniqueOrThrow({
      where: {
        forecastRequestId_versionNumber: {
          forecastRequestId: req.id,
          versionNumber: versionNumber - 1,
        },
      },
    });
    const toVer = await prisma.forecastVersion.findUniqueOrThrow({
      where: {
        forecastRequestId_versionNumber: {
          forecastRequestId: req.id,
          versionNumber,
        },
      },
    });

    await prisma.forecastDiff.upsert({
      where: {
        forecastRequestId_fromVersion_toVersion: {
          forecastRequestId: req.id,
          fromVersion: versionNumber - 1,
          toVersion: versionNumber,
        },
      },
      create: {
        id: uuidv7(),
        forecastRequestId: req.id,
        fromVersion: versionNumber - 1,
        toVersion: versionNumber,
        inputDiff: {},
        outputDiff: {
          globalPeakCcu: {
            from: fromVer.globalPeakCcu,
            to: toVer.globalPeakCcu,
            delta: toVer.globalPeakCcu - fromVer.globalPeakCcu,
          },
        } as unknown as Prisma.InputJsonValue,
      },
      update: {},
    });
  }

  // Step 8 – Mark succeeded
  await prisma.forecastJob.update({
    where: { id: jobId },
    data: { status: 'succeeded', finishedAt: new Date() },
  });
}

// ── Test suite ─────────────────────────────────────────────────────────────

describe('ForecastCCU API – Integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const baseRequest = {
    sport: 'NFL',
    league: 'NFL Regular Season',
    platform: 'peacock',
    eventName: 'Chiefs vs Eagles',
    eventType: 'game',
    startTimeUtc: '2025-09-07T20:00:00Z',
    expectedDurationMinutes: 200,
    participants: { home: 'Chiefs', away: 'Eagles' },
    targetForecastRegions: ['US', 'GB', 'CA'],
    createdByUserId: 'test-user',
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(TemporalService)
      .useClass(TemporalServiceStub)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(async () => {
    await prisma.enrichmentSnapshot.deleteMany();
    await prisma.forecastDiff.deleteMany();
    await prisma.forecastVersion.deleteMany();
    await prisma.forecastJob.deleteMany();
    await prisma.forecastRequest.deleteMany();
  });

  // ── POST /forecast-requests ─────────────────────────────────────────────

  it('POST /forecast-requests creates a new request', async () => {
    const res = await request(app.getHttpServer())
      .post('/forecast-requests')
      .send(baseRequest)
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.sport).toBe('NFL');
    expect(res.body.expectedDurationMinutes).toBe(200);
    expect(res.body.targetForecastRegions).toEqual(['US', 'GB', 'CA']);
  });

  it('POST /forecast-requests validates required fields', async () => {
    await request(app.getHttpServer())
      .post('/forecast-requests')
      .send({ sport: 'INVALID' })
      .expect(400);
  });

  // ── Job lifecycle ───────────────────────────────────────────────────────

  it('POST /forecast-requests/:id/jobs creates a job with status queued', async () => {
    const { body: req } = await request(app.getHttpServer())
      .post('/forecast-requests')
      .send(baseRequest)
      .expect(201);

    const { body: job } = await request(app.getHttpServer())
      .post(`/forecast-requests/${req.id}/jobs`)
      .expect(201);

    expect(job.status).toBe('queued');
    expect(job.forecastRequestId).toBe(req.id);
  });

  it('GET /jobs/:id returns job details', async () => {
    const { body: req } = await request(app.getHttpServer())
      .post('/forecast-requests')
      .send(baseRequest)
      .expect(201);

    const { body: job } = await request(app.getHttpServer())
      .post(`/forecast-requests/${req.id}/jobs`)
      .expect(201);

    const { body: fetched } = await request(app.getHttpServer())
      .get(`/jobs/${job.id}`)
      .expect(200);

    expect(fetched.id).toBe(job.id);
    expect(fetched.status).toBe('queued');
  });

  it('job transitions: queued → running → succeeded', async () => {
    const { body: req } = await request(app.getHttpServer())
      .post('/forecast-requests')
      .send(baseRequest)
      .expect(201);

    const { body: job } = await request(app.getHttpServer())
      .post(`/forecast-requests/${req.id}/jobs`)
      .expect(201);

    expect(job.status).toBe('queued');

    await runForecastWorkflowDirect(prisma, job.id);

    const { body: updated } = await request(app.getHttpServer())
      .get(`/jobs/${job.id}`)
      .expect(200);

    expect(updated.status).toBe('succeeded');
    expect(updated.startedAt).toBeDefined();
    expect(updated.finishedAt).toBeDefined();
  });

  // ── Version increment ───────────────────────────────────────────────────

  it('second run creates version 2 (version increment)', async () => {
    const { body: req } = await request(app.getHttpServer())
      .post('/forecast-requests')
      .send(baseRequest)
      .expect(201);

    const { body: job1 } = await request(app.getHttpServer())
      .post(`/forecast-requests/${req.id}/jobs`)
      .expect(201);
    await runForecastWorkflowDirect(prisma, job1.id);

    const { body: job2 } = await request(app.getHttpServer())
      .post(`/forecast-requests/${req.id}/jobs`)
      .expect(201);
    await runForecastWorkflowDirect(prisma, job2.id);

    const { body: versions } = await request(app.getHttpServer())
      .get(`/forecast-requests/${req.id}/versions`)
      .expect(200);

    expect(versions).toHaveLength(2);
    expect(versions[0].versionNumber).toBe(1);
    expect(versions[1].versionNumber).toBe(2);
  });

  // ── Deterministic placeholder logic ────────────────────────────────────

  it('placeholder forecast is deterministic – same input yields same output', () => {
    const result1 = computePlaceholderForecast(200, ['US', 'GB', 'CA']);
    const result2 = computePlaceholderForecast(200, ['US', 'GB', 'CA']);
    expect(result1).toEqual(result2);

    expect(result1.globalPeakCcu).toBe(
      Object.values(result1.regionalPeakCcu).reduce((s, v) => s + v, 0),
    );
    Object.values(result1.regionalPeakCcu).forEach((ccu) => {
      expect(ccu).toBe(Math.floor(200 * 100 * (1 / 3)));
    });
  });

  it('placeholder forecast: 3 regions with 120 min duration', () => {
    const result = computePlaceholderForecast(120, ['US', 'GB', 'CA']);
    expect(result.regionalPeakCcu['US']).toBe(4000);
    expect(result.regionalPeakCcu['GB']).toBe(4000);
    expect(result.regionalPeakCcu['CA']).toBe(4000);
    expect(result.globalPeakCcu).toBe(12000);
  });

  it('placeholder forecast: 4 regions with 90 min duration', () => {
    const result = computePlaceholderForecast(90, ['US', 'GB', 'CA', 'IN']);
    expect(result.regionalPeakCcu['US']).toBe(2250);
    expect(result.globalPeakCcu).toBe(9000);
  });

  // ── Diff correctness ────────────────────────────────────────────────────

  it('diff shows output delta between v1 and v2 – same input yields zero delta', async () => {
    const { body: req } = await request(app.getHttpServer())
      .post('/forecast-requests')
      .send(baseRequest)
      .expect(201);

    const { body: job1 } = await request(app.getHttpServer())
      .post(`/forecast-requests/${req.id}/jobs`)
      .expect(201);
    await runForecastWorkflowDirect(prisma, job1.id);

    const { body: job2 } = await request(app.getHttpServer())
      .post(`/forecast-requests/${req.id}/jobs`)
      .expect(201);
    await runForecastWorkflowDirect(prisma, job2.id);

    const { body: diff } = await request(app.getHttpServer())
      .get(`/forecast-requests/${req.id}/diffs/1/2`)
      .expect(200);

    expect(diff.fromVersion).toBe(1);
    expect(diff.toVersion).toBe(2);
    expect(diff.outputDiff.globalPeakCcu.delta).toBe(0);
  });

  it('GET /forecast-requests/:id/diffs/:from/:to returns 404 when diff does not exist', async () => {
    const { body: req } = await request(app.getHttpServer())
      .post('/forecast-requests')
      .send(baseRequest)
      .expect(201);

    await request(app.getHttpServer())
      .get(`/forecast-requests/${req.id}/diffs/1/2`)
      .expect(404);
  });

  // ── Enrichment: Phase 2 ─────────────────────────────────────────────────

  it('forecast run produces an EnrichmentSnapshot', async () => {
    const { body: req } = await request(app.getHttpServer())
      .post('/forecast-requests')
      .send(baseRequest)
      .expect(201);

    const { body: job } = await request(app.getHttpServer())
      .post(`/forecast-requests/${req.id}/jobs`)
      .expect(201);

    await runForecastWorkflowDirect(prisma, job.id);

    const { body: enrichment } = await request(app.getHttpServer())
      .get(`/forecast-requests/${req.id}/enrichment`)
      .expect(200);

    expect(enrichment).not.toBeNull();
    expect(enrichment.forecastRequestId).toBe(req.id);
    expect(enrichment.jobId).toBe(job.id);
  });

  it('enrichment snapshot contains at least 2 sources', async () => {
    const { body: req } = await request(app.getHttpServer())
      .post('/forecast-requests')
      .send(baseRequest)
      .expect(201);

    const { body: job } = await request(app.getHttpServer())
      .post(`/forecast-requests/${req.id}/jobs`)
      .expect(201);

    await runForecastWorkflowDirect(prisma, job.id);

    const { body: enrichment } = await request(app.getHttpServer())
      .get(`/forecast-requests/${req.id}/enrichment`)
      .expect(200);

    expect(enrichment.sources.length).toBeGreaterThanOrEqual(2);
  });

  it('each source in the snapshot has a citationHash', async () => {
    const { body: req } = await request(app.getHttpServer())
      .post('/forecast-requests')
      .send(baseRequest)
      .expect(201);

    const { body: job } = await request(app.getHttpServer())
      .post(`/forecast-requests/${req.id}/jobs`)
      .expect(201);

    await runForecastWorkflowDirect(prisma, job.id);

    const { body: enrichment } = await request(app.getHttpServer())
      .get(`/forecast-requests/${req.id}/enrichment`)
      .expect(200);

    enrichment.sources.forEach((s: EnrichmentSource) => {
      expect(s.citationHash).toBeDefined();
      expect(typeof s.citationHash).toBe('string');
      expect(s.citationHash.length).toBeGreaterThan(0);
    });
  });

  it('evidence is immutable – second job creates a separate snapshot', async () => {
    const { body: req } = await request(app.getHttpServer())
      .post('/forecast-requests')
      .send(baseRequest)
      .expect(201);

    const { body: job1 } = await request(app.getHttpServer())
      .post(`/forecast-requests/${req.id}/jobs`)
      .expect(201);
    await runForecastWorkflowDirect(prisma, job1.id);

    const { body: job2 } = await request(app.getHttpServer())
      .post(`/forecast-requests/${req.id}/jobs`)
      .expect(201);
    await runForecastWorkflowDirect(prisma, job2.id);

    // Two separate snapshots exist in the DB (one per job)
    const snapshots = await prisma.enrichmentSnapshot.findMany({
      where: { forecastRequestId: req.id },
    });
    expect(snapshots).toHaveLength(2);
    expect(snapshots[0].jobId).not.toBe(snapshots[1].jobId);
  });

  it('GET /forecast-requests/:id/enrichment returns empty body when no job has run', async () => {
    const { body: req } = await request(app.getHttpServer())
      .post('/forecast-requests')
      .send(baseRequest)
      .expect(201);

    const { body } = await request(app.getHttpServer())
      .get(`/forecast-requests/${req.id}/enrichment`)
      .expect(200);

    // NestJS sends an empty body when the service returns null;
    // supertest parses this as {}, so we check there is no snapshot data.
    expect(body.forecastRequestId).toBeUndefined();
  });

  it('GET /forecast-requests/:id/enrichment returns latest snapshot after two runs', async () => {
    const { body: req } = await request(app.getHttpServer())
      .post('/forecast-requests')
      .send(baseRequest)
      .expect(201);

    const { body: job1 } = await request(app.getHttpServer())
      .post(`/forecast-requests/${req.id}/jobs`)
      .expect(201);
    await runForecastWorkflowDirect(prisma, job1.id);

    const { body: job2 } = await request(app.getHttpServer())
      .post(`/forecast-requests/${req.id}/jobs`)
      .expect(201);
    await runForecastWorkflowDirect(prisma, job2.id);

    const { body: enrichment } = await request(app.getHttpServer())
      .get(`/forecast-requests/${req.id}/enrichment`)
      .expect(200);

    // Latest snapshot belongs to job2
    expect(enrichment.jobId).toBe(job2.id);
  });

  // ── Historical baseline: Phase 3 ────────────────────────────────────────

  it('forecast version uses historical model ID after workflow run', async () => {
    const { body: req } = await request(app.getHttpServer())
      .post('/forecast-requests')
      .send(baseRequest)
      .expect(201);

    const { body: job } = await request(app.getHttpServer())
      .post(`/forecast-requests/${req.id}/jobs`)
      .expect(201);
    await runForecastWorkflowDirect(prisma, job.id);

    const { body: versions } = await request(app.getHttpServer())
      .get(`/forecast-requests/${req.id}/versions`)
      .expect(200);

    expect(versions[0].modelId).toBe(HISTORICAL_MODEL_ID);
    expect(versions[0].modelVersion).toBe(HISTORICAL_MODEL_VERSION);
  });

  it('featureVector contains comparableEventIds from historical dataset', async () => {
    const { body: req } = await request(app.getHttpServer())
      .post('/forecast-requests')
      .send(baseRequest)
      .expect(201);

    const { body: job } = await request(app.getHttpServer())
      .post(`/forecast-requests/${req.id}/jobs`)
      .expect(201);
    await runForecastWorkflowDirect(prisma, job.id);

    const { body: versions } = await request(app.getHttpServer())
      .get(`/forecast-requests/${req.id}/versions`)
      .expect(200);

    const fv = versions[0].featureVector as Record<string, unknown>;
    expect(Array.isArray(fv.comparableEventIds)).toBe(true);
    expect((fv.comparableEventIds as string[]).length).toBeGreaterThan(0);
    expect(fv.baseline_global).toBeDefined();
    expect(typeof fv.baseline_global).toBe('number');
  });

  it('featureVector contains baseline_regional for each target region', async () => {
    const { body: req } = await request(app.getHttpServer())
      .post('/forecast-requests')
      .send(baseRequest)
      .expect(201);

    const { body: job } = await request(app.getHttpServer())
      .post(`/forecast-requests/${req.id}/jobs`)
      .expect(201);
    await runForecastWorkflowDirect(prisma, job.id);

    const { body: versions } = await request(app.getHttpServer())
      .get(`/forecast-requests/${req.id}/versions`)
      .expect(200);

    const fv = versions[0].featureVector as Record<string, unknown>;
    const baselineRegional = fv.baseline_regional as Record<string, number>;
    expect(baselineRegional).toBeDefined();
    // baseRequest targets ['US', 'GB', 'CA']
    expect(baselineRegional.US).toBeDefined();
    expect(baselineRegional.GB).toBeDefined();
    expect(baselineRegional.CA).toBeDefined();
  });

  it('searchQueries in snapshot match the sport-specific query template', async () => {
    const { body: req } = await request(app.getHttpServer())
      .post('/forecast-requests')
      .send(baseRequest)
      .expect(201);

    const { body: job } = await request(app.getHttpServer())
      .post(`/forecast-requests/${req.id}/jobs`)
      .expect(201);
    await runForecastWorkflowDirect(prisma, job.id);

    const { body: enrichment } = await request(app.getHttpServer())
      .get(`/forecast-requests/${req.id}/enrichment`)
      .expect(200);

    expect(enrichment.searchQueries).toHaveLength(3);
    expect(enrichment.searchQueries[0]).toContain('Chiefs vs Eagles');
    expect(enrichment.searchQueries.some((q: string) => q.includes('injury report'))).toBe(true);
    expect(enrichment.searchQueries.some((q: string) => q.includes('playoff implications'))).toBe(true);
    expect(enrichment.searchQueries.some((q: string) => q.includes('national broadcast'))).toBe(true);
  });
});
