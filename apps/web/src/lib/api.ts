const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

async function fetchJson<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface ForecastRequest {
  id: string;
  createdAt: string;
  sport: string;
  league: string;
  platform: string;
  eventName: string;
  eventType: string;
  startTimeUtc: string;
  expectedDurationMinutes: number;
  participants: Record<string, unknown>;
  targetForecastRegions: string[];
  inputSchemaVersion: string;
  isArchived: boolean;
  jobs?: ForecastJob[];
  versions?: ForecastVersion[];
  _count?: { versions: number };
}

export interface ForecastJob {
  id: string;
  forecastRequestId: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  workflowRunId: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  failureDetails: Record<string, unknown> | null;
}

export interface ForecastVersion {
  id: string;
  forecastRequestId: string;
  versionNumber: number;
  modelId: string;
  modelVersion: string;
  globalPeakCcu: number;
  regionalPeakCcu: Record<string, number>;
  featureVector: Record<string, unknown>;
  createdAt: string;
}

export interface ForecastDiff {
  id: string;
  forecastRequestId: string;
  fromVersion: number;
  toVersion: number;
  inputDiff: Record<string, unknown>;
  outputDiff: Record<string, unknown>;
  createdAt: string;
}

// ── API calls ──────────────────────────────────────────────────────────────

export const api = {
  createForecastRequest: (body: Record<string, unknown>) =>
    fetchJson<ForecastRequest>('/forecast-requests', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  listForecastRequests: () =>
    fetchJson<ForecastRequest[]>('/forecast-requests'),

  getForecastRequest: (id: string) =>
    fetchJson<ForecastRequest>(`/forecast-requests/${id}`),

  startJob: (forecastRequestId: string) =>
    fetchJson<ForecastJob>(`/forecast-requests/${forecastRequestId}/jobs`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  getJob: (jobId: string) => fetchJson<ForecastJob>(`/jobs/${jobId}`),

  listVersions: (forecastRequestId: string) =>
    fetchJson<ForecastVersion[]>(
      `/forecast-requests/${forecastRequestId}/versions`,
    ),

  getDiff: (forecastRequestId: string, from: number, to: number) =>
    fetchJson<ForecastDiff>(
      `/forecast-requests/${forecastRequestId}/diffs/${from}/${to}`,
    ),
};
