import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ForecastVersionsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllForRequest(forecastRequestId: string) {
    const req = await this.prisma.forecastRequest.findUnique({
      where: { id: forecastRequestId },
    });
    if (!req) {
      throw new NotFoundException(
        `ForecastRequest ${forecastRequestId} not found`,
      );
    }
    return this.prisma.forecastVersion.findMany({
      where: { forecastRequestId },
      orderBy: { versionNumber: 'asc' },
    });
  }
}
