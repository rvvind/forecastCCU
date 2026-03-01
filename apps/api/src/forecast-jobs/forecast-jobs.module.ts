import { Module } from '@nestjs/common';
import { ForecastJobsController } from './forecast-jobs.controller';
import { ForecastJobsService } from './forecast-jobs.service';

@Module({
  controllers: [ForecastJobsController],
  providers: [ForecastJobsService],
  exports: [ForecastJobsService],
})
export class ForecastJobsModule {}
