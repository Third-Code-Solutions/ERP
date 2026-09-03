# Platform Owner Recovery Runbook

Status: reviewed local implementation; production execution requires the production environment approval gate.

## Invariants

- The only accepted platform-owner email is `kurt@thirdcodesolutions.com`.
- Authority requires one provider-confirmed Supabase Auth identity, the same immutable UUID in `public.users`, an active application account and tenant, and exactly one active `platform_role_assignments` row.
- The assignment, account, and containing tenant are protected from ordinary demotion, suspension, disablement, deletion, or revocation.
- Recovery never creates a second active owner and never changes ownership through the Web console.

## Normal bootstrap

After ADR-027 is applied and current-provider parity is proven, run `node scripts/bootstrap-platform-owner.mjs` inside the protected production environment. The command reads the Auth provider with the server-only service-role credential, requires exactly one verified fixed-email identity, and performs an idempotent database transaction. Output contains only a one-way identity fingerprint, never the UUID or credentials.

### Core identity configuration during promotion

The protected production workflow stages `SUPABASE_SERVICE_ROLE_KEY` and
`ERP_WEB_BASE_URL` on the exact Railway Core API service after its existing
quality/migration/bootstrap gates, immediately before deploying Core. The key
comes from the existing GitHub production secret and is passed to the pinned
Railway CLI through stdin, not command arguments or files. Shell tracing is off,
CLI stdout is suppressed, and `--skip-deploys` prevents variable changes from
deploying an older revision early. Failures stop promotion. No browser or CAD
worker receives this credential. This server-only authority is the ADR-027
boundary; all platform endpoints still independently authenticate and authorize.

Recheck configuration presence and authorized invitation behavior after release.
Staged variable values persist if the later deployment fails; record that state
and retain normal service access controls. Provider SMTP, verified sender domain,
email templates and redirects must still be configured separately. Resend's
application-notification API key is not proof of Supabase Auth email readiness.

## Recovery procedure

1. Open a security incident and freeze platform-administration deployments and mutations.
2. Establish exact provider target, current database backup/recovery evidence, and the last valid platform audit event.
3. Verify the fixed-email Auth identity directly in Supabase: immutable UUID, confirmed email, ban state, and last authentication activity. Do not copy the UUID into tickets, chat, or Obsidian notes.
4. Verify the matching `public.users` record and containing tenant. If either is inactive because of exceptional out-of-band intervention, use a reviewed additive security migration to restore only the exact record.
5. If the immutable Auth UUID changed, do not update the assignment manually. Prepare an ADR-backed additive migration that proves the old identity is unrecoverable, binds the replacement verified identity, retains the old evidence, and preserves exactly one active assignment at commit.
6. Run the bootstrap command again. It must either report the same fingerprint or stop without mutation.
7. Verify negative access with a tenant owner/admin identity and positive access with the recovered owner. Confirm a new append-only audit event and close the incident with redacted evidence.

Never disable the protection triggers, change the fixed email in an interactive SQL session, delete platform audit rows, or grant browser access to global platform tables.

## Password-recovery email release prerequisite

Server-initiated recovery cannot depend on a PKCE verifier stored in the recipient's browser. The callback now supports a provider-verified recovery token hash while preserving the existing recent recovery event, verified session claims, HTTP-only marker, and same-origin destination checks. Ordinary signup/invite/email hashes cannot create a recovery marker.

Before enabling platform reset controls in a hosted release, inspect the exact ERP project's Supabase recovery email template and allowed redirects. The recovery link must use the published application origin and this shape:

```html
<a href="{{ .SiteURL }}/api/auth/callback?token_hash={{ .TokenHash }}&amp;type=recovery&amp;next=%2Fauth%2Fupdate-password">Reset password</a>
```

Verify the Site URL points to the approved deployment, preserve existing branding/template content, and record a redacted same-account delivery-and-reset test. Also allow the approved `/auth/accept-invite` URL for platform invitations. Never paste real token hashes, links, mailbox contents, credentials, or recovery cookies into notes.

Official contract: [Supabase email templates](https://supabase.com/docs/guides/auth/auth-email-templates) and [verifyOtp](https://supabase.com/docs/reference/javascript/auth-verifyotp). No hosted email-template mutation or email delivery test has yet occurred in this task. A successful provider send API response alone does not prove the recipient can recover an account.

## Local browser regression

Build Core, then run `pnpm --filter @third-code-erp/web exec playwright test --config=playwright.platform-admin.config.ts`. The harness requires the existing disposable loopback PostgreSQL lane on54322 and never uses hosted Auth or data. It refuses an existing platform-owner collision, seeds random fixture IDs, runs real Next/Core/RLS, and cleans only its exact synthetic records. Use `PLATFORM_BROWSER_REUSE=true` only when intentionally inspecting that same running fixture. The test does not constitute managed provider proof.
