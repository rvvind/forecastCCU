# forecastCCU implementation plan

Advance the NFL/IPL concurrent-viewer forecasting service from its existing historical baseline to measured, reproducible forecasts.

Status: proposed next work, prepared from local source inspection on 2026-10-04. Existing behavior below has not been rerun or release-verified in this planning pass. Update this file as work lands; check an item only after recording its acceptance evidence.

## Current evidence

The workspace has API, web, worker, Prisma, and shared-schema packages. Recent history records enrichment and historical-baseline phases. The worker still exposes a deterministic placeholder forecast path alongside model identity in the feature vector; CLAUDE.md specifies immutable versions and evidence attribution.

## Pending implementation

- [ ] Audit which request paths select the historical baseline versus the placeholder, and expose model identity and fallback reason in the report.
- [ ] Create time-separated NFL/IPL evaluation fixtures with realized global/regional peak CCU; compare the existing historical model with the placeholder without changing historical versions.
- [ ] Add retry/concurrency coverage around forecast-version persistence so an interrupted workflow cannot create duplicate or incorrectly ordered versions.
- [ ] Complete one API-to-worker-to-report acceptance run showing source attribution, forecast/version differences, and realized-metrics feedback.

## Acceptance

The same versioned inputs reproduce the same output. Reports name the actual model and limitations. Concurrent/retried work preserves version history, and evaluation reports error on held-out events.

## Scope and decisions

Retain Temporal orchestration, immutable history, and evidence rules. Regional accuracy targets and the first real evaluation dataset must be chosen before claiming production readiness.

## Sources

- [CLAUDE.md](<CLAUDE.md>)
- [package.json](<package.json>)
- [services/worker/src/activities/forecast.activities.ts](<services/worker/src/activities/forecast.activities.ts>)
- [services/worker/test](<services/worker/test>)
- [apps/api/test](<apps/api/test>)
