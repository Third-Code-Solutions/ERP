# Production change-control blocker

- Date: 2026-08-24
- Finding: AUD-015
- Severity/status: P1 / High change-control risk — BLOCKED
- Owner: project owner and CI/CD & Ops, with Security/DevSecOps review

## Verified evidence

- `gh api repos/Third-Code-Solutions/ERP/branches/main/protection` returned
  HTTP 404 `Branch not protected` on 2026-08-24.
- `.github/workflows/deploy-production.yml` is manually dispatched from `main`
  and targets environment `production`. GitHub resolves that case-insensitively
  to environment `Production`; its API metadata reports
  `protection_rules: []`, `deployment_branch_policy: null`, and
  `can_admins_bypass: true`.
- Promotion run `32583433713` deployed baseline `175eb35a` successfully on
  2026-08-22, proving the workflow and environment credentials are operational;
  workflow conditions alone are not provider-enforced separation of duties.
- The provider repository identity is the public organization repository
  `Third-Code-Solutions/ERP`, while release/source material and self-hosted CI
  pin the personal identity/actor `kurtgav`
  (`docs/operations/FRONTEND_RELEASE_CANDIDATE.md` and
  `.github/workflows/ci-self-hosted.yml`). No branch/environment rule currently
  binds that personal actor to an owner-approved organization release role or
  independent reviewer. This identity mismatch/ambiguity must be reconciled,
  not inferred.

## Exact owner approvals and rules required

1. **Canonical release identity.** The owner must confirm the canonical
   organization repository, the approved dispatcher identity/team, whether
   `kurtgav` is an approved release principal, and a different named
   person/team as production reviewer. Record who may administer or bypass the
   rules; default is no bypass.
2. **`main` branch ruleset.** Approve and apply: pull requests required; at
   least one approval from a designated CODEOWNER who is not the author;
   stale approvals dismissed; CODEOWNER review and resolved conversations
   required; branch up to date; force pushes and deletions blocked; admin
   bypass disabled. Require these current CI job contexts: `Actionlint`,
   `BUILD OPS Invariants`, `Type Check`, `Lint`, `Unit Tests`,
   `Database Reproducibility (Postgres 17)`, `Build`, and `Security Scan`.
   Add `E2E Tests (trusted PR)` only after its conditional execution is proven
   to produce a required result for every permitted PR topology.
3. **`Production` environment rules.** Approve the exact existing environment
   name, restrict deployment branches to protected `main`, require the named
   independent reviewer/team, prevent self-review, disable administrator
   bypass, and keep production credentials only in that environment. A wait
   timer remains zero unless the owner explicitly chooses otherwise.
4. **Verification authority.** Authorize readback of the resulting rules and
   controlled negative tests proving direct push, force push, deletion,
   unreviewed dispatch, self-review, and non-`main` deployment are denied.
   Only then may a reviewed ADR-020 promotion be considered.

Do not dispatch production, attach a self-hosted runner to the public
repository, or claim a protected release while this blocker remains open. No
GitHub, Vercel, Railway, or Supabase state was changed while writing this brief.
