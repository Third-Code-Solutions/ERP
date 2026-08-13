# Cortex semantic-index browser proof handoff

## Scope

M3.157 closes the cost-safe component-browser evidence gap left by M3.156. It
does not enable semantic indexing or mutate hosted authentication.

## Boundaries

- Gallery: test-only, outside Next.js route tree.
- Server: `127.0.0.1:4317` only.
- Browser: installed Chrome; no Playwright browser download required.
- Network: loopback requests only; API responses intercepted by Playwright.
- Production flags and tenant allowlists: false/empty.

## Evidence

- Non-admin control hidden; owner/admin paused unless exact tenant selected.
- Wildcard remains closed.
- Desktop/mobile closed state, confirmation, cancel, one POST, queued,
  processing, success, and terminal failure pass.
- Fixed `{ maxNodes: 64, costConsent: true }` body and UUID idempotency key.
- Mobile dialog actions at least 44px; no overflow or browser errors.
- Focused 6/6; Playwright 5/5; Web 637/637; workspace gates and local build
  pass.

## Remaining gate

This is not a full authenticated route canary. M3.152 owner mapping, complete
managed backup/PITR restore, and exact tenant/spend/rollback approval remain.
