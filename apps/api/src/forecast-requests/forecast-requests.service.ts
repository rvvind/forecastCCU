import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateForecastRequestDto } from './dto/create-forecast-request.dto';
import { uuidv7 } from 'uuidv7';

@Injectable()
export class ForecastRequestsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateForecastRequestDto) {
    return this.prisma.forecastRequest.create({
      data: {
        id: uuidv7(),
        sport: dto.sport,
        league: dto.league,
        platform: dto.platform,
        eventName: dto.eventName,
        eventType: dto.eventType,
        startTimeUtc: new Date(dto.startTimeUtc),
        expectedDurationMinutes: dto.expectedDurationMinutes,
        participants: dto.participants as unknown as Prisma.InputJsonValue,
        targetForecastRegions: dto.targetForecastRegions as unknown as Prisma.InputJsonValue,
        createdByUserId: dto.createdByUserId ?? 'system',
        inputSchemaVersion: dto.inputSchemaVersion ?? '1.0',
      },
    });
  }

  async findAll() {
    return this.prisma.forecastRequest.findMany({
      where: { isArchived: false },
      orderBy: { createdAt: 'desc' },
      include: {
        jobs: {
          orderBy: { startedAt: 'desc' },
          take: 1,
        },
        _count: { select: { versions: true } },
      },
    });
  }

  async findOne(id: string) {
    const req = await this.prisma.forecastRequest.findUnique({
      where: { id },
      include: {
        jobs: { orderBy: { startedAt: 'desc' } },
        versions: { orderBy: { versionNumber: 'asc' } },
      },
    });
    if (!req) throw new NotFoundException(`ForecastRequest ${id} not found`);
    return req;
  }
}
