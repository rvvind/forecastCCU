'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, type ForecastRequest, type ForecastJob, type ForecastVersion, type ForecastDiff } from '@/lib/api';

const STATUS_COLORS: Record<string, string> = {
  queued: 'bg-yellow-100 text-yellow-700',
  running: 'bg-blue-100 text-blue-700 animate-pulse',
  succeeded: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
};

interface PageProps {
  params: { id: string };
}

function JobStatusBadge({ jobId }: { jobId: string }) {
  const { data: job } = useQuery<ForecastJob>({
    queryKey: ['job', jobId],
    queryFn: () => api.getJob(jobId),
    refetchInterval: (data) =>
      data?.status === 'queued' || data?.status === 'running' ? 1500 : false,
  });

  if (!job) return <span className="text-gray-400 text-sm">Loading…</span>;
  return (
    <span
      className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${STATUS_COLORS[job.status] ?? 'bg-gray-100'}`}
    >
      {job.status}
    </span>
  );
}

function DiffViewer({
  forecastRequestId,
  fromVersion,
  toVersion,
}: {
  forecastRequestId: string;
  fromVersion: number;
  toVersion: number;
}) {
  const { data: diff, isLoading } = useQuery<ForecastDiff>({
    queryKey: ['diff', forecastRequestId, fromVersion, toVersion],
    queryFn: () => api.getDiff(forecastRequestId, fromVersion, toVersion),
    enabled: fromVersion > 0 && toVersion > fromVersion,
  });

  if (isLoading) return <p className="text-gray-400 text-sm">Loading diff…</p>;
  if (!diff) return <p className="text-gray-400 text-sm">No diff available.</p>;

  const output = diff.outputDiff as {
    globalPeakCcu?: { from: number; to: number; delta: number };
    regionalPeakCcu?: { from: Record<string, number>; to: Record<string, number> };
  };

  return (
    <div className="space-y-4">
      <h3 className="font-medium text-gray-700">
        Diff: v{diff.fromVersion} → v{diff.toVersion}
      </h3>
      {output.globalPeakCcu && (
        <div className="bg-gray-50 rounded-lg p-4 text-sm">
          <p className="font-medium text-gray-600 mb-1">Global Peak CCU</p>
          <p>
            <span className="text-gray-500">From:</span>{' '}
            <span className="font-mono">{output.globalPeakCcu.from.toLocaleString()}</span>
          </p>
          <p>
            <span className="text-gray-500">To:</span>{' '}
            <span className="font-mono">{output.globalPeakCcu.to.toLocaleString()}</span>
          </p>
          <p>
            <span className="text-gray-500">Delta:</span>{' '}
            <span
              className={`font-mono font-medium ${output.globalPeakCcu.delta >= 0 ? 'text-green-600' : 'text-red-600'}`}
            >
              {output.globalPeakCcu.delta >= 0 ? '+' : ''}
              {output.globalPeakCcu.delta.toLocaleString()}
            </span>
          </p>
        </div>
      )}
      {output.regionalPeakCcu && (
        <div className="bg-gray-50 rounded-lg p-4 text-sm">
          <p className="font-medium text-gray-600 mb-2">Regional Peak CCU</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500">
                  <th className="text-left pb-1">Region</th>
                  <th className="text-right pb-1">From</th>
                  <th className="text-right pb-1">To</th>
                  <th className="text-right pb-1">Delta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {Object.keys({
                  ...output.regionalPeakCcu.from,
                  ...output.regionalPeakCcu.to,
                }).map((region) => {
                  const from = output.regionalPeakCcu!.from[region] ?? 0;
                  const to = output.regionalPeakCcu!.to[region] ?? 0;
                  const delta = to - from;
                  return (
                    <tr key={region}>
                      <td className="py-1 font-mono">{region}</td>
                      <td className="text-right py-1 font-mono">{from.toLocaleString()}</td>
                      <td className="text-right py-1 font-mono">{to.toLocaleString()}</td>
                      <td
                        className={`text-right py-1 font-mono font-medium ${delta >= 0 ? 'text-green-600' : 'text-red-600'}`}
                      >
                        {delta >= 0 ? '+' : ''}
                        {delta.toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ForecastDetailPage({ params }: PageProps) {
  const { id } = params;
  const queryClient = useQueryClient();
  const [selectedDiff, setSelectedDiff] = useState<{ from: number; to: number } | null>(null);

  const { data: req, isLoading } = useQuery<ForecastRequest>({
    queryKey: ['forecast', id],
    queryFn: () => api.getForecastRequest(id),
    refetchInterval: 3000,
  });

  const { data: versions } = useQuery<ForecastVersion[]>({
    queryKey: ['versions', id],
    queryFn: () => api.listVersions(id),
    refetchInterval: 3000,
  });

  const startJobMutation = useMutation({
    mutationFn: () => api.startJob(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['forecast', id] });
      void queryClient.invalidateQueries({ queryKey: ['versions', id] });
    },
  });

  if (isLoading) return <p className="text-gray-500">Loading…</p>;
  if (!req) return <p className="text-red-500">Forecast request not found.</p>;

  const latestJob = req.jobs?.[0];
  const latestVersion = versions?.[versions.length - 1];
  const regions = req.targetForecastRegions as string[];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{req.eventName}</h1>
          <p className="text-gray-500 text-sm mt-1">
            {req.sport} · {req.league} · {req.platform}
          </p>
        </div>
        <button
          onClick={() => startJobMutation.mutate()}
          disabled={startJobMutation.isPending}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-60"
        >
          {startJobMutation.isPending ? 'Starting…' : 'Run Forecast'}
        </button>
      </div>

      {/* Job Status */}
      {latestJob && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-medium text-gray-500 mb-3 uppercase tracking-wide">
            Latest Job
          </h2>
          <div className="flex items-center gap-4">
            <JobStatusBadge jobId={latestJob.id} />
            <span className="text-sm text-gray-500 font-mono">{latestJob.id}</span>
          </div>
          {latestJob.failureDetails && (
            <pre className="mt-3 text-xs bg-red-50 text-red-700 rounded-lg p-3 overflow-x-auto">
              {JSON.stringify(latestJob.failureDetails, null, 2)}
            </pre>
          )}
        </div>
      )}

      {/* Latest Forecast Output */}
      {latestVersion && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-medium text-gray-500 mb-3 uppercase tracking-wide">
            Latest Forecast (v{latestVersion.versionNumber})
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-indigo-50 rounded-lg p-4">
              <p className="text-xs text-indigo-500 font-medium uppercase tracking-wide">
                Global Peak CCU
              </p>
              <p className="text-3xl font-bold text-indigo-700 mt-1">
                {latestVersion.globalPeakCcu.toLocaleString()}
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-2">
                Regional Breakdown
              </p>
              <div className="space-y-1">
                {Object.entries(latestVersion.regionalPeakCcu).map(([region, ccu]) => (
                  <div key={region} className="flex justify-between text-sm">
                    <span className="font-mono text-gray-600">{region}</span>
                    <span className="font-mono font-medium">{(ccu as number).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Version History */}
      {versions && versions.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-medium text-gray-500 mb-3 uppercase tracking-wide">
            Version History
          </h2>
          <div className="space-y-2">
            {versions.map((v, idx) => {
              const prev = versions[idx - 1];
              return (
                <div
                  key={v.id}
                  className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <span className="bg-indigo-100 text-indigo-700 text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center">
                      {v.versionNumber}
                    </span>
                    <div>
                      <p className="text-sm font-medium">
                        Global: {v.globalPeakCcu.toLocaleString()} CCU
                      </p>
                      <p className="text-xs text-gray-400">
                        {v.modelId} · {new Date(v.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  {prev && (
                    <button
                      onClick={() =>
                        setSelectedDiff({
                          from: prev.versionNumber,
                          to: v.versionNumber,
                        })
                      }
                      className="text-xs text-indigo-500 hover:underline"
                    >
                      View diff v{prev.versionNumber}→v{v.versionNumber}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Diff View */}
      {selectedDiff && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide">
              Diff View
            </h2>
            <button
              onClick={() => setSelectedDiff(null)}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              Close
            </button>
          </div>
          <DiffViewer
            forecastRequestId={id}
            fromVersion={selectedDiff.from}
            toVersion={selectedDiff.to}
          />
        </div>
      )}

      {/* Request Metadata */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-medium text-gray-500 mb-3 uppercase tracking-wide">
          Request Details
        </h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          {[
            ['ID', req.id],
            ['Duration', `${req.expectedDurationMinutes} min`],
            ['Regions', regions.join(', ')],
            ['Start', new Date(req.startTimeUtc).toUTCString()],
            ['Schema Version', req.inputSchemaVersion],
            ['Created', new Date(req.createdAt).toLocaleString()],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-gray-400 font-medium">{label}</dt>
              <dd className="text-gray-700 font-mono text-xs mt-0.5">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
