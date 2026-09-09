# Password rotation release scope

The production promotion workflow now accepts an explicit
`verify_password_rotation` boolean input. Its secure default remains `true`.
When a release owner sets it to `false`, only the reversible live demo-account
password rotation and restoration step is omitted, and the workflow records
that exclusion in the GitHub job summary.

The one-shot production password-recovery proof and every non-password release
gate remain mandatory. Contract coverage verifies the default, the conditional
rotation step, and the truthful exclusion summary.

The authenticated production gate now also runs the existing complete page and
HTTP-handler route audit. It records unavailable positive-record cases separately
and fails on runtime/server faults. Render coverage does not claim mutation or
provider-delivery coverage. The rotation exclusion summary is emitted even when
another gate fails.

## Verification

- Node 22 production auth-proof contract and actionlint 1.7.12: passed.
- Repository lint: passed.
- Web suite: 1,838 passed; both default-skipped PostgreSQL integrations then
  passed against the existing loopback-only CI database (1,840 verified total).
  Change-request fixture writes rolled back transactionally.
- API suite: 978 passed, two HTTP-contract startup timeouts during the concurrent
  local run. Isolated rerun of both files passed all 31 tests with unchanged
  assertions and timeouts. CI remains required for a clean full-suite result.
- Live revision 766492f6044e: all 132 pages audited, with 105 rendered and 27
  invalid-record guards; no page runtime failures. The latter are explicitly not
  positive-record workflow proof. Twenty anonymous GET handlers were probed:
  14 auth guards, two public reads, three malformed-ID 400 responses and one
  authentication callback redirect. No business mutations or password rotations.

Production setup remains separate from test success: Finance currently has no
ledger accounts or posting periods, and transactional email/SMS are unconfigured.
No approved financial masters or business process definitions were invented.
