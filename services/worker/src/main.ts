import { Worker, NativeConnection } from '@temporalio/worker';
import { PrismaClient } from '@prisma/client';
import path from 'path';
import { createForecastActivities } from './activities/forecast.activities';
import { createEnrichmentActivities } from './activities/enrichment.activities';
import { createHistoryActivities } from './activities/history.activities';
import { BraveSearchProvider } from './providers/brave-search.provider';
import { NullSearchProvider } from './providers/null-search.provider';
import { InMemoryHistoricalDataSource } from './historical/in-memory-historical-data-source';
import { FORECAST_TASK_QUEUE } from '@forecastccu/schema';

async function run() {
  const prisma = new PrismaClient();
  await prisma.$connect();
  console.log('Prisma connected');

  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  const searchProvider = apiKey
    ? new BraveSearchProvider(apiKey)
    : new NullSearchProvider();

  if (!apiKey) {
    console.warn(
      'BRAVE_SEARCH_API_KEY not set – enrichment will mark all sources as missing',
    );
  }

  const historicalDataSource = new InMemoryHistoricalDataSource();

  const activities = {
    ...createForecastActivities(prisma),
    ...createEnrichmentActivities(prisma, searchProvider),
    ...createHistoryActivities(prisma, historicalDataSource),
  };

  const connection = await NativeConnection.connect({
    address: process.env.TEMPORAL_ADDRESS ?? 'localhost:7233',
  });

  const worker = await Worker.create({
    connection,
    namespace: process.env.TEMPORAL_NAMESPACE ?? 'default',
    taskQueue: FORECAST_TASK_QUEUE,
    workflowsPath: path.resolve(__dirname, './workflows/forecast.workflow.ts'),
    activities,
  });

  console.log(`Temporal worker listening on task queue: ${FORECAST_TASK_QUEUE}`);

  await worker.run();
}

run().catch((err) => {
  console.error('Worker failed:', err);
  process.exit(1);
});
