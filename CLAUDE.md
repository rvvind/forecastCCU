# CLAUDE.md
## Video Forecasting Service v1
NFL + IPL
Global and Regional Peak CCU Forecasting

---

# 1. Mission

This repository implements a production-grade Video Forecasting Service that:

- Forecasts global peak CCU for live sports events
- Forecasts regional peak CCU breakdown
- Stores versioned, immutable forecasts
- Captures evidence-backed enrichment from open web sources
- Integrates internal historical regional CCU data
- Generates explainability reports
- Supports a feedback loop via realized metrics ingestion

Initial supported sports:
- NFL
- IPL

Forecast scope:
- Per sport
- Per league
- Per platform

---

# 2. Core Principles

1. Deterministic Outputs
   Forecasts must be reproducible given:
   - Input snapshot
   - Enrichment snapshot
   - Model version
   - Feature vector

2. Immutability
   - ForecastRequest records are immutable.
   - ForecastVersion records are immutable.
   - EnrichmentSnapshot records are immutable.
   - Reruns create new versions.

3. Auditability
   Every forecast version must trace back to:
   - Exact inputs
   - Exact enrichment evidence
   - Exact model version
   - Exact feature vector

4. No Fabrication
   - No invented citations.
   - No invented internal data.
   - No hallucinated factors.
   - If evidence is missing, explicitly mark it.

5. Evidence Backed Attribution
   Every factor in explainability must link to stored evidence.

---

# 3. Technology Stack

Frontend:
- Next.js (TypeScript)
- Tailwind CSS
- Zod schema validation
- TanStack Query

Backend:
- NestJS (TypeScript)
- PostgreSQL
- Prisma or TypeORM (choose one consistently)
- Temporal for async workflows
- OpenAPI auto-generated from source

Observability:
- OpenTelemetry tracing
- Structured JSON logging
- Prometheus-compatible metrics

Infrastructure:
- Docker
- Kubernetes
- Terraform
- GitHub Actions CI/CD

---

# 4. Repository Structure (Expected)

```
apps/
  web/
  api/
services/
  worker/
libs/
  schema/
  modeling/
  enrichment/
infra/
  terraform/
docs/
```

Agents must follow this structure unless explicitly instructed otherwise.

---

# 5. Data Model Rules

All IDs must use UUID v7.

Core entities:

- ForecastRequest
- ForecastJob
- EnrichmentSnapshot
- ForecastVersion
- ForecastDiff
- RealizedMetrics

Rules:

- Never mutate historical versions.
- Never overwrite enrichment.
- Always increment versionNumber on rerun.
- Store featureVector JSON for every version.

---

# 6. Workflow Rules (Temporal)

Each forecast execution must follow:

1. ValidateInputActivity
2. CreateEnrichmentPlanActivity
3. ExecuteWebSearchActivity
4. NormalizeEvidenceActivity
5. LoadInternalHistoryActivity
6. BuildFeatureVectorActivity
7. RunModelActivity
8. GenerateExplainabilityActivity
9. PersistForecastVersionActivity
10. ComputeDiffActivity
11. FinalizeJobActivity

Each activity must be:

- Idempotent
- Retry-safe
- Observable

---

# 7. Modeling Rules

Model modules are per:

- sport
- league
- platform

Model interface:

```
runModel(featureVector) → {
  globalPeakCcu,
  regionalPeakCcu,
  factorAttribution
}
```

Model constraints:

- Deterministic output
- Bounded multipliers
- Explicit feature usage
- Versioned modelId and modelVersion

No neural training pipelines in v1.

---

# 8. Enrichment Rules

For each web query:

Store:
- Query string
- Retrieved timestamp
- Raw provider payload
- Extracted snippet
- Extracted structured facts
- URL
- Citation hash

If provider fails:
- Continue workflow
- Mark enrichment as partial
- Do not fabricate

Minimum 2 citations per forecast.

---

# 9. Explainability Rules

Report must include:

- topFactors
- citations
- sensitivityNotes
- limitations

Constraints:

- Each factor must link to evidence IDs.
- No orphan factors.
- No factor without traceable feature source.

Report must be stored as structured JSON and renderable Markdown.

---

# 10. Versioning and Diff Rules

Diff must compute:

- Input changes
- Enrichment changes
- Output changes
- Factor ranking changes

Diffs must be persisted and retrievable.

Never recompute historical diffs dynamically.

---

# 11. Feedback Loop Rules

RealizedMetrics ingestion must:

- Validate region codes
- Reject negative values
- Store immutable records

Calibration must:

- Adjust priors or scaling factors
- Bump modelVersion
- Never alter historical ForecastVersion records

---

# 12. Testing Requirements

Minimum required tests:

- Schema validation tests
- Integration tests with PostgreSQL
- Workflow orchestration tests
- Determinism tests for model
- Version increment tests
- Diff correctness tests

A feature is not complete without tests.

---

# 13. Observability Requirements

Must instrument:

- Job lifecycle duration
- Step execution timing
- Web enrichment call counts
- Model execution time
- Forecast error after feedback ingestion

Logs must be structured JSON.

No PII in logs.

---

# 14. Security Rules

- OIDC authentication required
- Only authorized users may:
  - Create forecast
  - Run jobs
  - Ingest metrics

No public access in v1.

No multi-tenant isolation required in v1.

---

# 15. Non-Goals (v1)

- Manual forecast overrides
- Public user access
- Rate limiting enforcement
- Advanced crawling compliance
- Machine learning training pipelines
- Multi-sport beyond NFL and IPL

---

# 16. Definition of Done

A feature is complete when:

- It compiles
- It passes all tests
- It is version-safe
- It produces observable output
- It is reproducible
- It does not mutate historical data
- It respects all evidence and attribution rules

---

# 17. Hard Constraints for Agents

Agents must:

- Never change schema without migration
- Never mutate historical rows
- Never remove version history
- Never fabricate evidence
- Never bypass workflow orchestration

If uncertain, fail explicitly rather than guess.

---

End of CLAUDE.md
