# Inspection photo evidence-retention prerequisites

## Changes

- Remove destructive Storage cleanup after failed Core acknowledgements. A lost
  response or concurrent successful registration can leave committed metadata
  referencing the same content-addressed object. Failure is not orphan proof.
- Require an authenticated tenant/opportunity-bound Core preflight before the
  existing privileged upload. Core still reauthorizes its later transaction;
  preflight is not a reservation against lifecycle changes.
- Preserve non-overwriting uploads, existing file-size/type restrictions and the
  success response. Contain thrown upload/Core errors, report uncertain outcomes
  honestly and require schema-valid, tenant/opportunity/path/filename-bound
  success evidence.
- Require active actor and tenant admission with SHARE NOWAIT locks through the
  photo metadata transaction and audit. Preserve owner/admin/commercial access.
- Match persisted filename, MIME, size, document type and normalized caption on
  replay. Reject changed metadata without new effects. Preserve same-tenant
  deduplication and replay after opportunity-to-project conversion.
- Compare route/body UUID identity case-insensitively without changing the case
  of Storage object paths.
- Bind Core adapter receipts to the command's opportunity, tenant path prefix,
  exact path and filename. Reject malformed tenant prefixes before dispatch.
  Session, network, timeout and invalid-response failures no longer claim that
  metadata was not committed; retries must retain the same complete request.

## Verification

- Baseline route: six tests passed. Added RED tests reproduced deleted bytes
  after a simulated committed-metadata/lost-response boundary, uncontained
  exceptions, absent preflight and false confirmation of mismatched receipts.
- Route: 33 tests passed with no skips, including the 13 canonical roles.
- Combined Web regression run: 228 tests passed with no skips, covering the
  route, focused photo adapter and existing Core client suite.
- Backend RED reproduced five inactive actor/tenant states and four changed
  metadata variants being accepted. Mixed-case UUID rejection was also reproduced.
- Main independently ran 34 focused API tests, including 15 actual PostgreSQL
  cases, with no skips. Agent's 35-test run additionally included an existing
  PostgreSQL photo case. API and strict integration type checks passed.
- Web type checks and targeted route source lint passed. The first lint command
  also named a repository-ignored test file and failed on that warning; the
  corrected source-only command passed without disabling any lint rule.
- Independent reviews of the changed route and backend found no required issue. Real provider
  operations, deployed photo journeys and full offline capture are not proven by
  these local tests. Synthetic PostgreSQL fixtures retain their audit history.

## Remaining work and release boundaries

No schema, dependency, hosted data or provider configuration changes. This branch
follows PR #80, `4dd500f7acf9b4691455df35746801474a7fdadd`; production release holds
from that stack remain. Commit, secret scan and exact-head CI status are reported
separately when completed.

This is not complete WO-12. Core path validation does not prove an object exists
or that stored bytes match declared metadata. Durable offline photo bytes,
ownership across reloads, upload settlement and permanent inspection attachment
still require end-to-end implementation. Unconfirmed private objects are retained;
there is no newly authorized orphan-deletion job or cleanup guarantee.

Supabase's [standard upload documentation](https://supabase.com/docs/guides/storage/uploads/standard-uploads#concurrency)
describes concurrent same-path upload behavior and non-overwriting defaults.
The locked client is `@supabase/supabase-js` 2.105.4. Current changelog review found
no relevant Storage breaking change for this bounded retention fix. The existing
15 MB limit is preserved; this local verification does not certify deployment
transport limits or resumable transfer behavior.
