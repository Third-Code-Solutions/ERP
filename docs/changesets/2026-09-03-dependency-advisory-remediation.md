# Audited transitive dependency remediation

Date: 2026-09-03

## Outcome

Patched seven newly published moderate/high dependency advisories that blocked
PR #18's protected Security Scan. The correction selects reviewed upstream
patch releases through the repository's existing exact pnpm override policy;
no production source, public contract, workflow, lifecycle policy, or package
manifest changed.

## Change

- Resolve Express, body-parser, and Superagent to `qs@6.16.0`.
- Resolve Mammoth's XML parser to `@xmldom/xmldom@0.8.15`.
- Advance the existing Ajv/Nest CLI `fast-uri` override from `3.1.5` to
  `3.1.6`.
- Regenerate only the affected lockfile override, integrity, snapshot, and
  consumer edges.

## Advisory evidence

- `qs`: GHSA-x5fp-wj9c-mxmx and GHSA-4mjr-xmp4-gh2g.
- `@xmldom/xmldom`: GHSA-6gmq-8vp8-gcm6.
- `fast-uri`: GHSA-5jgf-p345-68v8, GHSA-f65p-4m7j-42xc,
  GHSA-fph4-wmhf-6fwf, and GHSA-jqff-g426-hqxp.

## Verification

| Gate | Result | Evidence |
| --- | --- | --- |
| Frozen install, scripts disabled | PASSED | Node 22.23.2, pnpm 10.33.0 |
| Production dependency audit | PASSED | `pnpm audit --prod --audit-level low`; no known vulnerabilities |
| Complete dependency audit | PASSED | `pnpm audit --audit-level low`; no known vulnerabilities |
| Dependency path/version proof | PASSED | One patched version for every Express/Mammoth/Ajv consumer path |
| Mammoth extraction coverage | PASSED | 2 files, 10 tests; independent direct DOCX smoke also passed |
| Finance Express HTTP integration | PASSED | 2 real-Postgres files, 2 tests |
| Repository TypeScript and lint | PASSED | Root commands green |
| Production build | PASSED | API webpack and Web 85/85 pages; independently repeated uncached |
| Complete unit suite | PASSED | 2,429 tests passed; 162 database-gated tests explicitly skipped without their optional database environment |
| Secret scan | PASSED | gitleaks 8.30.1; no leaks |
| Independent QA | PASSED | `GO`; zero P1/P2 findings |
| Browser verification | NOT RUN | Lockfile-only behavior; focused runtime tests found no observable UI change |
| Hosted protected workflow | PASSED | Run 33659709980: Security Scan and every required dependent gate passed |
| Production deployment | NOT RUN | Not authorized; ADR-020 still applies |
