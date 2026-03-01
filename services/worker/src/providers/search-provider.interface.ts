export interface RawSearchResult {
  url: string;
  snippet: string;
  rawPayload: unknown;
}

export type SearchOutcome =
  | { success: true; result: RawSearchResult }
  | { success: false; error: string };

/**
 * Abstraction over any web search provider.
 * Swap implementations by changing the concrete class passed to the worker.
 */
export interface SearchProvider {
  search(query: string): Promise<SearchOutcome>;
}
