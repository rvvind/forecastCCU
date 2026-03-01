import type { SearchOutcome, SearchProvider } from './search-provider.interface';

/**
 * No-op provider used when no API key is configured.
 * Every search returns a failure, triggering the "mark missing evidence" path.
 */
export class NullSearchProvider implements SearchProvider {
  async search(_query: string): Promise<SearchOutcome> {
    return { success: false, error: 'No search provider configured (set BRAVE_SEARCH_API_KEY)' };
  }
}
