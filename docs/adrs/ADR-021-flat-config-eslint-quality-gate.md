# ADR-021: Use a root ESLint flat-config quality gate

- Status: Accepted
- Date: 2026-08-17

The repository's `lint` command previously ran TypeScript compilation only.
That provides valuable type checking but cannot detect the JavaScript and React
patterns that the declared ESLint quality gate is expected to catch. Calling
that command a lint gate produced misleading release evidence.

The monorepo will use ESLint 9 flat configuration at the repository root. The
configuration applies TypeScript-ESLint recommended rules to the API and shared
packages, and the Next.js 15.5.23 core-web-vitals and TypeScript rules to the
web application. Generated output, dependencies, coverage, and browser-test
artifacts are ignored. The gate is intentionally source-only: test runners and
type checking remain separate quality controls.

`eslint-config-next` is pinned to the installed Next.js minor version so its
framework rules remain compatible. `@eslint/eslintrc`, `@eslint/js`, and
`typescript-eslint` are direct development dependencies because the checked-in
root configuration imports them; relying on transitive package resolution would
make the gate non-reproducible.

This decision does not introduce formatting enforcement or automatic fixes.
Prettier adoption, a custom tenant-query lint rule, and formatter policy need
separate decisions because they would impose broad repository-wide churn and
may require a staged baseline.
