# Production cross-tenant project proof

- Added a protected, read-only Playwright gate that authenticates the dedicated demo viewer, confirms the demo project remains accessible, and checks that an active project from a different tenant is invisible through both Supabase REST/RLS and the Web project route.
- The foreign project is selected with a service-role metadata-only read. The test fails when no active foreign fixture exists, rejects same-tenant or deleted fixtures, and checks Web response status through a cookie-aware request client without rendering a customer page or attaching its body.
- Added mocked fixture regressions and a promotion-workflow contract test. The release workflow runs the new gate with zero retries and rejects skipped tests.
- Local verification: demo boundary contract 11/11 passed; E2E TypeScript check passed; production auth-proof contract 3/3 passed; actionlint passed. An isolated read-only execution against the current live revision failed before authentication because there is no active foreign-project fixture. The protected exact-candidate gate has not run; this representative route does not prove all companies, roles, resources, or workflows.
