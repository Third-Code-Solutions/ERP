# ERP module backlog

Seeded from OpenConstructionERP's public module map (v19, Nov 2026), ordered by dependency for a contractor-focused MVP. `oce-recon` (survey) refines rows; `erp-domain-expert` (gap) sets statuses against the existing app.

Status: `todo` · `exists` · `partial` · `in-progress` · `done` · `defer`

## Wave 0 — Foundation (everything depends on this)
| Slug | Module | Depends on | Status | Notes |
|---|---|---|---|---|
| tenancy | Organisations / tenants, tenant settings (currency, tax rate, calendar) | — | todo | Isolation model decided at init |
| rbac | Users, invites, roles & permissions, SSO later | tenancy | todo | Permission function every handler calls |
| audit-log | Immutable audit trail for financial actions | tenancy | todo | |
| approvals | Approval routes engine (multi-step, delegation, escalation) | rbac, audit-log | todo | Reused by BOQ, PO, variations, invoices |
| contacts | Contacts directory (clients, subcontractors, suppliers) | tenancy | todo | |
| projects | Projects & portfolio | tenancy, contacts | todo | |
| documents | Document store with revisions, private storage, signed URLs | projects | todo | |
| notifications | In-app + email notifications | rbac | todo | |

## Wave 1 — Estimate
| Slug | Module | Depends on | Status | Notes |
|---|---|---|---|---|
| cost-db | Cost database: labour, material, equipment, subcontract rates | tenancy | todo | Own data only; do not import CWICR without a licence check |
| assemblies | Assemblies / composite rates built from resources, waste factors | cost-db | todo | |
| boq | Bill of quantities: sections, items, quantities, rates, markups, allowances, provisional sums, revisions | projects, assemblies, approvals | todo | Core of the ERP |
| boq-validation | Validation rules (missing rates, zero qty, outliers) with traffic-light report | boq | todo | |
| boq-export | Excel/CSV/PDF export and Excel import | boq | todo | Guard CSV formula injection |

## Wave 2 — Commercial
| Slug | Module | Depends on | Status | Notes |
|---|---|---|---|---|
| tendering | RFQ packages from BOQ, invite subcontractors, bid comparison, award | boq, contacts | todo | |
| contracts | Contracts & awards, contract sum, retention terms | tendering | todo | |
| procurement | Purchase requests, POs, approvals, deliveries | contracts, approvals | todo | |
| variations | Variations / change orders: scope + cost + time impact | contracts, boq | todo | |
| rfi | Requests for information, due dates, cost-bearing answers → variation | projects | todo | |
| submittals | Submittals & transmittals | documents | todo | |

## Wave 3 — Controls & money
| Slug | Module | Depends on | Status | Notes |
|---|---|---|---|---|
| schedule | 4D programme: activities linked to BOQ items, Gantt, dependencies | boq | todo | |
| cost-model | 5D cost: budget, committed, actual, forecast per cost head | boq, procurement | todo | |
| progress | Progress tracking / measurement to date | schedule, boq | todo | |
| evm | Earned value: PV/EV/AC, CPI/SPI, EAC/ETC/VAC/TCPI | cost-model, progress | todo | |
| risk | Risk register with priced exposures → contingency | projects | todo | |
| payment-apps | Interim payment applications: work to date, retention, advance recoupment | progress, contracts | todo | |
| invoicing | Invoices, payments, cashflow curve | payment-apps | todo | |
| cvr | Cost-value reconciliation per cost head | cost-model, payment-apps | todo | |

## Wave 4 — Site & field
| Slug | Module | Depends on | Status | Notes |
|---|---|---|---|---|
| site-diary | Daily site diary (weather, labour, plant, events, photos) | projects | todo | Mobile-friendly |
| timesheets | Labour hours / crews | site-diary, cost-db | todo | |
| equipment | Equipment & fleet | projects | todo | |
| inventory | Site inventory & deliveries | procurement | todo | |
| punch-list | Punch list / snags with photo evidence | projects | todo | |
| quality | Inspections, checklists, NCRs | projects | todo | |
| hse | Safety incidents, toolbox talks, observations | projects | todo | |
| meetings | Meetings & minutes, actions | projects | todo | |

## Wave 5 — Platform
| Slug | Module | Depends on | Status | Notes |
|---|---|---|---|---|
| dashboards | Project & portfolio dashboards, report exports | cost-model | todo | |
| api-webhooks | Public REST API + HMAC-signed outgoing webhooks | rbac | todo | SSRF-safe |
| i18n | Interface languages (EN, Filipino first) | — | todo | |
| client-portal | Client/partner portal (read-scoped) | rbac, projects | todo | |

## Deferred — heavy infrastructure (revisit after MVP revenue)
| Slug | Module | Why deferred |
|---|---|---|
| pdf-takeoff | Quantity takeoff on PDF drawings | PDF rendering + measurement UI |
| cad-bim | DWG/RVT/IFC ingest, BIM viewer, element → BOQ | Converter pipeline |
| clash | Clash detection & triage | BIM dependency |
| point-cloud | Reality capture | Heavy infra |
| carbon | Embodied carbon / LCA | Needs emission-factor datasets |
| ai-estimate | AI estimate builder, semantic cost search | Needs cost data + embeddings |

## Changes
(oce-recon logs ordering changes here)
