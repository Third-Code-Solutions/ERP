# Managed Supabase parity replay handoff

## Scope order

1. CI/CD and Ops: support an explicit export URL and portable PostgreSQL 17
   client without changing provider variables or deployment automation.
2. Database: verify exact source-order migration replay only against an
   isolated localhost clone.
3. Security: keep owner mapping, managed schemas, Storage objects, identity,
   privilege, zero-skip integration, and spend approval as independent gates.

## Completed handoff

Export preflight and pure tests pass. Local snapshot verifier proves the exact
55-to-103 suffix and rejects remote targets. Database-injected tests expose
the public-only snapshot limitations, so release remains closed.

## Next owner input

Database owner provides the external 12-row Purchase Order mapping and an
approved complete managed backup/PITR restore path. No hosted action is
authorized by this handoff.
