# ADR-024: Vercel Speed Insights for production performance evidence

- Status: Accepted
- Date: 2026-08-18
- Owners: Third Code Solutions Inc.

## Context

ABI OPS already mounts Vercel Analytics for privacy-conscious page and CTA
events. It does not collect Core Web Vitals. The Vercel Observability metrics
query is plan-gated for this project, so it cannot be the only source of p75
performance evidence. The project needs a vendor-supported, production-only
real-user measurement path that does not introduce customer record data,
identifiers, prompts, or business payloads into telemetry.

## Decision

Use `@vercel/speed-insights` as the production-only Core Web Vitals adapter.

- Mount `SpeedInsights` once beside the existing `Analytics` component in the
  root layout when `VERCEL === '1'`.
- Do not call identify, attach custom dimensions, or send tenant, user,
  project, document, or financial data.
- Enable Speed Insights for the exact `thirdcode-erp` Vercel project and use
  its dashboard or CLI p75 Core Web Vitals only after production traffic has
  generated samples.
- Keep synthetic browser timing as a separate release check. Synthetic p75
  does not substitute for real-user p75.
- Do not upgrade the Vercel plan merely to access Observability query metrics.
  A future paid observability decision requires an explicit cost review.

## Consequences

- The telemetry dependency is small and runs only on deployed Vercel builds.
- A successful deployment proves instrumentation is present, not that p75 data
  already exists; real user hard navigations and provider ingestion time are
  still required.
- The project gains an all-plan production performance-evidence path without
  weakening the existing provider-spend guard or changing customer data.
