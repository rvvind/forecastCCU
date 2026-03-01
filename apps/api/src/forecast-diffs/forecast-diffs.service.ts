import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ForecastDiffsService {
  constructor(private readonly prisma: PrismaService) {}

  async findDiff(forecastRequestId: string, from: number, to: number) {
    const diff = await this.prisma.forecastDiff.findUnique({
      where: {
        forecastRequestId_fromVersion_toVersion: {
          forecastRequestId,
          fromVersion: from,
          toVersion: to,
        },
      },
    });
    if (!diff) {
      throw new NotFoundException(
        `Diff from v${from} to v${to} for request ${forecastRequestId} not found`,
      );
    }
    return diff;
  }
}
