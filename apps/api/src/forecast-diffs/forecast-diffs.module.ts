import { Module } from '@nestjs/common';
import { ForecastDiffsService } from './forecast-diffs.service';

@Module({
  providers: [ForecastDiffsService],
  exports: [ForecastDiffsService],
})
export class ForecastDiffsModule {}
