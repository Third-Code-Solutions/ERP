# M3.227 - Controlled upload browser runtime and UX hardening

## Scope

- Exercise the real local login and project Documents upload journey against
  disposable PostgreSQL 17.10/Redis and a loopback auth/Web harness.
- Keep signed-object upload and completion responses controlled; reject all
  unrecognised Storage traffic.
- Make upload progress visible during asynchronous work.
- Contain the Documents page secondary navigation at tablet/mobile widths.

## Implementation

- Extended the test-only loopback auth harness with password-token CORS and a
  bounded Realtime handshake.
- Added `playwright.controlled-upload.config.ts` for the opt-in fixture.
- Separated `useCadUpload` upload-pending state from the post-success
  `router.refresh()` transition.
- Added bounded horizontal overflow to the Documents secondary tab strip.
- Added ARIA and desktop/tablet/mobile screenshot attachments to the fixture.

## Evidence

- Playwright: 1/1 passed.
- Sign, signed Storage PUT, completion: exactly 1 each.
- Unexpected Storage requests: 0.
- Browser console errors and page errors: 0.
- Responsive document overflow: <=1px at 1440x1000, 768x1024, and 390x844.
- Focused Web and full E2E TypeScript checks: PASS.

## Boundary

This is disposable local browser evidence. Core completion and Storage PUT are
controlled responses; it does not certify hosted Auth, Supabase Storage, Core,
production data, Vercel/Railway releases, or billing. No provider, deployment,
or paid action occurred.
