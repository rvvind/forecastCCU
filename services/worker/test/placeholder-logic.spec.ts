/**
 * Unit tests for the deterministic placeholder forecast logic.
 * These tests do not require a database or Temporal.
 */
import {
  computePlaceholderForecast,
  PLACEHOLDER_MODEL_ID,
  PLACEHOLDER_MODEL_VERSION,
} from '@forecastccu/schema';

describe('computePlaceholderForecast – determinism', () => {
  it('produces identical output for identical inputs', () => {
    const a = computePlaceholderForecast(120, ['US', 'GB', 'CA']);
    const b = computePlaceholderForecast(120, ['US', 'GB', 'CA']);
    expect(a).toEqual(b);
  });

  it('different inputs produce different outputs', () => {
    const a = computePlaceholderForecast(120, ['US', 'GB']);
    const b = computePlaceholderForecast(180, ['US', 'GB']);
    expect(a.globalPeakCcu).not.toBe(b.globalPeakCcu);
  });
});

describe('computePlaceholderForecast – formula', () => {
  it('base = expectedDurationMinutes * 100', () => {
    const result = computePlaceholderForecast(60, ['US']);
    // base=6000, 1 region → regional=6000, global=6000
    expect(result.regionalPeakCcu['US']).toBe(6000);
    expect(result.globalPeakCcu).toBe(6000);
  });

  it('regionalPeak = floor(base / numRegions)', () => {
    // base=200*100=20000, 3 regions → floor(20000/3)=6666
    const result = computePlaceholderForecast(200, ['US', 'GB', 'CA']);
    expect(result.regionalPeakCcu['US']).toBe(6666);
    expect(result.regionalPeakCcu['GB']).toBe(6666);
    expect(result.regionalPeakCcu['CA']).toBe(6666);
  });

  it('globalPeak = sum of all regional peaks (with floor truncation)', () => {
    const result = computePlaceholderForecast(200, ['US', 'GB', 'CA']);
    const expected = Object.values(result.regionalPeakCcu).reduce(
      (s, v) => s + v,
      0,
    );
    expect(result.globalPeakCcu).toBe(expected);
  });

  it('all regions receive equal weight', () => {
    const regions = ['US', 'GB', 'CA', 'IN', 'AU'];
    const result = computePlaceholderForecast(100, regions);
    const values = Object.values(result.regionalPeakCcu);
    const first = values[0];
    values.forEach((v) => expect(v).toBe(first));
  });

  it('correctly handles a single region', () => {
    const result = computePlaceholderForecast(150, ['US']);
    // base=15000, 1 region → 15000
    expect(result.regionalPeakCcu['US']).toBe(15000);
    expect(result.globalPeakCcu).toBe(15000);
  });

  it('floor prevents non-integer CCU values', () => {
    // 7 regions: floor(100*100/7) = floor(1428.57) = 1428
    const result = computePlaceholderForecast(100, ['A', 'B', 'C', 'D', 'E', 'F', 'G']);
    Object.values(result.regionalPeakCcu).forEach((v) => {
      expect(Number.isInteger(v)).toBe(true);
    });
  });
});

describe('computePlaceholderForecast – feature vector', () => {
  it('includes modelId and modelVersion', () => {
    const result = computePlaceholderForecast(120, ['US']);
    expect(result.featureVector.modelId).toBe(PLACEHOLDER_MODEL_ID);
    expect(result.featureVector.modelVersion).toBe(PLACEHOLDER_MODEL_VERSION);
  });

  it('includes all relevant input features', () => {
    const result = computePlaceholderForecast(120, ['US', 'GB']);
    expect(result.featureVector.expectedDurationMinutes).toBe(120);
    expect(result.featureVector.numRegions).toBe(2);
  });
});

describe('computePlaceholderForecast – edge cases', () => {
  it('throws when regions array is empty', () => {
    expect(() => computePlaceholderForecast(120, [])).toThrow();
  });

  it('handles 1-minute events', () => {
    const result = computePlaceholderForecast(1, ['US']);
    expect(result.globalPeakCcu).toBe(100);
  });
});
