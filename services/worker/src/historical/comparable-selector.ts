import type { ComparableEvent } from '@forecastccu/schema';

export interface SelectionInput {
  teams: { home: string; away: string };
  /** Maps to the request's eventType field (e.g. "game", "playoff", "final"). */
  stage: string;
  startTimeUtc: string;
}

export interface ScoredEvent {
  event: ComparableEvent;
  score: number;
}

/**
 * Computes a similarity score between a historical event and the incoming request.
 *
 * Scoring rules (additive):
 *   +50  same teams (set comparison, order-independent)
 *   +30  same stage / event type
 *   +10  same UTC hour bucket (±1 hour)
 *   +10  same season year
 */
export function scoreEvent(event: ComparableEvent, input: SelectionInput): number {
  let score = 0;

  // +50 same teams (case-insensitive, order-independent)
  const reqTeamSet = new Set([
    input.teams.home.toLowerCase(),
    input.teams.away.toLowerCase(),
  ]);
  const evtTeamSet = new Set([
    event.teams.home.toLowerCase(),
    event.teams.away.toLowerCase(),
  ]);
  if (
    reqTeamSet.size === evtTeamSet.size &&
    [...reqTeamSet].every((t) => evtTeamSet.has(t))
  ) {
    score += 50;
  }

  // +30 same stage
  if (event.stage === input.stage) score += 30;

  // +10 same UTC hour bucket (±1 hour)
  const reqHour = new Date(input.startTimeUtc).getUTCHours();
  const evtHour = new Date(event.startTimeUtc).getUTCHours();
  if (Math.abs(reqHour - evtHour) <= 1) score += 10;

  // +10 same season year
  const reqYear = new Date(input.startTimeUtc).getUTCFullYear();
  const evtYear = new Date(event.startTimeUtc).getUTCFullYear();
  if (reqYear === evtYear) score += 10;

  return score;
}

/**
 * Selects up to 5 comparable events deterministically.
 * Sort order: score descending, then eventId ascending (stable tiebreaker).
 */
export function selectTop5(
  events: ComparableEvent[],
  input: SelectionInput,
): ScoredEvent[] {
  const scored: ScoredEvent[] = events.map((event) => ({
    event,
    score: scoreEvent(event, input),
  }));
  scored.sort(
    (a, b) =>
      b.score - a.score || a.event.eventId.localeCompare(b.event.eventId),
  );
  return scored.slice(0, 5);
}

/** Equal-weight mean of globalPeak across the selected comparable events. */
export function weightedMeanGlobal(events: ComparableEvent[]): number {
  if (events.length === 0) return 0;
  const sum = events.reduce((acc, e) => acc + e.globalPeak, 0);
  return Math.round(sum / events.length);
}

/**
 * Equal-weight mean of regionalPeak per target region.
 * Events that lack data for a region contribute 0 to that region's average.
 */
export function weightedMeanRegional(
  events: ComparableEvent[],
  regions: string[],
): Record<string, number> {
  if (events.length === 0) {
    return Object.fromEntries(regions.map((r) => [r, 0]));
  }
  const result: Record<string, number> = {};
  for (const region of regions) {
    const sum = events.reduce((acc, e) => acc + (e.regionalPeak[region] ?? 0), 0);
    result[region] = Math.round(sum / events.length);
  }
  return result;
}
