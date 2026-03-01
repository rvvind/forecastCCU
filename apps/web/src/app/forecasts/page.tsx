'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { api, type ForecastRequest } from '@/lib/api';

const STATUS_COLORS: Record<string, string> = {
  queued: 'bg-yellow-100 text-yellow-700',
  running: 'bg-blue-100 text-blue-700',
  succeeded: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
};

export default function ForecastsPage() {
  const { data, isLoading, error } = useQuery<ForecastRequest[]>({
    queryKey: ['forecasts'],
    queryFn: api.listForecastRequests,
    refetchInterval: 5000,
  });

  if (isLoading) return <p className="text-gray-500">Loading…</p>;
  if (error) return <p className="text-red-500">Error: {String(error)}</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Forecast Requests</h1>
        <Link
          href="/forecasts/new"
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 transition-colors"
        >
          + New Forecast
        </Link>
      </div>

      {!data || data.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg">No forecast requests yet.</p>
          <Link href="/forecasts/new" className="text-indigo-500 hover:underline mt-2 inline-block">
            Create your first forecast →
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Event</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Sport</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Platform</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Regions</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Versions</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Latest Job</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.map((req) => {
                const latestJob = req.jobs?.[0];
                const regions = req.targetForecastRegions as string[];
                return (
                  <tr key={req.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/forecasts/${req.id}`} className="font-medium text-indigo-600 hover:underline">
                        {req.eventName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{req.sport}</td>
                    <td className="px-4 py-3 text-gray-600">{req.platform}</td>
                    <td className="px-4 py-3 text-gray-600">{regions.join(', ')}</td>
                    <td className="px-4 py-3 text-gray-600">{req._count?.versions ?? 0}</td>
                    <td className="px-4 py-3">
                      {latestJob ? (
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[latestJob.status] ?? 'bg-gray-100 text-gray-600'}`}
                        >
                          {latestJob.status}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {new Date(req.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
