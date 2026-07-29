# Next Actions

## Exact next action

Complete remaining M1 controls without enabling production writes:

1. Keep deployed tenant-canary source at
   `ERP_PROJECT_WRITES_VIA_API=false`; leave the tenant allowlist empty.
2. Implement the smallest supported onboarding slice for one dedicated canary
   tenant: active Supabase Auth identity, authorized same-tenant user,
   non-critical reversible E2E Project, and genesis-rooted audit evidence.
   Do not repair or waive the existing tenants' historical audit mismatches.
3. Run `pnpm plan:project-cutover -- --require-ready` against that exact target.
   Capture the complete mutable Project baseline in a restricted release
   artifact; keep identifiers and business values out of Git and logs.
4. Before any paid frontend build, confirm the exact expected Vercel charge
   and obtain user approval. Do not reconnect Git or create a duplicate
   preview.
5. After approval, perform the provider-level enable/rollback drill for the
   controlled tenant:
   capture provider configuration, enable exact `true`, prove one compatible
   Web-to-Nest demo command and reconciliation, restore exact `false`, and
   prove the legacy branch is selected.
6. Record provider release IDs, runtime logs, final data reconciliation, and
   the tested rollback procedure before starting M2.
7. Retry physical deletion of credential-free runner work directories after
   Windows releases their transient file handles.

## Following milestone

M2: remove the Python `scope_items` direct-write path. Python returns immutable
processing evidence; BullMQ transports it; a new Nest command authorizes,
idempotently validates, and commits accepted changes.

## Do not start yet

- No finance migration before M1 integration evidence.
- No broad Server Action replacement.
- No production feature-flag enablement.
- No new microservices.
- No external ERP source, schema, UI, or wording reuse.
