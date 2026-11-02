# ABI OPS independent-installation remediation

User scope: ABI OPS first as one independent company installation; repeatable
source/system turnover to five separate companies later. No white-label SaaS,
hosted deployment, commit or push included.

## Changes

- ADR-040–045 define independent owner bootstrap, exact financial bases,
  reservation-aware stock, controlled uploads, server-owned table writes and
  native administrative submissions.
- Ten additive migrations close tender/PO/BOM/client-write bypasses, preserve
  financial and issuer history, support fractional quantities, enforce stock and
  upload capacity, and remove seller-bound ownership. Full fresh ledger: 187.
- Fixed invoice/BOM/PO arithmetic, parent recomputation, crew-edit deadlock,
  approval immutability, print permissions, portal suspension and CNPS atomicity.
- Bounded Core upload transport retains uncertain/orphan capacity; existing
  legacy-object deletion remains denied until verified cleanup. Exact configured
  HTTPS Core origin is permitted by production CSP without broadening protocols.
- Company legal settings feed immutable issued-document snapshots and operational
  email/report identity. ABI OPS branding retained. BIR 2307 stays explicitly an
  incomplete worksheet; no statutory acceptance claim.
- Deployment target validation and separate credentials replace seller defaults.
  Setup, handover, recovery and migration documentation now state actual service
  requirements and pending installation acceptance.
- Locked worker dependencies, non-root images, Python/Trivy/Semgrep CI gates,
  release portability corrections and truthful route recovery states added.
- Browser CSV verification exercises the actual download link with browser session
  cookies.
- Native Settings and platform-administration POST/303/GET preserve existing
  command authority and avoid the reproduced stalled Server Action render.
  Shared same-origin and bounded-body checks replace implicit framework controls;
  uncertain mutation errors no longer falsely claim nothing changed. No timer,
  automatic mutation replay or experimental component-remount workaround remains.

## Verification and limits

The authoritative final result is
[the remediation verification report](../research/2026-10-12-abi-ops-remediation-verification.md),
including every original audit disposition, additional defects, actual command
results and remaining blockers. Earlier domain changesets are checkpoints, not
claims that the later final suite had already passed.

Stale fixtures now construct draft BOM lines before approval, calculate actual
pricing rather than impossible header/line combinations, and use completed
controlled-upload reservations for permitted deletion. Legacy-denial regressions
remain. No tests, authorization checks or security gates were disabled.

Final-schema restore matches synthetic data, RLS and table/sequence ACLs. Hosted
Auth/Storage recovery, finance/legal acceptance and buyer environments remain
outside local proof. The worker Trivy HIGH findings were resolved on 15 October
2026 by reviewed runtime minimization (see
[the 15 October changeset](2026-10-15-worker-container-runtime-minimization.md));
production turnover remains unapproved pending installation-specific
acceptance. No seller data or credentials were copied
into buyer infrastructure.

Final production browser sweep passed all 16 tests without retries, including
native administrative saves, browser Back, cancelled confirmations, actual CSV
download, controlled upload, route sweeps and printing. The harness now waits for
both Core readiness and the Web login endpoint before starting. Fixture cleanup,
E2E TypeScript, ABI OPS branding and document-authority checks passed.
