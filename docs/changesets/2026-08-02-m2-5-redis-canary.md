# M2.5 Redis delivery proof

Added a real BullMQ/Redis integration test for document-processing transport.
The test uses the production queue class, publishes only the opaque processing
job UUID, validates the queue schema, and proves duplicate enqueue/delivery
returns one transport job and one worker execution. The queue is isolated and
obliterated after the test.

Validation: GitHub Actions run `30708445023` passed the PostgreSQL 17/Redis
7.4.9 integration lane (including the processor canary and Redis proof),
database assertions, Nest container smoke, workspace checks, production build,
Actionlint, and secret scan. E2E remains skipped by explicit credential
gating. No hosted state changed.
