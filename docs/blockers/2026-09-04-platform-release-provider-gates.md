# Platform release provider gates — 2026-09-04

Status: production promotion blocked; local implementation/verification continues.

## Superseding user direction — 2026-09-04 05:30 +08:00

Database-restoration work is canceled and removed from active memory/tasks. Do not create a recovery copy, buy PITR, perform a restore drill, or ask again for restoration spending approval. No restore was performed and no restore check is marked passed. Existing backups, live data and deployment controls are unchanged. Earlier restoration observations are historical only. Password-recovery email remains a separate in-scope feature.

## Verified evidence

- Exact target: Supabase ERP `aqqrtkmtcsfkbyyqxowv`, PostgreSQL17.6, ACTIVE_HEALTHY.
- Read-only SQL:157 applied migrations through20260901141949; the new platform assignment table is absent. Exactly one fixed-email Auth identity exists and is confirmed/non-deleted. No assignment was created.
- Authenticated provider dashboard: latest completed physical backup is2026-09-03 17:24:58UTC. Storage objects are explicitly excluded from database backups.
- PITR screen states the add-on is not enabled. No add-on purchase or restoration was initiated.
- Restore-to-new-project lists completed backups, but an isolated restore drill and Storage recovery evidence have not been established.
- Auth Emails screen states built-in email delivery is enabled, not production SMTP. Recovery template still uses `{{ .ConfirmationURL }}` rather than the reviewed recovery-token callback.
- The production workflow intentionally blocks pending migrations while recovery evidence is insufficient. The 158th migration must not be applied through an alternative tool to circumvent it.

## Required user/external decisions

Connect a production email provider with a verified sender domain and securely configured credentials. Both existing production application services were checked for reusable email configuration; neither has it. Do not paste credentials into chat or Obsidian. Update the recovery template/redirect allowlist only alongside the reviewed application release, then verify actual delivery and recovery with the authorized account. No database-restoration approval is requested.

## Release preflight follow-up — 2026-09-04 05:43 +08:00

- Live public health/revision check passes at `0a248bc08c37`.
- Required release secret/variable names exist across GitHub production and repository scopes. Only names were inspected; no values were read from GitHub.
- Exact Railway Core variable-presence check: `SUPABASE_URL`, `DATABASE_URL`, `REDIS_URL` present; `SUPABASE_SERVICE_ROLE_KEY`, `ERP_WEB_BASE_URL`, `RESEND_API_KEY`, `EMAIL_FROM` absent.
- The Core identity configuration gap is repaired in source: protected promotion will supply its existing secret via stdin and the approved Web origin to the exact service, with `--skip-deploys`, after existing gates and before the explicit Core release. Two workflow regression tests and actionlint pass. This step has NOT executed against Railway; no new user-provided secret is needed for these two variables.
- Email-provider account selection remains the user-controlled prerequisite. A concise asynchronous question asks for provider/account only, never credentials. Core identity configuration is not a substitute for SMTP.
- The local browser fixture initially could not start because the disposable `erp_self_hosted_ci` database was absent. Recreated a new empty database using only repository bootstrap/migrations/seed, no production data. All158 migrations, schema verifier and176/176 audit coverage pass. This is not the canceled production-restoration task.
- Full API suite passed196files/1025tests and browser suite passed9cases/4.9min. Cleanup verified0 fixture tenants/assignments. Route-wide acceptance, review/commit/PR and the existing pending-migration release boundary are not complete. No gate has been disabled or reported as passed without evidence.

## Provider investigation — 2026-09-04 05:29 +08:00

- PASSED (read-only): Supabase connector reports the exact ERP project ACTIVE_HEALTHY, PostgreSQL17.6.1.121. Dashboard identifies PAVI Pro, Micro compute, Seoul.
- Restoration proposal withdrawn at the user's direction. No billable creation was submitted.
- PASSED (read-only): exact Railway Core production service variable inspection returned false for presence of `RESEND_API_KEY`, `EMAIL_FROM`, and `SMTP_HOST`. Values were not printed or persisted.
- PASSED (read-only): exact Vercel `thirdcode-erp` production variable-name inventory contains no Resend/SMTP sender configuration. No environment values were printed or persisted.
- Official current [restore documentation](https://supabase.com/docs/guides/platform/clone-project) confirms a paid-plan physical-backup restore can create an independent project without PITR. [SMTP guidance](https://supabase.com/docs/guides/auth/auth-smtp) remains the email prerequisite. Changelog inspected; new Free-plan template restrictions do not apply to this Pro target.
- No source code, production data, provider settings, secrets, migration history, or deployment changed during this investigation. Earlier passing local test evidence was not rerun or relabeled as fresh.

## Remaining local work

This is not a declaration that the entire route audit is done. Static inventory covers140pages/35handlers; detailed route-family guides and every critical workflow still need their acceptance evidence. The four audit gaps (176/176 now), support cookie/actor/tenant/expiry checks and Windows fixture teardown have been repaired and verified locally. Settings and Reports received further fixes; recent authentication and document controls are under final regression checks. Final review/commit/PR and release reconciliation remain. Exact current evidence is in [[Third Code ERP Control Center]].

No hosted mutation, deployment, migration, bootstrap, email-template edit, account change, or billable provider operation was performed in this task.
