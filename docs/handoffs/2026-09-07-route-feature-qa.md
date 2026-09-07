# Route and feature QA — 2026-09-07

## Delivery contract

Audit My Tasks, KYC, Operations, Finance and Admin route by route. Repair confirmed failures and unusable workflow entry points, preserve permissions and existing financial authority, and verify fixes. Production deployment and real business transactions are outside this request.

Baseline: origin/main ed405d3d in isolated worktree D:/thirdcode/ERP-qa-20260907. Original workspace documentation changes are preserved. Prior route-render reports are context, not proof of feature completion.

## Ownership and order

1. Agent 01 (coordinator): bootstrap, scope and coverage ledger.
2. Agent 05: independent read-only Core API diagnosis for tasks, process, KYC and supporting operations; report confirmed defects and bounded fixes. No UI changes.
3. Agent 03 (coordinator): manual browser walkthrough, route/form repairs using existing components. No schema or financial-policy changes.
4. Agent 05: implement any confirmed backend repairs after explicit handoff of evidence. No parallel writes to shared files.
5. Agent 03: regression/browser verification and changeset. Agent 01: consolidate remaining gaps.

## Acceptance

- Each scoped route records actual browser result and meaningful action coverage, separately from source/tests.
- Empty, failed, unauthorized and unconfigured states remain distinct; no synthetic success.
- Confirmed fixes receive focused regression checks and relevant lint/types/build.
- Finance mutations verified only in an isolated test lane; hosted walkthroughs are read-only.

## Delivery state

Local repairs and focused verification are complete except for the explicitly identified manual lifecycle gaps below. The local harness uses synthetic identities against local Postgres and Core; hosted walkthroughs did not save business changes. Changes remain on `agent-03/route-feature-qa` in `D:/thirdcode/ERP-qa-20260907`, uncommitted and undeployed.

The Agent 05 Core-wiring diagnosis and repair handoff is complete. Follow-up domain work covered KYC/PO, warranty intake and Design attachment guards; the coordinator integrated and checked the results.

## Verified findings and repairs

- P1 Process Health: controller existed but ProcessModule was absent from AppModule. Registered it; local browser now returns real health data. Added composition regression.
- P1 daily cadence: scheduled generation selected tomorrow; Manila boundaries were wrong before 08:00. Corrected both with boundary tests. Admin/owner have no default personal cadence, so their empty queues do not prove missing generation.
- P2 My Tasks: existing generation action had no caller and empty guidance pointed to an absent Admin control. Added authorized generation/request-status/refresh controls and an Admin entry. A successful request is described as queued, never generated.
- P2 forms: repaired mobile Admin columns, PO clipping/dialog focus/labels, and delivery/punchlist labels. Connected PO cost-code setup and punchlist creation. Delivery picker now matches Core's issued-only scheduling rule.
- P2 misleading presentation: CNPS no responses no longer implies a zero score/success; KYC explains account vs opportunity reviews and PPRF prerequisite; Finance links setup prerequisites and removes obsolete payables guidance; opportunity totals no longer duplicate the peso symbol.

## Manual browser coverage

This is a route/entry-point pass, not a claim that every lifecycle or all 111 dashboard page files were exercised. Hosted mutation forms were inspected without submitting; local submissions are identified below.

| Routes | Hosted observation / action coverage |
| --- | --- |
| `/tasks` + overdue/week/completed | All tabs inspected. Admin queue empty. Dead generation guidance reproduced. |
| `/crm/kyc-queue` | Empty account queue; account links inspected. Opportunity tracks are a separate system. |
| `/crm/opportunities/[id]`, `/proposal`, `/proposal/pprf` | Followed project/opportunity/proposal/PPRF links. Doubled currency reproduced. PPRF Finance review says no tracks until submission; no review decision submitted. |
| `/process` | Reproduced `Cannot GET /v1/process/health`. |
| `/permits` | Empty; project prerequisite had no link. |
| `/procurement/rfqs` | Empty list/status navigation; no quote lifecycle data available. |
| `/procurement/deliveries`, `/new` | Schedule form accessible; no issued PO available. |
| `/purchase-orders` | Opened/cancelled create modal; no cost codes and clipped columns. Existing partial-delivery PO inspected. |
| `/inventory`, `/inventory/receipts/new`, `/inventory/movements/new` | Setup forms and prerequisite links inspected; missing local masters in hosted tenant. |
| `/invoices` | Two legacy invoice rows. Empty posted-ledger totals are distinct from legacy status. No issuance/payment performed. |
| `/claims`, `/claims/new` | Empty list; new claim form accessible. |
| `/punchlist`, `/punchlist/new` | Empty list lacked entry to existing new form. |
| `/warranty`, `/warranty/cnps` | Empty queues; misleading no-response metrics reproduced. |
| `/documents`, `/reports` | Populated document list/report metrics rendered. File downloads/export content not verified. |
| `/finance`, `/finance/ledger`, `/finance/receivables`, `/finance/payables`, `/finance/cash`, `/finance/reconciliation` | Empty finance masters/posted records; inspected navigation and filters. No live accounting changes. |
| `/finance/journals/new`, `/finance/payables/new`, `/finance/cash/new`, `/finance/reconciliation/new` | Each required missing account/period/cash setup; existing forms and prerequisite links inspected. |
| `/admin`, `/admin/material-items`, `/admin/rate-cards`, `/admin/mapping-config`, `/admin/data-quality` | All opened. Data quality returned no duplicates after load; not an unavailable API. Material page overflow reproduced at 390px. |
| `/admin/users`, `/admin/users/new` | User list and form inspected; no credentials/access changed. |
| `/settings` | Edit/cancel workspace dialog tested; team/profile/finance links inspected. Provider configuration reported missing email/SMS/signing settings. |
| `/projects/[id]` | Existing project work queue and related workspace links inspected; not every project tab. |

Local UI proof: real Next + Core + Postgres, simulated identity provider, outbound providers disabled. Process Health returned empty real data. Material item, rate card (PHP123.45), Togal mapping, and draft PO (PHP100 subtotal/PHP110 total) were created and read back. Admin material/rate/mapping pages fit 390px with internal table scrolling. PO dialog measured352px at390px viewport, focused Project on open, and submitted successfully. No claim of hosted rollout or full procurement/finance lifecycle coverage.

## Remaining coverage and product gaps

- Warranty queue now links tickets and exposes a role-gated project portal issuer before the first ticket. Local browser issuance, client intake, queue/detail navigation, acknowledgement and scheduling persisted. Close/service-report and outbound notification delivery remain unverified manually.
- KYC Queue now includes tenant-scoped pending/in-review opportunity financial and credit tracks, linked to existing PPRF review actions. Each source has independent failure and empty states.
- Hosted Finance requires an authorized chart, fiscal periods, control mappings and cash masters before real posting. Legacy invoice migration/reconciliation is not performed.
- Inngest is configured on hosted Web, but job delivery/current-day generation was not executed against the hosted provider. Local date/handler regressions prove calculation, not provider delivery.
- Hosted Settings reports missing `RESEND_API_KEY`, `EMAIL_FROM`, `SEMAPHORE_API_KEY`, `SEMAPHORE_SENDER_NAME`, `DOCUSEAL_API_URL`, `DOCUSEAL_API_TOKEN`. No email/SMS/external signing delivery claimed.
- RFQ-to-PO approval/issuance, delivery/receipt lifecycle, claim review, warranty close, document download/export contents, and every responsive route remain unverified manually. The initial 11-account role pass below is complete; it is not exhaustive action-level RBAC proof.

## Follow-up: all supplied demo roles

Each identity was confirmed in the hosted account menu before inspection. Passwords were used only for login, never stored here. No hosted business record was changed.

| Account role | Browser evidence |
| --- | --- |
| Owner | `/admin/users` lists all 11 accounts, New user and Manage controls. |
| Admin | Full administration entries; initial Operations/Finance/Admin route pass above. |
| Sales | Accounts exposes new account/PPRF intake; direct KYC URL redirects to dashboard; own task queue empty. |
| Commercial | Rate-card maintenance available but missing material items; PO create control available. |
| Design | Project and proposal/design workspace accessible; raw document UUID field reproduced. Replaced locally with uploaded-file selection and project upload link. |
| SD / PM / PE | Six overdue assigned tasks with completion controls across two projects. Checklist empty because legacy projects have no generated checklist. Duplicate project tab navigation reproduced. |
| Finance | KYC review queue accessible; cash creation points to missing active cash-account setup. |
| Procurement | RFQ list accessible; PO create modal opens, prerequisites and cancel work. |
| Safety | Four overdue tasks; toolbox meeting requires Log meeting, PPE offers Complete. Project permits offers Add permit. |
| CX | Warranty queue accessible; punchlist intake exposes project/assignee/priority fields. |
| Viewer | User list has View only, no New user. Direct `/finance/cash/new` and `/admin/users/new` redirect to dashboard. PO list incorrectly showed creation controls; locally fixed via existing `po.create` capability. |

Additional repairs from this pass: task due/completion dates explicitly use Manila timezone; seven project pages use the existing shared role-aware tab strip instead of duplicated local tabs; PO list supports current statuses and uses the existing shared committed-status definition; design file selection uses related project/opportunity documents rather than internal IDs. Warranty issuer resets issued-link state when the selected project changes.

Final warranty reschedule browser check passed on a fresh development origin. A scheduled timestamp of 02:00 UTC displayed as 10:00 Manila with its associated field label. Saving, reloading and reopening retained 10:00. Earlier stale client assets on the original local origin were excluded from this final proof.

No deployment, commit, push or PR is included in this repair pass.

Final verification: API build/lint and 23 Core tests passed; final Web production build, full configured typecheck, lint, and 153 Web tests across 18 focused/neighboring files passed. Local development-browser checks verified PO keyboard close/return focus, punchlist submission, recoverable task-generation failure, and warranty intake through scheduling. The production-build walkthrough could not authenticate against the loopback identity mock because the existing production CSP excludes that development-only origin. No security policy or browser warning was bypassed, and development-browser evidence is not production deployment proof. Design transaction/locking assertions passed; a concurrent database replay was not run.
