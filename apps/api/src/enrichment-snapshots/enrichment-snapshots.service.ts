import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class EnrichmentSnapshotsService {
  constructor(private readonly prisma: PrismaService) {}

  async findLatestForRequest(forecastRequestId: string) {
    const req = await this.prisma.forecastRequest.findUnique({
      where: { id: forecastRequestId },
    });
    if (!req) {
      throw new NotFoundException(
        `ForecastRequest ${forecastRequestId} not found`,
      );
    }

    return this.prisma.enrichmentSnapshot.findFirst({
      where: { forecastRequestId },
      orderBy: { retrievedAt: 'desc' },
    });
  }

  async findByJobId(jobId: string) {
    return this.prisma.enrichmentSnapshot.findUnique({ where: { jobId } });
  }
}
