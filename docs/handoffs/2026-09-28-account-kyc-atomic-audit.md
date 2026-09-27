# Account and KYC atomic audit handoff

Date: 2026-09-28

1. **Agent 03 — Next.js App Router Engineer**
   - Make account creation and KYC review commit their semantic audit entry in
     the same transaction as the business write.
   - Add focused action coverage and a disposable PostgreSQL integration suite.
   - Handoff input: the integration suite is gated by
     `ACCOUNT_ACTIONS_DATABASE_EXPECTED=1` and accepts only loopback disposable
     database names.

2. **Agent 13 — CI/CD & Ops Agent**
   - Run the account/KYC integration suite in both disposable PostgreSQL CI
     paths.
   - Set the explicit database expectation only in those paths and reject
     skipped or pending Web database workflow tests from their JSON reports.

## Handoff status

Agent 03 implementation is present on `agent-03/account-kyc-audit-fix`.
Agent 13 CI wiring is complete in source. The destructive disposable database
lane was not run during CI wiring; its next CI execution remains the runtime
proof.

→ Handoff to the integrating agent. Reason: review and run the complete
disposable PostgreSQL lane when destructive recreation of `erp_self_hosted_ci`
is authorized. Inputs: Agent 03 action changes and tests plus Agent 13 workflow
and runner wiring. Expected output: a zero-skip Web database workflow report
that includes the four account/KYC integration cases.
