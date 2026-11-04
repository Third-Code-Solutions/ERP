# OCE public module-map survey (clean room)

`oce-recon` survey mode, 2026-11-04. Branch `docs/erp-phase-d`.

**Inputs.** I read only OpenConstructionERP's (OCE) public descriptive material:
- the website (home page module list, playbook index, docs page);
- the GitHub org page, repo README, modules docs index and releases page;
- the README of the cost-dataset repo.

I opened no OCE source, schema, migration or i18n files. Everything below is my
own wording. Every row is justified by a contractor need, and for Philippine
items by a non-OCE source (see [Sources](#sources)). Statuses are deliberately
not set; `erp-domain-expert` owns them.

**What OCE publishes.** v19.0.0 (2 Nov 2026) claims about 190–225 modules in
about a dozen families:
- estimating, cost data and BIM/CAD;
- scheduling and controls;
- commercial and procurement;
- field and site;
- quality, safety and sustainability;
- documents and collaboration;
- AI;
- reporting and integrations;
- regional packs;
- platform.

OCE's regional packs cover the US, DACH, UK, Russia/CIS, the Middle East,
Asia-Pacific (China, Japan, Australia), India and LatAm. **There is no
Philippines pack.** Filipino is only listed as a UI language. The PH rows below
therefore come from PH law and our PRD, not from OCE.

**Legend.**
- *new* = row not in the seed BACKLOG.
- Heavy infra = CAD / BIM / ML / OCR; `—` = none.
- "PRD" = `docs/PRD.md` v1.5 (BUILD OPS), which ARCHITECTURE.md names as the authority.

## Module map

Rows are listed in the proposed order within each wave. Seed wave assignment is unchanged (see [Reordered](#reordered)).

### Wave 0: Foundation
| slug | module | behaviour | depends on | MVP/later | heavy infra |
|---|---|---|---|---|---|
| tenancy | Organisations / tenant settings | One company record holding currency (PHP), default VAT rate, fiscal year and the Manila business calendar. Every business row is scoped to it. | — | MVP | — |
| rbac | Users, invites, roles, permissions | Invite users, assign roles, and pass every read and write through one permission check. SSO comes later. | tenancy | MVP | — |
| audit-log | Audit trail | Append-only, tamper-evident record of who changed money, approvals and documents, and when. | tenancy | MVP | — |
| notifications | Notifications | In-app and email alerts with per-user preferences, triggered by assignments, approvals and due dates. | rbac | MVP | — |
| approvals | Approval routes | Multi-step sign-off by role or amount band, with delegation, escalation and one audit entry per decision. Reused by BOQ, budget, PO, variation, payment application and invoice. | rbac, audit-log, notifications | MVP | — |
| contacts | Contacts directory | One directory of clients, subcontractors, suppliers and consultants, with their people, addresses and role on each project. | tenancy | MVP | — |
| tax-profile *new* | Tax & registration profile | TIN with branch code, VAT or non-VAT status, BIR certificate of registration, zero-rated or exempt certificates, and withholding-agent class, held for the tenant and each counterparty. Also a maintained table of withholding rates by income type. Every invoice, bill and payment reads it. | tenancy, contacts | MVP | — |
| projects | Projects & portfolio | Project record (client, site, type, contract value range, stage) and portfolio grouping. | tenancy, contacts | MVP | — |
| documents | Document store | Upload, version, tag and preview project files in private storage, shared through time-limited links. | projects | MVP | — |
| tasks *new* | Tasks / action items | One assignable to-do (owner, due date, status, link to its source record). Meetings, RFIs, inspections, punch items and approvals create these instead of each keeping its own list. | projects, rbac, notifications | MVP | — |

### Wave 1: Estimate
| slug | module | behaviour | depends on | MVP/later | heavy infra |
|---|---|---|---|---|---|
| crm *new* | Sales pipeline | Leads and opportunities move through bid stages with expected contract value, GP, probability and client KYC/financial standing. A won deal converts to a project. | contacts, projects | MVP | — |
| cost-db | Cost database | The tenant's own labour, material, equipment and subcontract rates, each with unit, source and effective date. Seeded from the tenant's own unit-price analyses, not from third-party datasets. | tenancy | MVP | — |
| assemblies | Assemblies / composite rates | Build a unit rate from crew, materials and equipment, with waste, lap and productivity factors, and reuse it across estimates. | cost-db | MVP | — |
| conceptual-estimate *new* | Early-stage estimate | Rough cost from floor area or unit counts using historical cost per m², to size a lead before drawings exist. | cost-db, crm | later | — |
| boq | Bill of quantities | Sections and items with quantities, rates, markups, allowances, provisional sums and general requirements (preliminaries). Revisions can be compared side by side. Locked on award. | projects, assemblies, approvals | MVP | — |
| boq-validation | Estimate checks | Rule checks (missing rate, zero quantity, rate far from history, markup out of band) shown as a pass/warn/fail report before submission. | boq | MVP | — |
| boq-export | Import / export | Excel, CSV and PDF out. Excel and external takeoff files (e.g. Togal) in, landing as unpriced draft lines. Guarded against spreadsheet formula injection. | boq | MVP | — |
| proposal *new* | Proposal / quotation | Generate the client-facing priced proposal from the BOQ, with inclusions, exclusions, assumptions, validity and payment terms. Versioned, with sent and accepted tracked. | boq, boq-export, crm | MVP | — |

### Wave 2: Commercial
| slug | module | behaviour | depends on | MVP/later | heavy infra |
|---|---|---|---|---|---|
| tendering | Subcontract & supplier bidding | Package BOQ items, invite subcontractors and suppliers, collect quotes, compare them side by side (canvass / price comparison) and award. | boq, contacts | MVP | — |
| licences *new* | Licences & accreditations | Register the tenant's and each counterparty's licences: PCAB category and classification with allowed contract range, PhilGEPS registration, and insurance such as CARI. Expiry alerts, plus a warning when a bid or award exceeds the licence range. | contacts, documents | MVP | — |
| contracts | Contracts | Head contract with the client and subcontracts with subs. Holds contract sum, payment terms, retention %, down-payment amount and recoupment rule, liquidated-damages rate and cap, and defects or warranty period. | boq, contacts (tendering for subcontract awards) | MVP | — |
| subcontractors *new* | Subcontractor management | Prequalify (licence, tax registration, insurance), onboard, and track scope, performance and payment status per subcontractor. | contacts, tax-profile, licences | MVP | — |
| procurement | Purchase requests & POs | Requests (from BOQ quantities or ad hoc) become approved POs, then deliveries and goods receipts. Covers VAT on PO lines and commitment against budget. | boq, contacts, approvals | MVP | — |
| variations | Variations / change orders | Site instruction, then priced proposal, then client sign-off. Records cost and time effect and rolls the result into contract sum and BOQ. | contracts, boq, approvals | MVP | — |
| bonds *new* | Bonds & guarantees | Performance, surety, down-payment, retention and warranty bonds per contract, with amount, issuer, expiry and refund tracked through release. | contracts, documents | MVP | — |
| rfi | RFIs | Questions to designer or client with due dates. An answer that changes cost starts a variation. | projects (variations, tasks) | later | — |
| submittals | Submittals & transmittals | Send shop drawings, samples and product data for review, track review status and record formal acknowledgement. | documents, approvals | later | — |

### Wave 3: Controls & money
| slug | module | behaviour | depends on | MVP/later | heavy infra |
|---|---|---|---|---|---|
| progress | Progress measurement | Percent complete or measured quantity per BOQ item at a weekly cut-off (accomplishment report). This is the basis for billing. | boq | MVP | — |
| payables *new* | Supplier & subcontractor bills | Record bills, match them to PO and receipt, deduct withholding tax, approve, and record payment by check or bank. | procurement, tax-profile, approvals | MVP | — (bill OCR later) |
| cost-model | Cost control | Budget (from BOQ), committed (POs and subcontracts), actual (bills, later labour) and forecast per cost code, giving live margin and a GP-erosion alert. | boq, procurement, payables | MVP | — |
| payment-apps | Progress billing / payment applications | Work to date, less previous billings, retention, down-payment recoupment, liquidated damages and tax the payer withholds, gives net due. Works both ways: to the client and from subs. Tracks retention held and its release. | progress, contracts | MVP | — |
| invoicing | Sales invoices, collections, cashflow | Issue BIR-compliant invoices from approved billings: registered series, no gaps, VAT, zero-rated and exempt breakdown, cancel rather than delete. Also records collections and the cashflow curve. | payment-apps, tax-profile | MVP | — |
| withholding-tax *new* | Withholding tax & BIR certificates | Compute expanded withholding tax per payment by income type, issue the quarterly withholding certificate (BIR 2307) to each payee and build the payee list for the quarterly return. On receivables, log the certificates received from clients and any VAT withheld by government, to support the credit-claim summary. | payables, invoicing, tax-profile | MVP | — |
| schedule | Programme | Activities linked to BOQ items, with dependencies, Gantt, baseline vs actual, and planned vs actual S-curve and slippage. | boq | later | — |
| evm | Earned value | PV / EV / AC, CPI / SPI and forecast at completion. | cost-model, progress, schedule | later | — |
| risk | Risk register | Risks with probability, cost and time exposure, owner and a link to contingency. | projects | later | — |
| cvr | Cost-value reconciliation | Value earned vs cost incurred at the same cut-off per cost code, as a monthly margin report. | cost-model, payment-apps | later | — |

### Wave 4: Site & field
| slug | module | behaviour | depends on | MVP/later | heavy infra |
|---|---|---|---|---|---|
| site-diary | Daily site log | Weather, manpower, equipment, deliveries, delays, visitors and photos per day. Mobile-friendly. Serves as evidence for claims and slippage. | projects | MVP | — |
| punch-list | Punch list | Defects with location, photo and responsible party, closed out only after verification. | projects | MVP | — |
| hse | Safety | Construction safety programme, toolbox talks, incidents, observations, permits-to-work and safety-officer roster, plus the reports the regulator expects. | projects | MVP | — |
| permits *new* | Regulatory permits register | Building, fire-safety, electrical, DOLE and occupancy permits per project, each with owner, expected return, countdown, documents and escalation. Feeds a mobilisation-readiness gate. | projects, documents | MVP | — |
| handover *new* | Handover & closeout | Turnover package (as-builts, manuals, test certificates), certificate of completion at milestones, and the defects-liability period that gates final retention release and bond refund. | punch-list, documents, payment-apps | MVP | — |
| warranty *new* | Warranty service | Post-handover warranty tickets with acknowledge and schedule SLAs, tied to the defects period. | handover, tasks | MVP | — |
| quality | Inspections & NCRs | Inspection requests, hold points, checklists, and non-conformances with cause and corrective action. | projects | later | — |
| timesheets | Labour hours | Crew or person hours per day per cost code, feeding labour actuals. Not payroll. | site-diary, cost-db | later | — |
| equipment | Equipment & fleet | Owned and rented equipment, assignment, usage hours, maintenance and rental cost. | projects | later | — |
| inventory | Site inventory | Receive deliveries into site stock, issue to work, transfer, count, and report variance. | procurement | later | — |
| meetings | Meetings & minutes | Agenda, attendees and minutes, with actions sent to tasks. | projects, tasks | later | — |
| commissioning *new* | Testing & commissioning | MEP system test checklists and readiness scoring before turnover. | quality, handover | later | — |
| claims *new* | Delay & money claims | Build time-extension and cost claims from diary entries, RFIs, variations and schedule into one evidence pack. | variations, site-diary, schedule | later | — |

### Wave 5: Platform
| slug | module | behaviour | depends on | MVP/later | heavy infra |
|---|---|---|---|---|---|
| dashboards | Dashboards & reports | Portfolio and project views: pipeline, GP erosion, billing and collections, permits at risk, overdue items. Report export. | cost-model, crm | MVP | — |
| data-privacy *new* | Data-privacy operations | Data-subject request workflow (access, correction, deletion), personal-data inventory, and a breach log with the 72-hour notification clock. | rbac, audit-log | MVP | — |
| api-webhooks | API & webhooks | Public REST API and signed outgoing webhooks, SSRF-safe. | rbac | later | — |
| accounting-export *new* | Accounting integration | Export invoices, bills, payments and journals to the tenant's book of record (SAP, QuickBooks, Xero or CSV). The ERP does not keep statutory books. | invoicing, payables | later | — |
| client-portal | Client / partner portal | Read-scoped access for clients and subs to progress, billings and documents. | rbac, projects | later | — |
| i18n | Languages | English first. Add Filipino if adoption needs it. | — | later | — |

### Deferred: heavy infrastructure
| slug | module | behaviour | depends on | MVP/later | heavy infra |
|---|---|---|---|---|---|
| dxf-takeoff *split from cad-bim* | DXF scope extraction | Parse DXF layers, blocks, text and closed areas into draft, unpriced scope lines for estimator review. | documents, boq | later (promote candidate, see below) | CAD |
| pdf-takeoff | PDF takeoff | Measure lengths, areas and counts on PDF drawings and link them to BOQ items. | documents, boq | later | CAD (PDF render) |
| cad-bim | DWG / RVT / IFC ingest | Convert models, view them, and map elements to BOQ items. | documents, boq | later | CAD, BIM |
| clash | Clash detection | Find and triage geometric clashes across federated models. | cad-bim | later | BIM |
| point-cloud | Reality capture | Turn scans and photogrammetry into checked quantities. | cad-bim | later | BIM |
| carbon | Embodied carbon | Carbon per BOQ item from emission factors. | boq, cost-db | later | — (needs a licensed emission-factor dataset) |
| ai-estimate | AI estimate builder | Draft BOQ lines and suggest rates from history using semantic search. | cost-db, boq | later | ML |

**Count:** 63 rows. That is the 45 seed rows (one of them split) plus 18 new ones.

## Proposed BACKLOG changes

### Added (18)
| slug | wave | reason (contractor need; non-OCE source) |
|---|---|---|
| tax-profile | 0 | VAT, zero-rated and exempt treatment, and the withholding rate on every PH invoice, bill and payment depend on each party's registration. PRD names BIR 2303 and VAT zero-rated certification as "Philippine realities", and treats 12% VAT and 2% withholding as fixed behaviour (PRD A13). Sources: NIRC Sec. 108 and RR 2-98 ([S-ph1], [S-ph3]). |
| tasks | 0 | Actions from meetings, RFIs, inspections and approvals otherwise scatter. One owner/due-date list is cheaper than one list per module. |
| crm | 1 | The sell side was missing. A contractor's revenue starts as a lead, and PRD stage 1 runs from proposal and KYC to a signed BOM, then contract and NTP. The seed's `tendering` covers only the buy side. |
| conceptual-estimate | 1 | Bid/no-bid needs a rough value from area before drawings exist (PRD stage 1). Marked later. |
| proposal | 1 | The PRD's core problem is figures retyped from BOQ into the proposal. Generating the proposal from the BOQ removes one retype. |
| licences | 2 | Under RA 4566 a contractor may contract only within its PCAB category's allowed contract range, and a government bid beyond it is disallowed. PhilGEPS registration is mandatory for government work under RA 12009. Sources: [S-ph6]–[S-ph8], [S-ph13]. |
| subcontractors | 2 | PH builders sublet much of the scope. Prequalification needs licence and tax checks, and every sub payment carries withholding tax and a 2307 certificate. |
| bonds | 2 | PRD WO-16 tracks performance, surety and construction bonds "through to refund". Government contracts require advance-payment security and performance security ([S-ph4], [S-ph5]). |
| payables | 3 | Neither the seed's `procurement` (POs and deliveries) nor `invoicing` (receivables) covers paying suppliers and subs. Actual cost (PRD WO-17 "PO-invoiced") and withholding at payment both need it. |
| withholding-tax | 3 | A payor must withhold expanded withholding tax (contractors generally 2%), give each payee a BIR 2307 certificate, and file a quarterly payee list with the return. Payees need the 2307s they receive to claim the credit. Government buyers also withhold 5% VAT, which has been creditable since 2021. Sources: [S-ph2]–[S-ph3], [S-ph14]–[S-ph16]. |
| permits | 4 | The LGU building permit (45–60 days) is the schedule's critical path (PRD WO-16). PD 1096 requires a building permit, RA 9514 requires fire-safety clearance, and occupancy needs its own permit ([S-ph17], [S-ph18]). |
| handover | 4 | Final retention and bond refund are released only after completion and acceptance. PRD stage 4 covers the certificate of completion at 90% and 100%, punchlist close-out, occupancy permit and bond refund. |
| warranty | 4 | PRD stage 4 adds warranty tickets with 24-hour acknowledge and 48-hour schedule SLAs. Government contracts carry a warranty period (PRD O-10). |
| commissioning | 4 | MEP systems must pass testing and commissioning before turnover. Marked later. Note that PRD "CX" means customer experience, not commissioning. |
| claims | 4 | Liquidated damages accrue per day of delay (RA 9184 IRR sets at least 0.1% of the unperformed portion per day, and rescission at a 10% cap), so time-extension claims protect margin. Source: [S-ph4]. Marked later. |
| data-privacy | 5 | RA 10173 and NPC Circular 16-03 require handling of data-subject requests and breach notice to the NPC and affected people within 72 hours. The tenant holds employee and client personal data ([S-ph19], [S-ph20]). |
| accounting-export | 5 | SAP stays the statutory book of record (PRD A4), and the PRD says do not expand GL scope. The ERP should therefore feed the books, not replace them. Marked later. |
| dxf-takeoff | Deferred (split) | Split from `cad-bim`. A DXF worker is already deployed (ARCHITECTURE §1), and PRD WO-08a keeps CAD auto-draft running behind the validation gate. DWG, RVT and IFC stay deferred. **No dependency forces promotion**, so I left it deferred and flagged it for the orchestrator. |

### Modified seed rows (dependencies or notes; no wave moves)
| slug | change | reason |
|---|---|---|
| approvals | Add dependency `notifications`. Order it after notifications. | Escalation and approval-pending alerts need notifications. |
| contracts | Change dependencies from `tendering` to `boq, contacts`, with tendering only for subcontract awards. Add down payment, LD rate and cap, and defects period to the notes. | The head contract comes from the won proposal, not from buy-side tendering. PH contract terms carry down payment, retention, LD and warranty ([S-ph4], [S-ph9]). |
| procurement | Change dependencies from `contracts, approvals` to `boq, contacts, approvals`. | A supplier PO needs no contract record, while procuring from the BOQ needs the BOQ. PRD WO-15 commits POs against BOQ-derived budget lines. |
| variations | Add dependency `approvals`. | Client and internal sign-off (PRD stage 3: site instruction, priced proposal, client sign-off). |
| progress | Change dependencies from `schedule, boq` to `boq`. Order it first in Wave 3. Note the weekly cut-off. | PH progress billing measures accomplishment per BOQ item (PRD stage 3, weekly accomplishment report with a Thursday cut-off), so a programme is not required. This puts billing ahead of the scheduling work. |
| evm | Add dependency `schedule`. | Planned value needs a baseline programme. |
| cost-model | Add dependency `payables`. | Actual cost comes from bills (PRD WO-17). Labour actuals arrive later through `timesheets`. |
| payment-apps | Notes: default retention 10% per contract, down-payment recoupment, LD deduction, tax withheld by the payer, both directions (client and subcontractor), retention release ledger. | Government progress payments carry 10% retention and recoup the down payment (15% mobilisation is typical). CIAP Doc. 102 governs private contracts. Sources: [S-ph4], [S-ph5], [S-ph9]. |
| invoicing | Add dependency `tax-profile`. Notes: the invoice is the primary sales document, with registered series, required fields, no gaps and no deletion. Note BIR e-invoicing readiness. | RR 7-2024 under the EOPT Act made the invoice the main evidence of sale, with the official receipt now only supplementary. Required invoice contents are prescribed ([S-ph10]–[S-ph12]). |
| hse | Notes: construction safety programme approved by DOLE before work starts, safety-officer staffing, toolbox talks. | DOLE DO 13-98 and RA 11058 ([S-ph21], [S-ph22]). |
| boq | Notes: general requirements (preliminaries), version comparison. | Bid revisions are routine (PRD O-items). Site overheads must be priced. |
| boq-export | Notes: external takeoff import (Togal, Excel) lands as unpriced draft lines. | PRD ADR-08: takeoff tools are one input to a generic pipeline and never a dependency. This gives takeoff without `pdf-takeoff`. |
| tendering | Notes: supplier canvass / price comparison. | PRD WO-15 (BAFO, price comparison). |
| dashboards | Add dependency `crm`. | The executive dashboard leads with the pipeline (TCV, GP, weighted forecast). |
| cost-db | Notes: seed from the tenant's own unit-price analyses. Do not import CWICR (see licences). | Licence (below), and the dataset has no PH cost base. |
| cad-bim | Split out `dxf-takeoff`. | See the Added table. |

### Removed
None. Every seed row maps to a contractor need.

### Reordered
- **No wave moves.** I checked every new and existing dependency, and none points to a later wave.
- **Order changes within waves:**
  - Wave 0: `notifications` before `approvals`.
  - Wave 3: `progress` and `payables` before `cost-model`, and `schedule` after the money rows.
- **Soft cross-wave links, not blocking:**
  - `handover` (W4) gates final retention release in `payment-apps` (W3). Until it ships, retention is released manually.
  - Labour actuals in `cost-model` (W3) arrive with `timesheets` (W4).

### OCE families deliberately not mapped
- **Owner and operator workflows:** facility/asset operations, leasing, service charges, property development and worker accommodation. These are outside contractor delivery scope.
- **Offsite and fabrication tools:** prefab/DfMA tracking, rebar and cutting optimisation, formwork catalogues. No need for these in the target MEP and fit-out firms yet.
- **Payroll.** HR and payroll are a separate product line (root CLAUDE.md §17.3). `timesheets` stops at cost allocation.
- **Other countries' e-invoicing and regional packs.** The product is PH-only (PRD scope).
- **BIM-centric exchange standards and a CDE:** ISO 19650 containers, owner-data exchange, BCF and OpenCDE, a 3D globe. `documents` covers file control.
- **Planning and site extras:** pull planning, resource levelling, site logistics and gate booking, voice capture, sensors, ESG site metrics. No MVP pain identified; revisit on demand.
- **AI chat and agents, module builder, MCP server.** Covered by deferred `ai-estimate` / PRD Phase 4, or not a contractor need.
- **Folded into existing rows rather than added:**
  - crew rates, waste factors and price escalation into `cost-db` / `assemblies` (effective-dated rates);
  - resource consolidation into `procurement`;
  - correspondence logging into `documents`;
  - the compliance rules engine into `boq-validation`.

## Datasets and licences
| dataset / asset | what it is (paraphrased) | stated licence | use in our closed SaaS |
|---|---|---|---|
| CWICR cost database (repo `OpenConstructionEstimate-DDC-CWICR`) | Multilingual construction cost database of work items built from labour, material and machine resources, with about 85 fields per record. The repo README cites about 55.7k work items, 27.7k resources and 30 regional tracks. The website cites about 120k items across 9 bases. National bases include Russia, China, Indonesia, Vietnam, Greece, Italy, Spain, Turkey and Brazil. **No Philippines base.** | Data CC BY-NC 4.0 (non-commercial, attribution). Code Apache-2.0. DDC offers a separate commercial licence. Each national folder carries its own provenance and attribution file. | **Do not use.** Non-commercial terms exclude paid SaaS, and there is no PH base. Seed `cost-db` from tenant-owned unit-price analyses (the app already holds DUPA libraries, ARCHITECTURE §4). |
| OpenConstructionERP platform | The ERP itself. | AGPL-3.0. The README also offers a commercial licence that lifts AGPL obligations. | Clean-room only. The commercial-licence option is noted for the owner; it does not relax this survey's rules. |
| Other DDC repos (CAD converters, AI skill packs, sister SMB ERP) | Tooling. | Not stated on the org page. | Treat as unlicensed. Do not use. |
| Emission-factor data (needed by `carbon`) | — | None identified. | Blocker for `carbon`. Needs a licensed source before that row can start. |

## Sources

**OCE public material (descriptive only; no source files opened)**
- https://openconstructionerp.com (home page: module families, compare and recent releases)
- https://openconstructionerp.com/cases (playbook index)
- https://openconstructionerp.com/docs (docs: module system, regional packs, finance)
- https://github.com/datadrivenconstruction (org page, pinned repos)
- https://github.com/datadrivenconstruction/openconstructionerp (README)
- https://github.com/datadrivenconstruction/openconstructionerp/blob/main/docs/modules/README.md (modules docs index)
- https://github.com/datadrivenconstruction/openconstructionerp/releases (release notes v18.6.1–v19.0.0)
- https://github.com/datadrivenconstruction/OpenConstructionEstimate-DDC-CWICR (dataset README and licence statement; first 100k characters read)

**Philippine sources (non-OCE).** Most are secondary commentary. Verify against the primary BIR, GPPB, PCAB, DOLE and NPC text before encoding rates or deadlines in rules.

| id | topic | URL |
|---|---|---|
| S-ph1 | VAT 12% on services (NIRC Sec. 108) | https://batasnatin.com/doctrine/tax-VAT-on-services-Sec-108 |
| S-ph2 | BIR 2307 certificate | https://www.grantthornton.com.ph/globalassets/_markets_/phl/media/tax-alerts/bir-form-2307.pdf |
| S-ph3 | EWT RR 2-98, contractors 2% | https://batasnatin.com/laws/expanded-withholding-tax-bir-rr-2-98 · https://www.lawyer-philippines.com/articles/creditable-withholding-tax-guidelines-philippines |
| S-ph4 | RA 9184 IRR: retention, recoupment, LD | https://www.gppb.gov.ph/wp-content/uploads/2023/05/GPPB-Resolution-No.-02-2020.pdf · https://www.gppb.gov.ph/wp-content/uploads/2023/05/GPPB-Circular-No.-02-2003.pdf · https://www.gppb.gov.ph/?p=6831 |
| S-ph5 | Advance payment and security | https://bangsamoro.gov.ph/wp-content/uploads/2024/12/FORM-3-PROCUREMENT-OF-INFRASTRUCTURE-PROJECTS-COMPETITIVE-BIDDING.pdf · https://www.dpwh.gov.ph/DPWH/sites/default/files/issuances/DMC_43_s2020.pdf |
| S-ph6 | PCAB categories and ARCC | https://dpwh.gov.ph/DPWH/sites/default/files/issuances/DMC_027_s2018.pdf |
| S-ph7 | RA 4566 licensing | https://batasnatin.com/explainers/ra-4566-contractors-license-law-explained-rules-for-construction-licensing |
| S-ph8 | PCAB Category D limit | https://www.respicio.ph/commentaries/pcab-license-category-d-project-contract-limit |
| S-ph9 | CIAP Doc. 102 (private construction conditions) | https://construction.gov.ph/issuances/ciap-document-102-uniform-general-conditions-of-contract-for-private-construction/ · https://construction.gov.ph/publications/publications-ciap/ciap-document-102-2022-ed-uniform-general-conditions-of-contract-for-private-construction/ |
| S-ph10 | RR 7-2024 / EOPT invoicing | https://kpmg.com/ph/en/home/insights/2024/07/compliance-an-update-to-registration-procedures-and-invoicing-requirements.html |
| S-ph11 | RR 7-2024 clarification | https://www.grantthornton.com.ph/insights/articles-and-updates1/lets-talk-tax/clarification-for-compliance-with-invoicing-requirements-bir-rr-no-7-2024/ |
| S-ph12 | EOPT invoicing change | https://www.pwc.com/ph/en/tax/tax-publications/taxwise-or-otherwise/2024/compliance-change-on-invoicing-under-eopt.html |
| S-ph13 | RA 12009 New Government Procurement Act IRR, PhilGEPS | https://www.lawphil.net/statutes/repacts/ra2025/irr_12009_2025.html · https://www.gppb.gov.ph/category/related-news/page/9 |
| S-ph14 | QAP with 1601-EQ | https://www.grantthornton.com.ph/insights/articles-and-updates1/tax-notes/submitting-the-quarterly-alphabetical-list-of-payees-qap/ |
| S-ph15 | RR 11-2018 / TRAIN withholding | https://kpmg.com/ph/en/home/insights/2018/04/special-intax-lets-get-on-the-train-tax-alert-15.html |
| S-ph16 | Government 5% VAT withholding becomes creditable (2021) | https://kpmg.com/ph/en/home/insights/2021/01/the-final-bow-of-final-withholding-vat-on-government-money-payments.html |
| S-ph17 | PD 1096 building permit, RA 9514 FSEC | https://www.lawyer-philippines.com/articles/building-permit-clearance-requirements-in-the-philippines |
| S-ph18 | BFP plan approval for building permit | https://angono.gov.ph/bureau-fire-protection-approval-building-plans-compliance-ra-9514-securing-building-permit/ |
| S-ph19 | NPC breach notification, 72 hours | https://www.alburolaw.com/procedure-for-notifying-the-national-privacy-commission-in-case-of-data-privacy-breach/ |
| S-ph20 | Breach reporting timing | https://ndvlaw.com/when-must-philippine-companies-report-data-breaches/ |
| S-ph21 | DOLE DO 13-98 construction OSH | https://jur.ph/law/summary/guidelines-occupational-safety-health-construction |
| S-ph22 | DPWH DO 56 s2005 (safety officer) | https://dpwh.gov.ph/DPWH/sites/default/files/issuances/DO_056_S2005.pdf |

**Internal**
- `docs/PRD.md` v1.5 (stages, WO-08a, WO-15, WO-16, WO-17, ADR-08, A4, A13, O-10, O-13)
- `docs/erp/ARCHITECTURE.md`
- root `CLAUDE.md` (historical PRD; only §17.3 payroll exclusion is cited)

**Could not fetch or verify**
- The last ~16k characters of the CWICR README. The licence statement came from the first part.
- The full LICENSE-DATA and COMMERCIAL-LICENSE texts.
- Primary BIR, GPPB and PCAB texts. The PH rates and deadlines above come from secondary sources.
- The retention and progress-payment clauses inside CIAP Doc. 102. The search found the document pages but not the clause text.
