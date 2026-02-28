'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Sport } from '@forecastccu/schema';
import {
  createForecastRequestSchema,
  type CreateForecastRequestInput,
} from '@/lib/schemas';
import { api } from '@/lib/api';

export default function NewForecastPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateForecastRequestInput>({
    resolver: zodResolver(createForecastRequestSchema),
    defaultValues: {
      sport: Sport.NFL,
      expectedDurationMinutes: 210,
      participants: {},
    },
  });

  const onSubmit = async (data: CreateForecastRequestInput) => {
    setSubmitting(true);
    setError(null);
    try {
      const req = await api.createForecastRequest({
        ...data,
        // targetForecastRegions is already an array after Zod transformation
      });
      router.push(`/forecasts/${req.id}`);
    } catch (err) {
      setError(String(err));
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold mb-6">New Forecast Request</h1>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="bg-white rounded-xl border border-gray-200 p-6 space-y-5"
      >
        {/* Sport */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Sport</label>
          <select
            {...register('sport')}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {Object.values(Sport).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          {errors.sport && <p className="text-red-500 text-xs mt-1">{errors.sport.message}</p>}
        </div>

        {/* League */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">League</label>
          <input
            {...register('league')}
            placeholder="e.g. NFL Regular Season"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {errors.league && <p className="text-red-500 text-xs mt-1">{errors.league.message}</p>}
        </div>

        {/* Platform */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Platform</label>
          <input
            {...register('platform')}
            placeholder="e.g. peacock"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {errors.platform && <p className="text-red-500 text-xs mt-1">{errors.platform.message}</p>}
        </div>

        {/* Event Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Event Name</label>
          <input
            {...register('eventName')}
            placeholder="e.g. Chiefs vs Eagles – Super Bowl LVIII"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {errors.eventName && <p className="text-red-500 text-xs mt-1">{errors.eventName.message}</p>}
        </div>

        {/* Event Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Event Type</label>
          <input
            {...register('eventType')}
            placeholder="e.g. game"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {errors.eventType && <p className="text-red-500 text-xs mt-1">{errors.eventType.message}</p>}
        </div>

        {/* Start Time UTC */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Start Time (UTC)</label>
          <input
            {...register('startTimeUtc')}
            type="datetime-local"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {errors.startTimeUtc && <p className="text-red-500 text-xs mt-1">{errors.startTimeUtc.message}</p>}
        </div>

        {/* Duration */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Expected Duration (minutes)
          </label>
          <input
            {...register('expectedDurationMinutes', { valueAsNumber: true })}
            type="number"
            min={1}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {errors.expectedDurationMinutes && (
            <p className="text-red-500 text-xs mt-1">{errors.expectedDurationMinutes.message}</p>
          )}
        </div>

        {/* Target Regions */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Target Forecast Regions
          </label>
          <input
            {...register('targetForecastRegions')}
            placeholder="e.g. US, GB, CA, IN"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <p className="text-gray-400 text-xs mt-1">Comma-separated region codes</p>
          {errors.targetForecastRegions && (
            <p className="text-red-500 text-xs mt-1">
              {typeof errors.targetForecastRegions.message === 'string'
                ? errors.targetForecastRegions.message
                : 'Invalid regions'}
            </p>
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-600 text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-60"
        >
          {submitting ? 'Creating…' : 'Create Forecast Request'}
        </button>
      </form>
    </div>
  );
}
