import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { TemporalModule } from './temporal/temporal.module';
import { ForecastRequestsModule } from './forecast-requests/forecast-requests.module';
import { ForecastJobsModule } from './forecast-jobs/forecast-jobs.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    TemporalModule,
    ForecastRequestsModule,
    ForecastJobsModule,
  ],
})
export class AppModule {}
