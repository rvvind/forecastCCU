import { Module } from '@nestjs/common';
import { EnrichmentSnapshotsService } from './enrichment-snapshots.service';

@Module({
  providers: [EnrichmentSnapshotsService],
  exports: [EnrichmentSnapshotsService],
})
export class EnrichmentSnapshotsModule {}
