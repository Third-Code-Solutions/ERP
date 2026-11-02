# ABI OPS independent-installation remediation and verification

12 October 2026. Baseline: `b3f8a9bce1ea3c2220245478ce5ad17030ea9e07`.
Branch: `agent-04/production-qa-remediation`; implementation remains uncommitted.

## Scope and release decision

The product is **ABI OPS**. The immediate target is one independent company
installation suitable for a truthful client demonstration. Five subsequent buyers
receive separate infrastructure, credentials, databases, ownership and acceptance
records. White-label SaaS is outside this work.

The original [26-finding audit](2026-10-11-client-turnover-audit.md) remains a
historical baseline. This report records remediation and its verification limits.
**Production turnover is still blocked**, now by installation-specific
acceptance alone; the worker container security gate was remediated on 15
October 2026 (see addendum). No hosted deployment, source
push, ownership transfer or live company-data change was performed.

## Original finding register

“Local fix” means implemented and exercised locally; it is not hosted acceptance.

| Audit | Current disposition |
|---|---|
| 01 Tender authorization | Local fix: direct client mutations denied; authorized server paths and tenant isolation tested. |
| 02 Print authorization | Local fix: role/capability authorization precedes document reads and rendering. |
| 03 Stale DUPA/BOM totals | Local fix: draft parent totals recompute atomically, including shared crew-rate changes. Concurrent-edit regression added. |
| 04 Selling value treated as cost | Local fix: separate direct cost, selling subtotal, VAT and contract total. |
| 05 Double VAT / unclear billing basis | Local fix: explicit reconciled billing basis and snapshotted rates; legacy unreviewed drafts cannot issue. Buyer finance acceptance remains required. |
| 06 Fractional quantities | Local fix: exact fractional BOM/takeoff and PO quantities across validation, persistence, pricing and receipt paths. |
| 07 Seller-bound owner | Local fix: verified immutable Auth identity bootstrap, explicit target and preview by default; no hardcoded seller email. Actual installation owner still must be provisioned. |
| 08 Seller deployment targets | Local fix: validated installation target configuration, no fallback to seller resources. No buyer infrastructure provisioned. |
| 09 Read-only/runtime credential mismatch | Local fix: separate verification, application writer and migration credentials in release configuration and documentation. |
| 10 Incomplete installation procedure | Local fix: explicit Web/Core/Redis configuration, migration, owner bootstrap and operating checklist. Local replay/build exercised; clean hosted installation remains unverified. |
| 11 Production JS dependency advisories | Local fix: production dependency audit reports no known vulnerabilities. Container OS findings remain under 26 below. |
| 12 BIR 2307 | Explicitly incomplete worksheet; corrected identity placement, unknown data left blank, certification claims removed. Official statutory issuance is **not delivered or accepted**. |
| 13 Reserved stock | Local fix: reservation-aware locked availability and atomic linked stock movement; duplicate/concurrent consumption tested. Feature remains gated by installation acceptance. |
| 14 Incorrect operating-company identity | Local fix: configured legal identity in transactional emails/reports; immutable issuer snapshots for newly issued invoices and POs. ABI OPS remains product branding. Legacy missing identity is explicit. |
| 15 Upload quota bypass | Local fix: durable reservation, bounded Core byte transport, actual size/hash verification, uncertain-write accounting and retained-object capacity. Hosted Storage/cutover verification remains required. |
| 16 Suspended portal access | Local fix: active-company checks, strict expiry and atomic warranty/CNPS submission. |
| 17 Stranded outbox work | Local fix: expiring claims, explicit uncertain-delivery dead letter and operator reconciliation. No unsafe automatic resend of ambiguous provider writes. |
| 18 Preview-only approvals / roadmap adapters | Kept explicitly gated and excluded from operational claims. Buyer-specific delegation, SAP and other adapters require separate configuration and acceptance. |
| 19 Initialization gap | Local fix: legal-profile Settings fields and operator-led checklist; removed claim of nonexistent guided setup. Opening balances/master data remain installation work. |
| 20 Documentation drift | Local fix: PRD 1.6, dynamic authority check, current setup/release documentation and updated source-only migration plan. Historical hosted evidence is not relabeled current. |
| 21 Five-buyer acceptance | **Pending external acceptance.** Current scope verifies shared source and local demonstration, not five live companies. |
| 22 Recovery evidence | Local restore passed for final 187-migration schema and synthetic data. Hosted Auth, Storage objects, backup ownership, retention and RPO/RTO remain unverified. |
| 23 Commercial/support handover | **Pending owner/buyer agreement.** Repository sale rights, third-party notices, support, updates, training and acceptance cannot be invented in code. |
| 24 Loading/recovery boundaries | Local fix: truthful generic loading and failure copy, critical workflow boundaries; route inventory check passes. |
| 25 Release test drift | Local fix: CRLF-tolerant contract and correct PWA manifest expectation; release-script suite passes. |
| 26 Worker verification/reproducibility | Hash-locked Python dependencies, non-root images, worker tests and CI scanners added. **Container security gate failed at the 11 October baseline:** each worker has 44 HIGH package findings, eight distinct CVEs, zero CRITICAL; no fixed versions reported for current Debian distribution. No suppressions added. **Remediated 15 October 2026:** both images pass the exact CI Trivy gate with zero findings, still enumerating 57 Debian packages; see addendum. |

## Additional defects found while fixing the audit

- Viewer could create portal tokens, enable provider delivery and insert outbox
  entries directly through broad public-table privileges. ADR-044 revokes client
  table/column writes and corresponding defaults while preserving existing reads,
  invitation activation and trusted server paths. Replayed catalog verifier now
  asserts this boundary instead of requiring obsolete client-write grants.
- Purchase-order/line and BOM/DUPA client writes bypassed command authorization.
  Dedicated guards and the general server-write boundary close those paths.
- Approved BOMs could be reopened to draft. Revision now requires a new version;
  approved financial evidence remains immutable.
- Shared crew-rate edits and BOM edits acquired locks in opposite order. Sorted
  parent locks and trigger ordering remove the reproduced deadlock; deterministic
  one- and two-BOM concurrency tests pass.
- Caller-supplied issuer snapshots and later profile substitution could corrupt
  document identity. Issuance now captures trusted profile data; historical and
  cancelled documents retain their captured identity or explicit legacy gap.
- CNPS duplicate submissions, incomplete transaction/audit handling and a query
  string suggesting false success were hardened and tested against PostgreSQL.
- Production CSP did not permit the configured Core upload origin. Exact-origin
  remediation and production browser verification are recorded in the final
  verification ledger below.
- Revalidated Server Actions could commit the database mutation while React kept
  the browser on stale data or permanently pending. Complete network/Flight/module
  evidence and an unrelated UI update releasing the render without a second POST
  isolated a lost-render-retry failure. ADR-045 selects native administrative
  POST/303/GET while preserving command authority; its final verification is
  recorded below. Other critical Server Action journeys still require operating
  acceptance; these administrative fixes are not an upstream framework fix.

## Verification ledger

Environment: Node 22.23.2, pnpm 10.33.0, isolated PostgreSQL 17 and Redis;
synthetic fixture identities/data. Browser Auth and external document/provider
responses are loopback mocks, not hosted-provider proof.

| Check | Result / boundary |
|---|---|
| Fresh migration replay, seed and CI role parity | PASSED: 187 migrations. |
| Read-only database catalog verifier | PASSED: exact 187-migration ledger, RLS/grants/function checks, including server-owned table writes. |
| Full database suite | PASSED: 546 tests, zero failures/skips. |
| Web unit suite | PASSED: 2,703 tests; 17 database-gated tests skipped in this command and all passed separately below. |
| Web database workflows | PASSED: 17 tests, zero skips, including 11 portal tests. |
| Core unit/HTTP contract suite | PASSED: 1,582 tests in 267 files, zero skips. |
| Full Core integration suite | PASSED in final quiet run: 546 tests, zero failures, two Redis-chaos cases skipped by this command and both passed in the separate five-test Redis run. Earlier concurrent-build run hit one unchanged five-second reconciliation timeout; focused rerun and full quiet rerun passed. |
| Shared contracts / operations suites | PASSED: 564 and nine tests respectively, zero skips. |
| Controlled upload and document retention | PASSED: 13 quota and 53 retention integration tests; real PostgreSQL, mocked Storage transport. |
| Production browser controlled upload | PASSED: real UI → reserve → raw Core transport → completion → persisted document/reservation/audit; actual bytes match local Storage mock. A second upload at full quota shows a denial and performs no provider write. External Storage is not exercised. |
| Redis restart/recovery integration | PASSED: five tests on a separate disposable Redis instance, including both restart/data-loss cases. |
| Workspace type checks | PASSED: six tasks, no cache. |
| Configured lint | PASSED: zero warnings. Final CSP follow-up also passed focused lint and 30 middleware tests. |
| Native administrative submission boundaries | PASSED: 58 focused tests across eight files, Web/E2E types and targeted lint; independent review passed 14 additional adversarial checks of Origin, proxy spoofing, body limits, encoding and fixed 303 redirects. Eleven platform command mappings and Settings authority were reviewed. |
| Release-script tests | PASSED: 349 tests, zero failures/skips. |
| GitHub workflow validation | PASSED: pinned actionlint 1.7.12. |
| Production builds | PASSED: Core and Web; final Web rebuild includes ADR-045 native administrative submissions and strict production CSP. |
| Product branding | PASSED: ABI OPS brand contract, 3,525 text files scanned. |
| Worker tests on pinned Python 3.12 Trixie base | PASSED: CAD 21, AI 8. CAD emits one upstream Starlette test-client deprecation warning. |
| Worker image build and non-root/import smoke | PASSED: both images; CAD converter reports LibreDWG 0.13.4. |
| Production pnpm audit | PASSED: no known vulnerabilities reported. |
| Semgrep | PASSED: three configured rules, 2,445 files, zero findings; 99.9% parsed, three >1 MB files and 11 ignored files excluded. This is bounded SAST, not a penetration test. |
| Current-source secret scan | PASSED: pinned Gitleaks 8.30.1, 246 changed/untracked nonignored files, approximately 2.66 MB, zero findings. Real ignored environment files/build outputs were not exported. |
| Trivy worker images | FAILED at the 11 October baseline: 44 HIGH / zero CRITICAL per image; eight distinct Debian CVEs, no fixed versions reported. Python HIGH/CRITICAL findings: zero. Cached advisory DB updated 11 October 2026 13:06 UTC. **Remediated 15 October 2026:** PASSED under the exact CI command and pinned scanner (no `--ignore-unfixed`, no ignore rules): zero HIGH/CRITICAL, zero Python findings, and 57 Debian packages still enumerated in each image; see addendum. |
| Final-schema restore | PASSED: 218 tables, 47,874 synthetic rows, 559 policies, 1,712 constraint metadata records and table/sequence ACLs match snapshot. 28 deparser-only CHECK text changes match earlier reviewed differences. See database release runbook. |
| Complete production browser sweep | PASSED: all 16 tests on the final production Web build with real Core/PostgreSQL and mocked Auth/Storage. Covers responsive owner console, denied admin routes, support lifecycle/cancellation/audit, Settings save and browser Back, project selectors, legacy redirects, document permissions, real CSV download, analytics, controlled upload/quota, route sweeps, portal rejection, authentication redirects and print media. Earlier runs exposed the corrected administrative render defect, request-context cookie mismatch and harness readiness/Back-navigation races; the final suite passes without retries. |
| Final browser fixture cleanup | PASSED: only the synthetic seed user remains; zero browser-fixture companies and zero upload reservations. |
| Final follow-up checks | PASSED: E2E TypeScript, document authority 16/16 and whitespace/diff validation. |
| Hosted Auth/Storage, real email/signatures/SAP/AI, buyer UAT and production recovery | NOT RUN: no target deployment/provider acceptance performed. |
| Hosted schema diff and full reverse-migration rehearsal | NOT RUN. Additive replay and forward recovery documentation do not prove reversibility of every historic migration. |
| Snyk / independent penetration test | NOT RUN. The configured pnpm, Gitleaks, three-rule Semgrep and Trivy checks do not establish the entire security-policy or penetration-test acceptance. |

## Remaining turnover gates

At the 11 October baseline the Trivy gate reported these HIGH findings in each
worker image; they were resolved on 15 October 2026 by reviewed runtime
minimization (see addendum). Counts are affected package occurrences, not
separate demonstrated exploits. Every row had an empty fixed-version field in
the baseline scan; none was suppressed.

| CVE | Package family | Occurrences per image |
|---|---|---:|
| CVE-2025-69720 | ncurses | 4 |
| CVE-2026-16742 | systemd / udev | 2 |
| CVE-2026-54369 | libacl | 1 |
| CVE-2026-76642 | util-linux | 9 |
| CVE-2026-78408 | util-linux | 9 |
| CVE-2026-78409 | util-linux | 9 |
| CVE-2026-78410 | util-linux | 9 |
| CVE-2026-9538 | perl-base | 1 |

Resolve the worker container security gate through a reviewed patched runtime;
do not remove scanners or suppress findings to create a green release. Provision
one ABI OPS installation under its verified owner and complete role-based
operating acceptance, actual upload/download and recovery, finance reconciliation,
monitoring and integration canaries. Keep unaccepted statutory and roadmap
features out of the demonstration promise. Repeat ownership, infrastructure,
recovery and acceptance separately for each later buyer.

Raw local reports remain outside the repository under
`%TEMP%/abi-ops-security-20261011`. Their synthetic data and service settings are
not deployment credentials. No change here authorizes a production migration.

## Addendum - 15 October 2026: worker container security gate remediated

The worker container security gate is resolved. Both images pass the exact CI
command (`trivy image --scanners vuln --severity HIGH,CRITICAL --exit-code 1
"abi-ops-worker:$WORKER"`) under the scanner pinned in `ci.yml`
(`aquasec/trivy@sha256:af6acf9a6b85dfe389a1941505c0ce9efef52a4719635e1a962f022a3d855daa`,
Trivy 0.75.0) with zero findings and nothing disabled. Changeset:
[worker container runtime minimization](../changesets/2026-10-15-worker-container-runtime-minimization.md).

- `abi-ops-worker:dxf-parser`
  `sha256:1c2602c7b24ef245cae0307691815b0ec25777fb0f933fe7b75d3794a18be481`
  - exit 0.
- `abi-ops-worker:ai`
  `sha256:b015f9c3b157b47bb94fb4025d36886bcc4ed1fd2685a3967e834a58570cee84`
  - exit 0.
- Each scan still enumerates the full OS inventory (`pkg_num=57`) and the
  Python site-packages metadata: zero HIGH/CRITICAL across both targets; the
  summary reads `- '0': Clean (no security findings detected)`. Scans ran
  2026-10-14T16:05:45Z / 16:05:52Z (15 October 00:05 +08).

Mechanism - reviewed runtime minimization, not suppression. New
`apps/workers/dxf-parser/minimize-runtime.sh` and
`apps/workers/ai/minimize-runtime.sh` purge the superseded packages in
dependency-aware order after dependencies install (27 packages anchored by
ncurses, systemd/udev, libacl, util-linux and perl-base, plus bash, coreutils,
sed, tar, apt, dpkg and the remaining libraries that only serve them), using
`dpkg --purge --force-remove-essential --force-remove-protected
--force-depends`, with temporary python-backed rm/tar shims removed again at
the end. It keeps an honest `/var/lib/dpkg/status` (flagged stanzas gone, at
least 40 packages must remain) so scanners still see every remaining package,
and asserts `/bin/sh` plus the worker's python import path (ssl, sqlite3, zlib,
lzma, bz2, ctypes, dbm, unicodedata). The Dockerfiles run it as their last root
step and keep build-time assertions (`dwg2dxf --version`; `import uvicorn,
fastapi`); images still run as UID 10001. `.gitattributes` pins `*.sh text
eol=lf` so a Windows checkout cannot corrupt the scripts and renormalizes
`run-local.sh` and `run-actionlint.sh`.

Unchanged: no scanner removed, no `--ignore-unfixed`, no ignore file, no
scan-database tampering. The baseline's 44 HIGH occurrences and eight Debian
CVEs went away with the packages, not behind a suppression. Hosted scanner
services, Snyk and the independent penetration test remain NOT RUN, and
installation-specific acceptance still blocks production turnover. Raw local
reports for this addendum stay outside the repository under
`%LOCALAPPDATA%\hermes\cache\scratch\purge_audit`. Nothing here authorizes a
production migration.
