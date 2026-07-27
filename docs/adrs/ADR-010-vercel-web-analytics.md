# ADR-010: Vercel Web Analytics for the public product surface

- Status: Accepted
- Date: 2026-07-27
- Owners: Third Code Solutions Inc.

## Context

The public landing page needs privacy-conscious page and conversion measurement
without introducing a separate customer-data platform during the foundation
slice. The application is already hosted on Vercel and its CSP already permits
the Vercel Insights endpoint.

## Decision

Use `@vercel/analytics`:

- mount `Analytics` once in the root layout for page-view tracking;
- record named guided-setup and workspace CTA events with placement metadata;
- do not attach record IDs, account data, user content, or other personal data;
- require dashboard enablement and production verification before claiming that
  live acquisition data is being collected.

## Consequences

- One small runtime dependency is added.
- Local and preview rendering remains functional when analytics is unavailable.
- A future consent or customer-data strategy can replace this adapter without
  changing landing-page semantics.
