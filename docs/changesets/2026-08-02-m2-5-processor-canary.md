# M2.5 processor canary proof

Added a rollback-only API integration canary for the document-processing
processor. It creates an isolated tenant/project/document fixture, creates a
real processing job, exercises the signed worker-client boundary, persists
validated evidence, commits scope through the Nest authority transaction,
proves duplicate delivery is ignored, verifies tenant-scoped replacement and
audit evidence, then rolls the entire fixture back.

Validation: GitHub Actions run `30708078211` passed the PostgreSQL 17/Redis
7.4.9 integration lane, database assertions, Nest container smoke, full
workspace typecheck/lint/unit tests, production build, Actionlint, and secret
scan. E2E remains skipped by explicit credential gating. No hosted SQL,
feature flag, provider setting, deployment, or business data changed.
