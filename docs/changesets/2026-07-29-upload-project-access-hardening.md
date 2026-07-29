# Upload tenant-Project access hardening

## Outcome

Upload sign and complete handlers now prove same-tenant Project existence
before quota, Storage, document recording, parsing, AI, or queue work.

Shared Project lookup now queries tenant and Project ID together instead of
loading one tenant row and comparing its ID later.

## Compatibility

- Missing and cross-tenant Projects return `404 Project not found`.
- Valid same-tenant signed uploads retain current response fields.
- Valid same-tenant completion retains document-recording behavior.
- No UI or copy changed.

## Validation

- Focused tests: 6/6.
- Full lint, typecheck, tests, and production build: pass.
- Root tests: 256 pass; 132 expected disposable-database skips.
- Web build: 77/77 routes.

## Runtime impact

Source only. No schema, data, Auth, Storage, queue, provider, or deployment
change.

## Rollback

Revert shared query, two route guards, tests, and documentation together.
If later deployed, promote last known-good Vercel artifact. Do not weaken
tenant checks as a recovery step.
