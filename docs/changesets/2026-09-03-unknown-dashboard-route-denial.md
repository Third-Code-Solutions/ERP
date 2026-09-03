# Fail-closed dashboard route registry

## Outcome

Dashboard route admission now denies unregistered and misspelled paths instead
of inheriting an allow-by-default fallback. Every real dashboard page has an
explicit route template and thirteen-role outcome while page-local tenant,
entity, and mutation checks remain in force.

## Changed areas

- `apps/web/src/lib/operations/nav-config.ts`
  - added the complete 99-template dashboard route registry;
  - added exact static/dynamic template matching;
  - derived sensitive per-page role sets from existing capabilities and read
    projections;
  - changed the unmatched dashboard result to deny.
- `apps/web/src/lib/operations/nav-config.test.ts`
  - added all-role policy, positive-path, and adversarial descendant/typo
    regressions.
- `apps/web/src/lib/operations/dashboard-route-inventory.test.ts`
  - asserts exact equality among filesystem pages, production registrations,
    and an explicit expected role matrix.
- `apps/web/src/app/(dashboard)/layout.route-policy.test.tsx`
  - verifies the authenticated layout redirects unknown paths and renders a
    registered hidden secondary route.

No page business logic, capability grants, API, database, schema, dependency,
account, provider configuration, or deployment target changed.

## Verification

| Check | Result |
| --- | --- |
| Focused/downstream Vitest | PASSED — 4 files, 63 tests |
| Filesystem/registry/oracle equality | PASSED — 99/99/99 unique templates |
| Independent 13-role authorization review | PASSED — `GO`, no P1/P2 |
| Complete Web and E2E TypeScript | PASSED |
| Web source ESLint | PASSED |
| Production build | PASSED — 89/89 static pages |
| Gitleaks | PASSED — 1,747 commits, no leaks |
| Whitespace and scope checks | PASSED |
| Isolated built-app browser verification | PASSED — Viewer, Commercial, Finance, and Sales allowed/denied/unknown-path matrix |

## Release status

Implemented locally on the branch stacked above PR #19. No deployment was
performed. ADR-020 requires the reviewed stack on `main` with green release
gates on that exact SHA before production release.

The browser run used an isolated local production server. Registered forbidden
pages redirected to `/dashboard?error=forbidden`; unknown or misspelled paths
returned Next.js not-found without dashboard chrome or protected forms. No
password, account, provider, or ERP-data mutation was performed, and the server
and temporary browser artifacts were removed after verification.
