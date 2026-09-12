# ADR-028: Native bulk advisory client for release audits

- Status: Proposed, not implemented; compatibility and live audit proof blocked.
- Date: 2026-09-04

## Evidence

The pinned pnpm10.33.0 implementation calls npm's legacy
`/-/npm/v1/security/audits/quick` and only tries `/audits` after a non-200
response, not after a timeout. Main CI33819088752 repeatedly fails there.
Both legacy endpoints are retired according to
[the upstream report](https://github.com/pnpm/pnpm/issues/11265).
[pnpm11 release documentation](https://github.com/pnpm/pnpm.io/blob/main/blog/releases/11.0.md)
documents the native bulk-advisory implementation. This supersedes the initial
assumption that the blocker was merely a temporary registry outage.

## Proposed decision

Use exact pnpm11.21.0 only for native read-only vulnerability audits of the
committed pnpm lockfile. Retain pnpm10.33.0 for frozen installation, development,
builds and deployment. Do not migrate the lockfile or add an application package.
The audit tool is fetched with lifecycle scripts disabled and no global install.
Its registry integrity is
`sha512-UhcFvOaJkk6scvWjWHEi82JonvZXHlW6gAdv1jfBETLs/62ib61Op5xIW/3b/T1aKlsFgFp36JPeceyKbMo7sQ==`.
Its engine requirement is Node>=22.13, satisfied by the pinned Node22 runtime.

Keep production and complete-graph checks at `--audit-level low`. Do not pass
ignore-registry-errors, ignore-unfixable or advisory ignore lists. Any nonzero
audit exit or changed lockfile fails the gate. The protected production workflow
must run these audits too, before touching providers.

## Tradeoffs and verification

This introduces a separately pinned audit CLI rather than a major build-tool
migration. Review future audit CLI upgrades explicitly. Native pnpm lockfile
compatibility and unchanged hashes must be proven before CI changes ship; a
known-vulnerable synthetic fixture must fail the real audit command.
Network availability remains a hard requirement, not a successful fallback.
The tool runs without production credentials during CI. Native audits report
known advisories, not proof against all supply-chain threats; secret scanning
and all other CI/release controls remain required.

Rollback is to pause release and revert this tooling change through a PR, not
to resume the obsolete audit endpoint or bypass scanning.

## Diagnostic outcome

The downloaded CLI was independently confirmed as11.21.0. Its `--pm-on-fail=ignore`
option is necessary for an audit-only invocation: it prevents automatically
switching back to the project's pnpm10 version; it does not ignore advisories.
The lockfile remained unchanged. However the real production-graph audit and a
known-vulnerable synthetic minimist0.0.8 lockfile audit did not return results,
even with a180000ms request timeout and zero configured retries. Both diagnostic
processes were terminated. A direct20-second bulk request for that one package
also timed out. Therefore no CI command has been changed and the proposed
client is NOT accepted as passing security evidence. Retest before implementation.
