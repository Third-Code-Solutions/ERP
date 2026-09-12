# QA/QC document selection and request-bound handoff

## Changes

- Replace the rejected-IWR handoff's raw document UUID field with an optional,
  paginated project-document picker showing filename, type and date. Preserve
  selection across pages, explicit clearing, keyboard controls and honest
  loading, empty, error, retry and out-of-range states.
- Reject stale or foreign document responses. Validate read scope, pagination,
  duplicate identities and document type at the existing Core adapter boundary.
- Capture the complete handoff command once. Uncertain outcomes retain the exact
  command and request key for retry; only an initially known rejection permits
  explicit editing. Confirmations are bound to actor, tenant, project, IWR and
  request. A refresh failure does not erase a confirmed mutation.
- Check current active actor and tenant authority for handoff admission, holding
  compatible SHARE NOWAIT locks through the transaction and semantic audit.
  Document listing also checks current active membership. Existing capabilities,
  document eligibility, tenant isolation and append-only audit rules remain.
- Return the stored request ID for create and replay. Compare UUID identities
  case-insensitively without changing historical command serialization or hashes.
- Negotiate the bound receipt with `x-erp-receipt-version: 1`. Unversioned callers
  retain the exact legacy response; unsupported versions fail before mutation.
  Deploy Core before Web. An unbound response cannot confirm a new Web request.
- Add the production-component browser journey and screenshots to the existing
  mandatory CI job, retaining its single worker, zero retries and other gates.

## Verification

- PASSED: 103 Web tests; 70 API tests including 15 actual PostgreSQL integration
  cases; 70 Chromium browser cases. All three reports passed no-skips assertions.
- PASSED: two shared receipt contract tests, Web and API type checks, targeted source lint, 10 build/ops invariant
  tests, and actionlint. Web lint emitted the existing Pages-directory advisory.
- Verified PostgreSQL concurrency/replay, inactive actor/tenant denial, stale
  roles, conflicting commands, foreign ownership, audit rollback and lock lifetime.
  Protected controller tests cover all 13 canonical roles.
- Reproduced failures before fixes: inactive lifecycle admission, uppercase exact
  replay, action outcome/refresh containment, receipt compatibility and missing CI
  coverage. Initial new UI scaffolding failures are not claimed as product bugs.
- Inspected production-component screenshots at 320, 768, 1024 and 1440 pixels,
  including long filenames and open pagination. Browser action responses are
  controlled fixtures, not hosted authentication or all-role deployment proof.
- Evidence reports and screenshots remain outside the repository under the local
  temporary directory, with prefix `erp-quality-`.

## Boundaries and release

No schema changes, new dependencies, hosted writes or production deployment.
This slice follows PR #79 (parent head `0ac92d69ec16104d7bb10ad60d8881d1d1a4227d`).
Secret scanning and exact-head CI are release gates, reported separately when run.

Eligible documents remain any same-tenant, same-project document; this is not
approved-version enforcement or a coordinate plan canvas. Retry state is held
in memory, not durable across navigation or offline restarts. Other QA/QC
mutation lifecycle paths were not changed or certified by this slice.

Inherited production holds remain: verified database and separate Storage
recovery evidence, authorized isolated restore/rehearsal, hosted migration
preflight and required product decisions. Supabase preview capacity was exhausted
on PR #79; no capacity increase or provider branch deletion is authorized here.
The separately approved Suspend policy for users with retained history is not
implemented by this QA/QC change.
