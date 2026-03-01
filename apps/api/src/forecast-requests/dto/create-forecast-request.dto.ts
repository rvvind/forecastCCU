import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsString,
  IsInt,
  IsArray,
  IsObject,
  IsDateString,
  IsOptional,
  Min,
} from 'class-validator';
import { Sport } from '@forecastccu/schema';

export class CreateForecastRequestDto {
  @ApiProperty({ enum: Sport, example: Sport.NFL })
  @IsEnum(Sport)
  sport!: Sport;

  @ApiProperty({ example: 'NFL Regular Season' })
  @IsString()
  league!: string;

  @ApiProperty({ example: 'peacock' })
  @IsString()
  platform!: string;

  @ApiProperty({ example: 'Chiefs vs Eagles – Super Bowl LVIII' })
  @IsString()
  eventName!: string;

  @ApiProperty({ example: 'game' })
  @IsString()
  eventType!: string;

  @ApiProperty({ example: '2025-02-09T23:30:00Z' })
  @IsDateString()
  startTimeUtc!: string;

  @ApiProperty({ minimum: 1, example: 210 })
  @IsInt()
  @Min(1)
  expectedDurationMinutes!: number;

  @ApiProperty({
    example: { home: 'Chiefs', away: 'Eagles' },
    description: 'Arbitrary JSON describing the participants',
  })
  @IsObject()
  participants!: Record<string, unknown>;

  @ApiProperty({
    type: [String],
    example: ['US', 'GB', 'CA'],
    description: 'List of region codes to forecast',
  })
  @IsArray()
  @IsString({ each: true })
  targetForecastRegions!: string[];

  @ApiPropertyOptional({ example: 'user_01HZ' })
  @IsString()
  @IsOptional()
  createdByUserId?: string;

  @ApiPropertyOptional({ example: '1.0' })
  @IsString()
  @IsOptional()
  inputSchemaVersion?: string;
}
