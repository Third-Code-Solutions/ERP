# ADR-009: Clean-room enterprise capability expansion

- Status: Accepted
- Date: 2026-07-27
- Owners: Third Code Solutions Inc.
- Scope: Third Code ERP domain expansion

## Context

Third Code ERP already models a construction delivery spine: pipeline, proposals,
projects, drawings, scope, BOM, procurement, site execution, claims, billing,
turnover, warranty, portals, and an early knowledge graph.

The product must grow into a multi-business ERP without importing third-party
source code, schemas, assets, copy, styles, or implementation structure. A broad
module-by-module clone would also expose users to the same complexity the product
is intended to remove.

## Decision

Build independently authored vertical slices from public business behavior and
Third Code customer discovery.

Each slice must:

1. Define the user outcome, actors, states, invariants, and accounting effects.
2. Use Third Code terminology, information architecture, data models, and code.
3. Preserve a provenance record for requirements and authored implementation.
4. Enter through a role-specific Today view, Project Command Center, or universal
   search/ask/create surface.
5. Keep high-impact AI actions in preview until an authorized person approves.
6. Ship with tenant-negative, permission-negative, reversal, concurrency, audit,
   and reconciliation tests where applicable.
7. Pass source, asset, dependency, license, and visible-brand release scans.

Internal workspace package names may remain migration aliases while public copy,
metadata, email, print, portal, and navigation surfaces use Third Code ERP.

## Consequences

- Functional parity is measured by business invariants and reconciled outcomes,
  not route count or screen similarity.
- Accounting, inventory, and transaction reversal foundations precede optional
  breadth such as manufacturing and asset lifecycle.
- Clean-room research stays separate from product implementation artifacts.
- A legal/license review remains a release gate for any questioned provenance.

## Rejected alternatives

- Source port with renamed symbols: provenance and license risk.
- Visual clone: preserves complexity and creates brand confusion.
- Big-bang module catalog: high delivery risk and weak user validation.
- AI write access before authorization and audit controls: unacceptable blast
  radius for financial and operational records.
