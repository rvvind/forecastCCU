import { Module } from '@nestjs/common';
import { ForecastRequestsController } from './forecast-requests.controller';
import { ForecastRequestsService } from './forecast-requests.service';
import { ForecastJobsModule } from '../forecast-jobs/forecast-jobs.module';
import { ForecastVersionsModule } from '../forecast-versions/forecast-versions.module';
import { ForecastDiffsModule } from '../forecast-diffs/forecast-diffs.module';
import { EnrichmentSnapshotsModule } from '../enrichment-snapshots/enrichment-snapshots.module';

@Module({
  imports: [ForecastJobsModule, ForecastVersionsModule, ForecastDiffsModule, EnrichmentSnapshotsModule],
  controllers: [ForecastRequestsController],
  providers: [ForecastRequestsService],
})
export class ForecastRequestsModule {}
