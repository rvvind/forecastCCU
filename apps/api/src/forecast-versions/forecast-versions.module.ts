import { Module } from '@nestjs/common';
import { ForecastVersionsService } from './forecast-versions.service';

@Module({
  providers: [ForecastVersionsService],
  exports: [ForecastVersionsService],
})
export class ForecastVersionsModule {}
