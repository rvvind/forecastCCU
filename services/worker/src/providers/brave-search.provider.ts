import type { SearchOutcome, SearchProvider } from './search-provider.interface';

interface BraveWebResult {
  url: string;
  title?: string;
  description?: string;
}

interface BraveSearchResponse {
  web?: { results?: BraveWebResult[] };
}

/**
 * Brave Search API provider.
 * Requires BRAVE_SEARCH_API_KEY environment variable.
 * Free tier: https://api.search.brave.com/
 */
export class BraveSearchProvider implements SearchProvider {
  private readonly baseUrl = 'https://api.search.brave.com/res/v1/web/search';

  constructor(private readonly apiKey: string) {}

  async search(query: string): Promise<SearchOutcome> {
    const url = `${this.baseUrl}?q=${encodeURIComponent(query)}&count=3&text_decorations=false`;
    try {
      const res = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip',
          'X-Subscription-Token': this.apiKey,
        },
      });

      if (!res.ok) {
        return {
          success: false,
          error: `Brave API returned ${res.status} ${res.statusText}`,
        };
      }

      const raw = (await res.json()) as BraveSearchResponse;
      const first = raw.web?.results?.[0];

      if (!first) {
        return { success: false, error: 'No results returned by Brave Search' };
      }

      return {
        success: true,
        result: {
          url: first.url,
          snippet: first.description ?? first.title ?? '',
          rawPayload: raw,
        },
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
