import type { ComparableEvent } from '@forecastccu/schema';

export interface HistoricalQuery {
  sport: string;
  league: string;
  platform: string;
}

export interface HistoricalDataSource {
  loadHistoricalEvents(query: HistoricalQuery): Promise<ComparableEvent[]>;
}
