/**
 * Unit tests for the comparable-selector pure functions.
 * No Prisma, no network – just data-in / data-out.
 *
 * Run: npm --workspace services/worker run test
 */
import type { ComparableEvent } from '@forecastccu/schema';
import {
  scoreEvent,
  selectTop5,
  weightedMeanGlobal,
  weightedMeanRegional,
  type SelectionInput,
} from '../src/historical/comparable-selector';

// ── Fixtures ──────────────────────────────────────────────────────────────

const base: ComparableEvent = {
  eventId: 'evt-base',
  sport: 'NFL',
  league: 'NFL Regular Season',
  platform: 'peacock',
  teams: { home: 'Chiefs', away: 'Eagles' },
  stage: 'game',
  startTimeUtc: '2025-09-07T20:00:00Z',
  globalPeak: 3_000_000,
  regionalPeak: { US: 2_700_000, GB: 200_000, CA: 100_000 },
};

const input: SelectionInput = {
  teams: { home: 'Chiefs', away: 'Eagles' },
  stage: 'game',
  startTimeUtc: '2025-09-07T20:00:00Z',
};

// ── scoreEvent ─────────────────────────────────────────────────────────────

describe('scoreEvent', () => {
  it('returns 100 for a perfect match (same teams + stage + hour + year)', () => {
    expect(scoreEvent(base, input)).toBe(100); // 50 + 30 + 10 + 10
  });

  it('adds +50 for matching teams regardless of home/away order', () => {
    const reversed: SelectionInput = { ...input, teams: { home: 'Eagles', away: 'Chiefs' } };
    const score = scoreEvent(base, reversed);
    expect(score).toBeGreaterThanOrEqual(50);
  });

  it('team match is case-insensitive', () => {
    const lower: SelectionInput = { ...input, teams: { home: 'chiefs', away: 'eagles' } };
    expect(scoreEvent(base, lower)).toBeGreaterThanOrEqual(50);
  });

  it('does NOT add +50 when teams differ', () => {
    const other: SelectionInput = { ...input, teams: { home: 'Cowboys', away: 'Giants' } };
    // No team bonus: stage(30) + hour(10) + year(10) = 50. A team match would give 100.
    expect(scoreEvent(base, other)).toBe(50);
    expect(scoreEvent(base, other)).toBeLessThan(scoreEvent(base, input));
  });

  it('adds +30 for matching stage', () => {
    const noTeamMatch: SelectionInput = {
      ...input,
      teams: { home: 'Cowboys', away: 'Giants' },
    };
    const sameStage = scoreEvent(base, noTeamMatch);
    const diffStage = scoreEvent(base, { ...noTeamMatch, stage: 'super_bowl' });
    expect(sameStage - diffStage).toBe(30);
  });

  it('adds +10 for same UTC hour (within 1 hour)', () => {
    // Same hour → gets +10; 3 hours off → no +10
    const sameHour: SelectionInput = {
      ...input,
      teams: { home: 'Cowboys', away: 'Giants' }, // no team bonus
      stage: 'final',                              // no stage bonus
    };
    const nearHour: SelectionInput = {
      ...sameHour,
      startTimeUtc: '2025-09-07T21:00:00Z', // ±1 hour of evt 20:00 → qualifies
    };
    const farHour: SelectionInput = {
      ...sameHour,
      startTimeUtc: '2025-09-07T14:00:00Z', // 6 hours off → no bonus
    };
    expect(scoreEvent(base, nearHour)).toBeGreaterThan(scoreEvent(base, farHour));
    expect(scoreEvent(base, nearHour) - scoreEvent(base, farHour)).toBe(10);
  });

  it('adds +10 for same season year', () => {
    const sameYear: SelectionInput = {
      ...input,
      teams: { home: 'Cowboys', away: 'Giants' },
      stage: 'final',
    };
    const diffYear: SelectionInput = { ...sameYear, startTimeUtc: '2024-09-07T20:00:00Z' };
    // base event is 2025, sameYear is 2025, diffYear is 2024
    expect(scoreEvent(base, sameYear)).toBeGreaterThan(scoreEvent(base, diffYear));
    expect(scoreEvent(base, sameYear) - scoreEvent(base, diffYear)).toBe(10);
  });

  it('returns 0 when nothing matches', () => {
    const noMatch: SelectionInput = {
      teams: { home: 'Packers', away: 'Vikings' },
      stage: 'super_bowl',
      startTimeUtc: '2022-01-01T06:00:00Z',
    };
    expect(scoreEvent(base, noMatch)).toBe(0);
  });
});

// ── selectTop5 ─────────────────────────────────────────────────────────────

describe('selectTop5', () => {
  it('returns at most 5 events', () => {
    const events: ComparableEvent[] = Array.from({ length: 10 }, (_, i) => ({
      ...base,
      eventId: `evt-${i}`,
    }));
    expect(selectTop5(events, input)).toHaveLength(5);
  });

  it('returns all events when fewer than 5 are provided', () => {
    const events: ComparableEvent[] = [base, { ...base, eventId: 'evt-2' }];
    expect(selectTop5(events, input)).toHaveLength(2);
  });

  it('returns empty array when no events provided', () => {
    expect(selectTop5([], input)).toHaveLength(0);
  });

  it('places highest-scoring event first', () => {
    const highScore: ComparableEvent = {
      ...base,
      eventId: 'evt-high',
      teams: { home: 'Chiefs', away: 'Eagles' }, // +50
      stage: 'game',                             // +30
    };
    const lowScore: ComparableEvent = {
      ...base,
      eventId: 'evt-low',
      teams: { home: 'Cowboys', away: 'Giants' }, // no team bonus
      stage: 'super_bowl',                        // no stage bonus
    };
    const result = selectTop5([lowScore, highScore], input);
    expect(result[0].event.eventId).toBe('evt-high');
  });

  it('is deterministic – same score ties broken by eventId asc', () => {
    const a: ComparableEvent = { ...base, eventId: 'evt-aaa', teams: { home: 'Cowboys', away: 'Giants' }, stage: 'final' };
    const b: ComparableEvent = { ...base, eventId: 'evt-bbb', teams: { home: 'Cowboys', away: 'Giants' }, stage: 'final' };
    const result1 = selectTop5([b, a], input);
    const result2 = selectTop5([a, b], input);
    expect(result1.map((r) => r.event.eventId)).toEqual(result2.map((r) => r.event.eventId));
    // 'evt-aaa' < 'evt-bbb' → a should come first
    expect(result1[0].event.eventId).toBe('evt-aaa');
  });

  it('each result includes the similarity score', () => {
    const result = selectTop5([base], input);
    expect(result[0].score).toBe(100);
  });
});

// ── weightedMeanGlobal ─────────────────────────────────────────────────────

describe('weightedMeanGlobal', () => {
  it('returns 0 for empty input', () => {
    expect(weightedMeanGlobal([])).toBe(0);
  });

  it('returns the single event globalPeak for one event', () => {
    expect(weightedMeanGlobal([base])).toBe(3_000_000);
  });

  it('computes the equal-weight mean and rounds to nearest integer', () => {
    const events: ComparableEvent[] = [
      { ...base, eventId: 'a', globalPeak: 1_000_000 },
      { ...base, eventId: 'b', globalPeak: 2_000_000 },
      { ...base, eventId: 'c', globalPeak: 3_000_000 },
    ];
    expect(weightedMeanGlobal(events)).toBe(2_000_000);
  });

  it('rounds fractional results', () => {
    const events: ComparableEvent[] = [
      { ...base, eventId: 'a', globalPeak: 1 },
      { ...base, eventId: 'b', globalPeak: 2 },
    ];
    // mean = 1.5, rounds to 2
    expect(weightedMeanGlobal(events)).toBe(2);
  });
});

// ── weightedMeanRegional ───────────────────────────────────────────────────

describe('weightedMeanRegional', () => {
  it('returns zeros for all regions when events array is empty', () => {
    expect(weightedMeanRegional([], ['US', 'GB'])).toEqual({ US: 0, GB: 0 });
  });

  it("returns the event's regional values for a single event", () => {
    const result = weightedMeanRegional([base], ['US', 'GB', 'CA']);
    expect(result).toEqual({ US: 2_700_000, GB: 200_000, CA: 100_000 });
  });

  it('treats missing regions in an event as 0', () => {
    const noGB: ComparableEvent = { ...base, eventId: 'x', regionalPeak: { US: 1_000_000 } };
    const withGB: ComparableEvent = { ...base, eventId: 'y', regionalPeak: { US: 500_000, GB: 200_000 } };
    const result = weightedMeanRegional([noGB, withGB], ['US', 'GB']);
    expect(result.US).toBe(750_000);   // (1_000_000 + 500_000) / 2
    expect(result.GB).toBe(100_000);   // (0 + 200_000) / 2
  });

  it('only computes regions listed in the regions param', () => {
    const result = weightedMeanRegional([base], ['US']);
    expect(result).toEqual({ US: 2_700_000 });
    expect(result.GB).toBeUndefined();
  });

  it('changing the event dataset changes the output', () => {
    const small: ComparableEvent = { ...base, eventId: 'small', globalPeak: 100_000, regionalPeak: { US: 80_000 } };
    const large: ComparableEvent = { ...base, eventId: 'large', globalPeak: 5_000_000, regionalPeak: { US: 4_500_000 } };
    expect(weightedMeanRegional([small], ['US']).US).not.toBe(
      weightedMeanRegional([large], ['US']).US,
    );
  });
});
