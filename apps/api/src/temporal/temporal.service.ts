import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { Connection, Client } from '@temporalio/client';
import { FORECAST_TASK_QUEUE, FORECAST_WORKFLOW_NAME } from '@forecastccu/schema';

@Injectable()
export class TemporalService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TemporalService.name);
  private client: Client | undefined;
  private connection: Connection | undefined;

  async onModuleInit(): Promise<void> {
    const address = process.env.TEMPORAL_ADDRESS ?? 'localhost:7233';
    try {
      this.connection = await Connection.connect({ address });
      this.client = new Client({
        connection: this.connection,
        namespace: process.env.TEMPORAL_NAMESPACE ?? 'default',
      });
      this.logger.log(`Connected to Temporal at ${address}`);
    } catch (err) {
      this.logger.warn(
        `Could not connect to Temporal at ${address}: ${err}. Workflow dispatch will be unavailable.`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.connection?.close();
  }

  async startForecastWorkflow(jobId: string): Promise<string> {
    if (!this.client) {
      throw new Error('Temporal client is not connected');
    }
    const handle = await this.client.workflow.start(FORECAST_WORKFLOW_NAME, {
      taskQueue: FORECAST_TASK_QUEUE,
      workflowId: `forecast-job-${jobId}`,
      args: [jobId],
    });
    return handle.workflowId;
  }
}
