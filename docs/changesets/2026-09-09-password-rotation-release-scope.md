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

## Dependency remediation

Fresh PR CI found eight advisories in the previously locked versions. Existing
packages are updated to Next.js 15.5.25, Sharp 0.35.4, Multer 2.3.0, and AI SDK
provider-utils 4.0.33. No audit exclusions or severity thresholds are changed.
The provider-utils override is restricted to its existing major version.

Upstream references:
- https://github.com/advisories/GHSA-p293-qw3h-jr36
- https://github.com/advisories/GHSA-2xp9-vwfh-vxw4
- https://github.com/advisories/GHSA-rgj7-g3m4-5g8c
- https://github.com/advisories/GHSA-wc9g-mqfw-jrwm
- https://github.com/advisories/GHSA-qfvm-cv95-jqjf
- https://github.com/advisories/GHSA-535w-7cp7-47q4
- https://github.com/advisories/GHSA-qvfw-j98x-7q72
- https://github.com/advisories/GHSA-866g-f22w-33x8
- https://github.com/advisories/GHSA-2883-xcg3-v3hh
- https://github.com/advisories/GHSA-82fw-gwwq-j7x9

The complete development dependency audit additionally required js-yaml 4.3.2
and Vitest 4.1.11 (the advisory has no maintained Vitest 3 patch). All four
Vitest consumers are updated together; the removed `minWorkers` option is
removed while `maxWorkers: 1` preserves serial file execution. The auth package
also requires patched Next.js, avoiding a second vulnerable development copy.
The regenerated full dependency graph audit reports no known vulnerabilities.
Finance and notification query-test helpers now declare callable callbacks
explicitly; Vitest 4's generic mock type also permits constructors. Assertions
and application behavior are unchanged.
Opportunity action tests reset mock implementations between cases, preventing
the intentional cache-failure implementation from leaking into later cases.
All 78 tests in that file pass with the freshly installed Vitest 4.1.11.

The test counts above precede dependency remediation. A frozen-lockfile CI run
must verify the patched dependencies before merge or release.
CI now starts the built Next.js server and verifies that the real image optimizer
returns WebP content with the expected RIFF/WEBP signature for the bundled logo.
