import { z } from 'zod';
import { Sport } from '@forecastccu/schema';

export const createForecastRequestSchema = z.object({
  sport: z.nativeEnum(Sport),
  league: z.string().min(1, 'League is required'),
  platform: z.string().min(1, 'Platform is required'),
  eventName: z.string().min(1, 'Event name is required'),
  eventType: z.string().min(1, 'Event type is required'),
  startTimeUtc: z.string().min(1, 'Start time is required'),
  expectedDurationMinutes: z
    .number({ invalid_type_error: 'Must be a number' })
    .int()
    .min(1, 'Duration must be at least 1 minute'),
  participants: z.record(z.unknown()).default({}),
  targetForecastRegions: z
    .string()
    .min(1, 'At least one region required')
    .transform((val) =>
      val
        .split(',')
        .map((r) => r.trim().toUpperCase())
        .filter(Boolean),
    ),
  createdByUserId: z.string().optional(),
});

export type CreateForecastRequestInput = z.infer<
  typeof createForecastRequestSchema
>;
