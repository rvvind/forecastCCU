import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';
import { ForecastRequestsService } from './forecast-requests.service';
import { CreateForecastRequestDto } from './dto/create-forecast-request.dto';
import { ForecastJobsService } from '../forecast-jobs/forecast-jobs.service';
import { ForecastVersionsService } from '../forecast-versions/forecast-versions.service';
import { ForecastDiffsService } from '../forecast-diffs/forecast-diffs.service';
import { EnrichmentSnapshotsService } from '../enrichment-snapshots/enrichment-snapshots.service';

@ApiTags('forecast-requests')
@Controller('forecast-requests')
export class ForecastRequestsController {
  constructor(
    private readonly forecastRequestsService: ForecastRequestsService,
    private readonly forecastJobsService: ForecastJobsService,
    private readonly forecastVersionsService: ForecastVersionsService,
    private readonly forecastDiffsService: ForecastDiffsService,
    private readonly enrichmentSnapshotsService: EnrichmentSnapshotsService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new forecast request' })
  @ApiCreatedResponse({ description: 'Forecast request created' })
  create(@Body() dto: CreateForecastRequestDto) {
    return this.forecastRequestsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all forecast requests' })
  @ApiOkResponse({ description: 'List of forecast requests' })
  findAll() {
    return this.forecastRequestsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single forecast request' })
  findOne(@Param('id') id: string) {
    return this.forecastRequestsService.findOne(id);
  }

  @Post(':id/jobs')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Start a new forecast job for this request' })
  @ApiCreatedResponse({ description: 'Forecast job created and workflow started' })
  createJob(@Param('id') id: string) {
    return this.forecastJobsService.createForRequest(id);
  }

  @Get(':id/versions')
  @ApiOperation({ summary: 'List all forecast versions for this request' })
  findVersions(@Param('id') id: string) {
    return this.forecastVersionsService.findAllForRequest(id);
  }

  @Get(':id/diffs/:from/:to')
  @ApiOperation({ summary: 'Get the diff between two forecast versions' })
  getDiff(
    @Param('id') id: string,
    @Param('from', ParseIntPipe) from: number,
    @Param('to', ParseIntPipe) to: number,
  ) {
    return this.forecastDiffsService.findDiff(id, from, to);
  }

  @Get(':id/enrichment')
  @ApiOperation({ summary: 'Get the latest enrichment snapshot for this request' })
  @ApiOkResponse({ description: 'Latest enrichment snapshot or null' })
  getEnrichment(@Param('id') id: string) {
    return this.enrichmentSnapshotsService.findLatestForRequest(id);
  }
}
