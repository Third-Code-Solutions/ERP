# WO-12 offline inspection RFI

## Server boundary

- RFI actions accept a strict expected-owner precondition from queued clients.
  A changed actor or tenant is rejected before workflow invocation. Existing
  three-argument callers remain compatible; the queued form always supplies its
  server-rendered owner IDs. These IDs do not grant authority.
- Confirmed results bind actor, tenant, submission, opportunity and inspection.
  Malformed or mismatched replies, thrown workflow calls and internal failures
  remain unknown. Refresh failure after commit remains confirmed. No command
  payload or submission ID was added to logs.
- The existing workflow now locks an active actor and active tenant through the
  transaction. Tenant contention fails promptly with the existing unknown/retry
  result. Existing exact-command receipt and append-only audit contracts remain.

## Browser implementation

- Actor/tenant/opportunity/inspection-scoped IndexedDB drafts and immutable
  submitted commands. Only submitted commands drain on reconnect or reload.
- Atomic matching-draft consumption, pending creation and retained revision
  fence; stale tab saves and mismatched saved drafts are rejected without
  overwriting local evidence. Every success waits for transaction completion.
- Strict UUID/scoped server acknowledgements; confirmed cleanup must commit
  before input or identity resets. Failed cleanup retries the exact command.
- Accessible multiline input, connection/draft/queue/retry status, visible
  cross-tab conflicts and scope-local submit state. Changed owners do not see
  or drain another owner's queue. Late reads and responses are scope checked.
- Storage-read errors preserve uncertainty about prior sends; failed initial
  persistence aborts enqueue. No memory fallback disguises unavailable storage.
- CI includes the real-IndexedDB browser suite. The WO-12 structural gate now
  checks enqueue/sync/acknowledgement boundaries, with additional mutation tests.

Independent UI review found post-read scope and storage-error wording defects;
both were repaired and re-reviewed. Final browser verification includes delayed
reads across owner/inspection/unmount changes and retry reads after unknown
server outcomes. No RED is claimed for those four post-review additions.

## Verified evidence so far

- Action RED: 11 failures before owner binding and acknowledgement classification.
  Final main combined action/workflow unit run: 139/139, no skips.
- PostgreSQL RED: all five inactive actor/tenant cases incorrectly succeeded.
  After repair: 11/11 including committed replay, concurrent exact requests,
  actor/payload conflicts, tenant isolation, audit rollback and held-lock probes.
  Main independently ran RFI plus weekly PostgreSQL tests: 22/22, no skips.
- Source ESLint, targeted strict integration TypeScript, CI workflow contract
  tests (10/10), and Actionlint passed. Test files excluded by ESLint are not
  claimed linted.
- Independent action review found no required corrections; review did not rerun
  the tests.
- Main final combined action/workflow/form/store unit run: 150/150, no skips.
  Main final combined Chromium run: 51/51, one worker, zero retries/skips,
  including all 19 offline-RFI cases. Both ran under Node 22.23.2.
- Real-IndexedDB mismatch regression failed before the guard, then passed.
  Initial browser draft-reload regression failed before durable storage.
- Updated WO-12 contract and CI invariant mutation suites: 93/93 passed.
- Full Web and all configured E2E TypeScript checks passed under Node 22.
  Final affected source ESLint and E2E TypeScript passed. Main visually inspected
  production-styled form screenshots at 320/768/1024/1440; no clipping. This is
  isolated component evidence, not whole-dashboard or all-role hosted proof.

Reports are outside the repository: `erp-rfi-action-red.json`,
`erp-rfi-server-main-final.json`, `erp-inspection-rfi-red-20260913.json`,
`erp-inspection-rfi-green-20260913.json`, `erp-rfi-weekly-main-pg.json`,
`erp-rfi-main-units-final.json`, and `erp-rfi-main-browser-final.json` in the
session temporary directory.

## Boundaries

No migration, hosted mutation, new dependency or external provider. Browser
storage contains scoped command data, not authentication tokens. Recovery is
inspection-page scoped while the app is open; no background service worker or
offline HTML cache is promised. Browser storage can be cleared or evicted.

Controlled browser replies are not a substitute for actual server transaction
tests or all-role hosted E2E. This slice does not complete the entire SI-photo
offline workflow, all construction ERP work, or retained-history Suspend.
Inherited production backup/Storage recovery and release holds remain in force.
