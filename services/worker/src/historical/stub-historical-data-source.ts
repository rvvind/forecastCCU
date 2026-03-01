import type { ComparableEvent } from '@forecastccu/schema';
import type { HistoricalDataSource, HistoricalQuery } from './historical-data-source.interface';

/**
 * Configurable stub for unit and integration tests.
 * Accepts a fixed list of events to return regardless of query.
 */
export class StubHistoricalDataSource implements HistoricalDataSource {
  constructor(private readonly events: ComparableEvent[] = []) {}

  async loadHistoricalEvents(_query: HistoricalQuery): Promise<ComparableEvent[]> {
    return this.events;
  }
}
