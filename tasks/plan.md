# BUILD OPS ERP Refactor Plan

## Overview

Refactor ABI OPS into the BUILD OPS operating system defined by the
three authority PDFs. Work proceeds as additive, tenant-safe vertical slices;
each slice must prove schema, API, UI, CI, and browser behavior before hosted
promotion.

## Current evidence

- Repository root: `D:\thirdcode\ERP`.
- Target Supabase project: `aqqrtkmtcsfkbyyqxowv`, ACTIVE_HEALTHY, PostgreSQL
  17.6.1.
- Hosted migration head: `20260729233017`.
- Provider-linked source head: `20260812150000`; 69 provider migrations are
  pending.
- Hosted release is blocked by twelve tenant-scoped `PO-0002` rows. No data
  mutation is authorized by this plan.
- Hosted WO-02 audit coverage is 71/86 tables. Missing `audit_log.entity_key`
  and business-calendar objects also block the gate.
- Local API verification passes: 51/51 API tests, API typecheck, and 3/3
  rollback-backed Nest database integration journeys. Web verification passes:
  347/347 tests, typecheck, a 79-route production build, and Chromium public
  release/portal E2E 5/5. Static invariant, actionlint, and gitleaks checks
  pass.
- The disposable PostgreSQL 17 lane passes 245/245 database tests with zero
  skips; WO-02 audit/calendar, WO-04, WO-05, WO-06 schema, WO-06 behavior, and
  WO-08 schema/importer controls pass locally. The WO-08 route and CAD
  integrations also pass against the disposable database. The 107/107
  audit-trigger coverage gates pass locally.
- Provider-linked `origin/main` source structurally replays 124/124 migrations
  on a fresh local PostgreSQL 17 database; this does not authorize hosted
  promotion or resolve hosted duplicate data.

## Dependency order

1. WO-00 CI/invariant gates.
2. WO-01 demo-data inventory and authorized cleanup mapping.
3. WO-02 business-day service and complete audit coverage.
4. WO-03 process/SLA foundation and source-backed seed data.
5. WO-04 grain classification and human review queue.
6. WO-05 locations, then WO-06 DUPA engine, then WO-07 BOM view.
7. WO-08 takeoff import, WO-09 historical Excel import, WO-10 RFQ pricing.
8. WO-11 through WO-18 operational workflows and management dashboard.
9. Hosted database release, CI/CD promotion, production smoke, and rollback
   verification only after source, data, and security gates pass.

## Current implementation slice: WO-08

- WO-04 grain classification and WO-05 location dimension are locally verified.
- WO-06 DUPA engine and M-03/M-04 database foundation are locally verified
  through the isolated PostgreSQL 17 lane.
- WO-06 canonical sign-off is blocked by the PRD arithmetic contradiction;
  do not build WO-07 UI/API on unresolved pricing semantics.
- WO-08 generic structured takeoff intake is locally verified through parser,
  API, migration, PostgreSQL integration, and public browser-route evidence.
- WO-08a CAD auto-drafts now land as zero-priced AI work items with stable row
  identity, provenance, unresolved queue entries, and DUPA/vendor preservation.
- Authenticated browser verification is blocked by invalid credentials for the
  configured default E2E account; this is not treated as UI success.
- Standalone public runtime smoke verifier passes the current ABI OPS manifest
  contract.

## Current implementation slice: WO-10

- RFQ quotes now persist tenant-scoped quote provenance in `price_history`,
  update `material_catalog`, and return a durable `priceHistoryId`.
- Completed RFQs expose an idempotent quote-award command that records the
  awarded rate, updates the catalog rate, and writes semantic audit entries.
- Quote comparison and BOM supplier-rate surfaces show award state and stale
  rates older than 90 days.
- Local unit, API, disposable-Postgres, build, static, and public Chromium
  evidence passes. Core API and award flags remain disabled.
- WO-09 remains blocked pending real ABI workbook templates; no fake fixtures
  satisfy the historical Excel acceptance criteria.

## Release gates

- No production DDL or data mutation while source divergence, duplicate PO
  mapping, or hosted WO-02 failures remain unresolved.
- Every mutation has tenant authorization, input validation, and audit output.
- Local and hosted migration histories must be reconciled before `db push`.
- Full unit, integration, build, browser E2E, advisor, health, and rollback
  evidence required before claiming completion.

## Open decisions

- Owner must approve the mapping or disposal policy for the twelve synthetic
  `PO-0002` rows before production cleanup.
- ABI must provide the SD Framework source and WO-09 workbook templates.
- ABI must name the rate-maintenance owner and approve the DUPA VAT-base
  default.
