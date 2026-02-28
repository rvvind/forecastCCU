import { Worker, NativeConnection } from '@temporalio/worker';
import { PrismaClient } from '@prisma/client';
import path from 'path';
import { createForecastActivities } from './activities/forecast.activities';
import { FORECAST_TASK_QUEUE } from '@forecastccu/schema';

async function run() {
  const prisma = new PrismaClient();
  await prisma.$connect();
  console.log('Prisma connected');

  const activities = createForecastActivities(prisma);

  const connection = await NativeConnection.connect({
    address: process.env.TEMPORAL_ADDRESS ?? 'localhost:7233',
  });

  const worker = await Worker.create({
    connection,
    namespace: process.env.TEMPORAL_NAMESPACE ?? 'default',
    taskQueue: FORECAST_TASK_QUEUE,
    // Point at the compiled workflow bundle or the TS source (ts-node handles transpilation)
    workflowsPath: path.resolve(__dirname, './workflows/forecast.workflow'),
    activities,
  });

  console.log(`Temporal worker listening on task queue: ${FORECAST_TASK_QUEUE}`);

  await worker.run();
}

run().catch((err) => {
  console.error('Worker failed:', err);
  process.exit(1);
});
