import type { SearchOutcome, SearchProvider } from './search-provider.interface';

/**
 * Configurable stub used in tests.
 *
 * By default returns a successful result for every query.
 * Pass a `results` map to control per-query outcomes,
 * or set `defaultOutcome` to a failure to test the missing-evidence path.
 */
export class StubSearchProvider implements SearchProvider {
  private readonly results: Map<string, SearchOutcome>;
  private readonly defaultOutcome: SearchOutcome;

  constructor(
    results?: Map<string, SearchOutcome>,
    defaultOutcome?: SearchOutcome,
  ) {
    this.results = results ?? new Map();
    this.defaultOutcome = defaultOutcome ?? {
      success: true,
      result: {
        url: 'https://stub.example.com/result',
        snippet: 'Stub search result for testing purposes.',
        rawPayload: { stub: true },
      },
    };
  }

  async search(query: string): Promise<SearchOutcome> {
    return this.results.get(query) ?? this.defaultOutcome;
  }
}
