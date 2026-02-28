import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiOkResponse } from '@nestjs/swagger';
import { ForecastJobsService } from './forecast-jobs.service';

@ApiTags('jobs')
@Controller('jobs')
export class ForecastJobsController {
  constructor(private readonly forecastJobsService: ForecastJobsService) {}

  @Get(':id')
  @ApiOperation({ summary: 'Get a forecast job by ID' })
  @ApiOkResponse({ description: 'Forecast job details' })
  findOne(@Param('id') id: string) {
    return this.forecastJobsService.findOne(id);
  }
}
