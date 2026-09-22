# Unified dashboard and sidebar design

Platform Control, the executive company dashboard and My Work now share a light,
compact workspace presentation based on the user's supplied reference. Shared
navigation provides filtered page search, expandable groups, desktop collapse,
mobile navigation and a persistent account/footer area. Tenant links still come
from the existing role policy; platform authorization and support rules are unchanged.

Large gradient greetings and dark Today panels were replaced with neutral
surfaces, thin borders, compact headings, tabular metrics and blue actions.
Duplicate My Work header actions were removed. Dashboard loading cells now have
unique React keys. Public pages and portals do not receive workspace tokens.

Verification completed locally:
- 78 focused navigation, role-policy, branding and layout tests passed.
- 11 dashboard component/access tests passed.
- Full frontend suite: 307 files / 2,621 tests passed; two database-dependent
  tests skipped because this unit run did not set their database configuration.
- Web TypeScript check and focused application ESLint passed.
- Runtime brand scanner and App Router boundary checks passed.
- Real Next/Core/local PostgreSQL browser fixture: executive, Platform Control
  and Viewer My Work verified at desktop and 390px phone widths; search, section
  disclosure, sidebar collapse and mobile identity/navigation exercised.
- Disposable browser records cleaned using the fixture's cleanup endpoint.

Production build is checked separately before release.
No database migration, hosted data change or new dependency is included.
