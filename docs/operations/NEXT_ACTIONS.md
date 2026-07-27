# Next Actions

## Exact next action

Complete remaining M1 release controls without enabling production writes:

1. Publish the reviewed source/evidence commits as
   `kurtgav <kurtgavin.design@gmail.com>`, then verify GitHub, Vercel, and
   Railway release identity/outcomes for the exact SHA.
2. Resolve the GitHub organization billing/spending-limit block and rerun the
   exact pinned Supabase PostgreSQL 17/Redis CI lane. The supplemental WSL1
   native lane is green but does not replace this provider-parity gate.
3. Keep deployed tenant-canary source at
   `ERP_PROJECT_WRITES_VIA_API=false`; leave the tenant allowlist empty until
   clean CI evidence is attached.
4. After clean CI, perform the provider-level enable/rollback drill for a
   controlled tenant:
   capture provider configuration, enable exact `true`, prove one compatible
   Web-to-Nest demo command and reconciliation, restore exact `false`, and
   prove the legacy branch is selected.
5. Record provider release IDs, runtime logs, final data reconciliation, and
   the tested rollback procedure before starting M2.

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
