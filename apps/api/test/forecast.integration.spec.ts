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
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TemporalService } from '../src/temporal/temporal.service';
import { uuidv7 } from 'uuidv7';
import {
  computePlaceholderForecast,
  PLACEHOLDER_MODEL_ID,
  PLACEHOLDER_MODEL_VERSION,
} from '@forecastccu/schema';

// Stub Temporal so tests don't need a running Temporal server.
class TemporalServiceStub {
  async onModuleInit() {}
  async onModuleDestroy() {}
  async startForecastWorkflow(_jobId: string): Promise<string> {
    return `stub-workflow-${_jobId}`;
  }
}

// Helper: directly advance a job through the workflow steps using the DB.
async function runForecastWorkflowDirect(
  prisma: PrismaService,
  jobId: string,
): Promise<void> {
  const job = await prisma.forecastJob.findUniqueOrThrow({ where: { id: jobId } });
  const req = await prisma.forecastRequest.findUniqueOrThrow({
    where: { id: job.forecastRequestId },
  });

  // Mark running
  await prisma.forecastJob.update({
    where: { id: jobId },
    data: { status: 'running', startedAt: new Date() },
  });

  // Compute forecast
  const regions = req.targetForecastRegions as string[];
  const forecast = computePlaceholderForecast(req.expectedDurationMinutes, regions);

  // Persist version
  const existingCount = await prisma.forecastVersion.count({
    where: { forecastRequestId: req.id },
  });
  const versionNumber = existingCount + 1;

  await prisma.forecastVersion.create({
    data: {
      id: uuidv7(),
      forecastRequestId: req.id,
      versionNumber,
      modelId: PLACEHOLDER_MODEL_ID,
      modelVersion: PLACEHOLDER_MODEL_VERSION,
      globalPeakCcu: forecast.globalPeakCcu,
      regionalPeakCcu: forecast.regionalPeakCcu,
      featureVector: forecast.featureVector,
    },
  });

  // Compute diff
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
        },
      },
      update: {},
    });
  }

  // Mark succeeded
  await prisma.forecastJob.update({
    where: { id: jobId },
    data: { status: 'succeeded', finishedAt: new Date() },
  });
}

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

  // Clean up between tests
  afterEach(async () => {
    await prisma.forecastDiff.deleteMany();
    await prisma.forecastVersion.deleteMany();
    await prisma.forecastJob.deleteMany();
    await prisma.forecastRequest.deleteMany();
  });

  // ── POST /forecast-requests ───────────────────────────────────────────────

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

  // ── POST /forecast-requests/:id/jobs ─────────────────────────────────────

  it('POST /forecast-requests/:id/jobs creates a job', async () => {
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

  // ── GET /jobs/:id ─────────────────────────────────────────────────────────

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

  // ── Version increment ─────────────────────────────────────────────────────

  it('second run creates version 2 (version increment)', async () => {
    const { body: req } = await request(app.getHttpServer())
      .post('/forecast-requests')
      .send(baseRequest)
      .expect(201);

    // Run 1
    const { body: job1 } = await request(app.getHttpServer())
      .post(`/forecast-requests/${req.id}/jobs`)
      .expect(201);
    await runForecastWorkflowDirect(prisma, job1.id);

    // Run 2
    const { body: job2 } = await request(app.getHttpServer())
      .post(`/forecast-requests/${req.id}/jobs`)
      .expect(201);
    await runForecastWorkflowDirect(prisma, job2.id);

    // Versions
    const { body: versions } = await request(app.getHttpServer())
      .get(`/forecast-requests/${req.id}/versions`)
      .expect(200);

    expect(versions).toHaveLength(2);
    expect(versions[0].versionNumber).toBe(1);
    expect(versions[1].versionNumber).toBe(2);
  });

  // ── Deterministic placeholder logic ──────────────────────────────────────

  it('placeholder forecast is deterministic – same input yields same output', async () => {
    const result1 = computePlaceholderForecast(200, ['US', 'GB', 'CA']);
    const result2 = computePlaceholderForecast(200, ['US', 'GB', 'CA']);

    expect(result1).toEqual(result2);

    // Verify formula: base=20000, regionWeight=1/3, floor(20000/3)=6666
    expect(result1.globalPeakCcu).toBe(
      Object.values(result1.regionalPeakCcu).reduce((s, v) => s + v, 0),
    );
    Object.values(result1.regionalPeakCcu).forEach((ccu) => {
      expect(ccu).toBe(Math.floor(200 * 100 * (1 / 3)));
    });
  });

  it('placeholder forecast: 3 regions with 120 min duration', () => {
    // base = 120 * 100 = 12000
    // regionWeight = 1/3
    // each region = floor(12000 / 3) = 4000
    // globalPeak = 4000 * 3 = 12000
    const result = computePlaceholderForecast(120, ['US', 'GB', 'CA']);
    expect(result.regionalPeakCcu['US']).toBe(4000);
    expect(result.regionalPeakCcu['GB']).toBe(4000);
    expect(result.regionalPeakCcu['CA']).toBe(4000);
    expect(result.globalPeakCcu).toBe(12000);
  });

  it('placeholder forecast: 4 regions with 90 min duration', () => {
    // base = 90 * 100 = 9000
    // regionWeight = 1/4 = 0.25
    // each region = floor(9000 * 0.25) = floor(2250) = 2250
    // globalPeak = 2250 * 4 = 9000
    const result = computePlaceholderForecast(90, ['US', 'GB', 'CA', 'IN']);
    expect(result.regionalPeakCcu['US']).toBe(2250);
    expect(result.globalPeakCcu).toBe(9000);
  });

  // ── Diff correctness ──────────────────────────────────────────────────────

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
    // Same inputs → delta = 0
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

  // ── Job status transition ────────────────────────────────────────────────

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
});
