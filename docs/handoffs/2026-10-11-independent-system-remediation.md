# ABI OPS independent-system remediation

Authorization: fix the 26 findings in `docs/research/2026-10-11-client-turnover-audit.md`. Latest direction: make ABI OPS a demonstrable independent installation first; prepare repeatable turnover to five independent companies afterward. The user explicitly corrected TCSI to ABI OPS; retain ABI OPS product branding. White-label SaaS is out of scope. No hosted deployment target has been authorized.

Baseline: `b3f8a9bce1ea3c2220245478ce5ad17030ea9e07`, branch `agent-04/production-qa-remediation`. Three untracked audit documents are preserved. No pre-existing application edits.

## Ordered ownership and acceptance

1. Agent 01: record independent-installation and monetary contracts in PRD/ADR. Preserve existing identities, historical financial documents and data. Distinguish local proof from buyer/provider acceptance.
2. Agent 04 → Agent 05 → Agent 03 → Agent 12: repair tender database privileges, independent verified owner binding, print authorization, suspended-tenant portal checks and durable upload quota. Each role finishes its domain before the next writes. Verify denied/allowed roles, cross-tenant boundaries, owner mismatch and suspended token paths.
3. Agent 04 → Agent 05 → Agent 10: repair exact decimal quantities, DUPA cost/selling/tax separation, atomic parent aggregates, invoice basis, reservation consumption and outbox recovery. Verify transactional rollback, concurrency, immutable issued snapshots and decimal arithmetic against database and application tests.
4. Agent 04 → Agent 14 → Agent 03 → Agent 15: complete company legal/document identity and operator-led first-install readiness; keep unapproved statutory issuance and unconfigured approval/provider features explicitly gated. Verify settings-to-document flow and truthful unavailable states.
5. Agent 13 → Agent 12: parameterize deployment identity, separate database credentials, repair fresh-install documentation/tooling, dependency advisories, worker reproducibility/CI and restore verification. No provider mutation. Verify clean local build, restored synthetic data and fail-closed release identity.
6. Agent 03 → Agent 13: route-family recovery states, manifest/Windows contract tests and document authority checks.
7. Agent 12 independent review → Agent 01 closeout: run affected and full required checks, inspect final diff, record actual results and remaining external acceptance boundaries. No claim of production readiness from compilation alone.

Agents execute sequentially; no simultaneous writes to shared files. Application edits use the current paths under `apps/web/src`, `apps/api/src`, `packages` and `supabase/migrations`. Every handoff records files, results and pending checks here or in its changeset. No commits, pushes or deployment are included.

## External boundaries

12 October follow-up: Agent 12/04/05/03 implements the upload quota boundary under
ADR-043, reusing durable reservations and Core streaming instead of exposing a
provider-signed write capability. Main separately reviews document snapshot
immutability and purchase-order client grants; those files are not shared with
the upload implementation. Company identity handoff is recorded in
`docs/changesets/2026-10-12-company-legal-identity.md`.

Independent financial/security review is read-only across ADR-041/042 and the
issuer/PO-authority fixes. A separate portal handoff owns only CNPS page/actions,
their focused tests and the portal shell: enforce tenant suspension, atomic
one-time response/audit and truthful confirmation, and remove seller identity
from customer-facing operational copy. No shared-file writes or broad test suites
run in parallel with those handoffs.

ADR-044 closes the remaining direct public-table client-write boundary after an
independent caller/RPC review and rolled-back Viewer token/outbox bypass probes.
Main owns the additive migration, CI parity fixture and privilege regressions;
existing SELECT, invitation activation and trusted service-role writes remain.
The final database lane must include this migration and cannot restore legacy
client write grants to make older tests pass.

The installation's actual owner identity, target infrastructure, finance policy approval, official tax-form acceptance, real service credentials and five buyer acceptance records have not been supplied. They do not block local code repair or a synthetic-data demonstration. They do block actual ownership transfer, production deployment, statutory certification and claims of buyer acceptance.

12 October browser handoff: Agent 01 records ADR-045 after reproducing a completed
Server Action whose React render stayed suspended. Agent 03/05 owns native POST →
303 → GET for Settings and platform administration, with shared bounded same-origin
request handling and existing command authority. Agent 12 independently reviews
the replacement CSRF/body/redirect boundary before final browser verification.
Remove the unsuccessful remount, effect and prefetch experiments. No other agent
writes those files during this handoff.

12 October closeout: Agent 03/05 completed ADR-045; Agent 12 independently passed
14 adversarial request-boundary checks. The final production browser suite passed
all 16 tests without retries after readiness and Back-navigation harness fixes.
Only the synthetic seed user remains in the browser database; fixture companies
and upload reservations are absent. Agent 01 records all 26 audit dispositions
and final evidence in `docs/research/2026-10-12-abi-ops-remediation-verification.md`.

15 October closeout: the worker Trivy security gate was remediated by reviewed
runtime minimization (`minimize-runtime.sh` in both worker images) and now passes
under the exact CI command with zero findings while still enumerating 57 Debian
packages per image - see
`docs/changesets/2026-10-15-worker-container-runtime-minimization.md` and the
addendum in the remediation verification report. Hosted
installation/finance/recovery acceptance remains the remaining release blocker.
Changes remain local and uncommitted; no push or deployment.
