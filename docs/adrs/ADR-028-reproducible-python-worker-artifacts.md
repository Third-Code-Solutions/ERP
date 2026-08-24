# ADR-028: Reproducible Python worker artifacts

- Status: Accepted
- Date: 2026-08-24
- Owners: Third Code Solutions Inc.
- Finding: AUD-012

## Context

The AI and DXF workers previously resolved open Python dependency ranges during
container builds. Their Python base tags were mutable, the CAD native-tool
build used a mutable Debian package index, and CI neither retained a software
bill of materials nor failed on high/critical image vulnerabilities. A source
revision could therefore produce a different artifact without a reviewed
source change.

This decision does not resolve AUD-001's repository-governance discrepancy
about worker runtime policy. It freezes and verifies the currently implemented
Python 3.12 contract; changing that contract remains a separate owner decision.

## Decision

Both workers use the same immutable official Python 3.12 Alpine 3.23 index digest,
an exact uv 0.12.0 build tool selected by immutable multi-platform image digest,
`uv.lock`, and separate hashed runtime/development exports. Container builds
must run `uv lock --check`, regenerate the runtime export, compare it byte for
byte with the committed export, and then install with pip `--require-hashes`.
Build tooling and test-only dependencies are excluded from the final runtime
image.

The DXF worker builds LibreDWG from an exact release archive whose SHA-256 is
verified before extraction. Its direct Alpine build packages are exact-version
pinned. Both final images also pin the Alpine `sqlite-libs` security update.
Package version and repository signature are build authorities; if an exact
version leaves the selected Alpine repository, the build fails rather than
substituting another version.

Both final images run as UID/GID 10001 with a non-login account and writable
cache/home paths confined to `/tmp`. CI builds the images from clean state,
runs frozen worker tests and import/runtime smokes, generates SPDX SBOMs, and
uses Docker Scout with a fail-closed high/critical CVE threshold. The official
Astral setup action and Docker Scout action are immutable-SHA pinned and their
human-readable tags are verified with the repository's action-reference gate.
SBOM/SARIF artifacts are retained for seven days. CI does not publish or deploy
the images.

## Consequences

- Dependency, base, native-tool, and system-package refreshes require a
  reviewed lock/export/provenance diff and two clean local builds.
- A stale manifest, lock, or export fails the container build before dependency
  installation.
- New high/critical image findings fail CI until repaired or explicitly handled
  through a separate reviewed security decision; no advisory fallback exists.
- Alpine package availability and Docker Scout are build-time supply-chain
  dependencies. Their versions and digests are visible and intentionally
  updateable only through this ADR's runbook.
- Hosted publication and Railway deployment remain outside this decision.

## Rollback

Restore the previously reviewed Dockerfile, manifest, uv lock, hashed exports,
and exact Alpine package pins as one source change. Re-run the same tests, two
clean builds, smokes, SBOM generation, and fail-closed CVE scans. Never combine
an old base with a newly resolved Python or system-package graph.
