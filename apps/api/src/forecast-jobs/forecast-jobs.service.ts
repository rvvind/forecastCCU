import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TemporalService } from '../temporal/temporal.service';
import { uuidv7 } from 'uuidv7';

@Injectable()
export class ForecastJobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly temporal: TemporalService,
  ) {}

  async createForRequest(forecastRequestId: string) {
    const req = await this.prisma.forecastRequest.findUnique({
      where: { id: forecastRequestId },
    });
    if (!req) {
      throw new NotFoundException(
        `ForecastRequest ${forecastRequestId} not found`,
      );
    }

    const job = await this.prisma.forecastJob.create({
      data: {
        id: uuidv7(),
        forecastRequestId,
        status: 'queued',
      },
    });

    const workflowRunId = await this.temporal.startForecastWorkflow(job.id);

    return this.prisma.forecastJob.update({
      where: { id: job.id },
      data: { workflowRunId },
    });
  }

  async findOne(id: string) {
    const job = await this.prisma.forecastJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException(`ForecastJob ${id} not found`);
    return job;
  }
}
