# Authenticated browser E2E evidence

## Purpose

The trusted-PR browser gate and the production-promotion browser gate are
evidence controls. They are not permitted to turn green by skipping tests,
using a fallback identity, or targeting a customer tenant.

## Trusted PR gate

The `E2E Tests (trusted PR)` job runs only for same-repository pull requests,
because GitHub does not expose secrets to untrusted forked code. It requires a
separate disposable test environment and the following protected inputs:

| Input | GitHub storage | Requirement |
| --- | --- | --- |
| `E2E_BASE_URL` | Variable | HTTPS origin of the isolated Web target. |
| `E2E_SUPABASE_URL` | Variable | Supabase project URL for that same target. |
| `E2E_SUPABASE_ANON_KEY` | Secret | Anonymous key for that same project. |
| `E2E_USER_EMAIL` | Secret | Dedicated non-human test user. |
| `E2E_USER_PASSWORD` | Secret | Password for that dedicated test user only. |
| `E2E_VERCEL_PROTECTION_BYPASS_SECRET` | Secret | Project-scoped Vercel automation-bypass secret for the protected preview target. |
| `E2E_PROJECT_ID` | Variable | Project in the isolated tenant used by the smoke journey. |

The workflow fails before Playwright starts when any value is absent. It runs
only `e2e/smoke-console.spec.ts`, writes a JSON report, and rejects zero,
skipped, flaky, unexpected, or report-error tests.

The test target must contain no customer data and must use a tenant explicitly
approved for automated browser traffic. Do not reuse a production customer
account, employee account, or a tenant with live finance/procurement records.
The bypass secret is sent only as the Playwright request header documented by
Vercel; it does not disable deployment protection for other requests.

## Production promotion gate

Production promotion uses the existing protected `SUPABASE_SERVICE_ROLE_KEY`
and seeded demonstration tenant only after its migration, health, and
production-data-boundary gates. It runs the selected authenticated branding,
route smoke, role-access, and CAD-worker tests. Their Playwright JSON report is
also rejected when it has zero, skipped, flaky, unexpected, or report-error
tests.

Passing either gate proves only the named workflow against its exact target and
commit. It does not prove tenant isolation, RLS, backups, restore capability,
or broad enterprise readiness.

## Failure response

1. Preserve the JSON artifact and failed-test trace.
2. Verify the target identity and that its test tenant is still isolated.
3. Fix the application, fixture, or explicitly documented test precondition;
   do not add a skip or default credential.
4. Re-run the exact gate and attach the resulting report to the release
   evidence.
