# Schedule dependency integrity

User outcome: schedule managers cannot save circular predecessor chains or invalidate existing child/dependent tasks by changing a task's level. Existing valid links, retry semantics, permissions and audit history remain intact.

1. Agent 05: reproduce indirect cycles and incoming-link level violations; serialize graph-changing writes on the existing tenant/project row lock; validate the resulting dependency relationships before mutation. Add transaction, rejection-without-write, valid-repair and concurrency proofs.
2. Independent Astra review: inspect graph authority, tenant scope, lock ordering and all writer paths. No parallel edits to implementation files.
3. Agent 13: run release gates and PostgreSQL evidence, then promote through the existing protected workflow only if green. No migration or new dependency is planned.

Luna's reproduction assignment was stopped before any edits because handoff latency exceeded its benefit. Main completed the failing tests, implementation and PostgreSQL coverage within Agent 05 scope. Astra independently reviewed source and tests and found no must-fix defects. Agent 13 owns remaining CI and release verification. Whole-roadmap completion remains unproven.
