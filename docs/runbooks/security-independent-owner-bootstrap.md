# Independent installation owner bootstrap

ADR-040 replaces the seller-email constant with one immutable binding to a verified
Supabase Auth user ID and its normalized email. This procedure initializes a fresh
installation only. It cannot replace, revoke, or transfer an existing owner.

## Preconditions

- Apply the ordered migrations through `20261011151255_independent_platform_owner_bootstrap.sql`.
- Verify the intended installation's host, database and operator access. Use its
  database-owner migration credential; runtime/API credentials cannot bootstrap.
- Create the intended user's real Auth account through the installation's normal
  account provisioning flow and complete provider email verification. Confirm its
  `public.users` profile and tenant are active, and the profile email matches Auth.
- Record the exact user UUID, verified email and approved bootstrap reason. A tenant
  owner/admin role, signup metadata or an environment email never grants platform power.

Supply `MIGRATION_DATABASE_URL` through the operator's protected environment. The
command deliberately does not load `.env` files or fall back to `DATABASE_URL`.

```text
node scripts/bootstrap-platform-owner.mjs --user-id <verified-user-uuid> --email <verified-email> --reason <approved-reason> --expected-host <hostname:port> --expected-database <database-name>
```

Review the returned target and identity. The default preview performs read-only
checks and returns `changed: false`. Repeat the same command with `--apply` to bind
the selected account and append `platform.owner.bootstrap` audit evidence atomically.
Record the returned trace ID. Any historical owner binding blocks bootstrap, including
a revoked binding; it is never interpreted as permission to replace an owner.

Sign in with that verified account and open Settings → platform administration.
Mutation operations still require authentication within the previous 15 minutes.
Check that a separate tenant administrator cannot open platform administration.

## Failure and recovery

The command exits nonzero on mismatched target, missing verification, inactive user
or tenant, insufficient database privilege, existing ownership, or failed audit write.
It does not disable guards or rewrite identity to recover. If the response is lost,
inspect the assignment and trace in the database before retrying; a committed first
bootstrap makes the retry fail closed. An audit failure rolls back the assignment.

Existing installations retain their exact binding after migration. Do not change an
owner's provider email, remove its Auth account, or disable protection triggers as a
bootstrap workaround. A later ownership/identity recovery requires an explicitly
authorized target and separately reviewed audited procedure. No transfer is implemented.

Recovery from an application rollback keeps the database binding and audit evidence;
keep platform routes closed until the application guard supports the stored identity.
Never restore the tender browser-write grants as a rollback shortcut.

## Verification boundary

The local regression suite uses synthetic identities and an isolated PostgreSQL 17.6
database. Hosted Auth verification, operator credential custody, provider project
identity and actual company-owner acceptance remain installation-specific checks.

Reviewed provider guidance: [Data API grants and RLS](https://supabase.com/docs/guides/api/securing-your-api)
and [RLS policies](https://supabase.com/docs/guides/database/postgres/row-level-security).
Browser grants and row policies are independent controls; the tender migration denies
mutation through both, while private bootstrap is not exposed through PostgREST.
