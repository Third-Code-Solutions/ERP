# ADR-034: Reviewed MS Project XML task import

- Status: Accepted for the bounded implementation below
- Date: 2026-09-14
- Scope owner: Product/PRD Guardian, with API and schema review

## Context

The approved roadmap includes MS Project import. Existing normalized schedule
tasks already support L1–L4 hierarchy and the `ms_project` source, while the
September 10 handoffs defer company-specific mappings pending PRD O-04/O-09.
Neither XML outline depth nor a resource name establishes ABI's schedule policy
or accountable ERP owner. Those questions remain open.

## Decision

Add **MS Project XML → reviewed schedule tasks** as a bounded planning import.
This amends the blanket technical deferral in the September 10 handoffs, not the
unresolved company policies. Existing manual and legacy L1 flows remain intact.

- Accept exported XML, not native `.mpp`. Parse the documented Project namespace
  and task identity, outline hierarchy, names, calendar dates and predecessor
  evidence. Do not claim complete MSPDI/XSD validation or round-trip fidelity.
- Preview performs no database writes. Show source UID, outline depth/path,
  dates and relationship evidence. Require explicit reviewed mapping into the
  existing L1–L4 register before committing; never present XML depth as an ABI
  mandated level. Owner is unassigned unless the user explicitly selects an
  eligible same-tenant owner.
- Import planning fields only. Imported tasks start planned, with no invented
  actuals, weekly commitments, resource assignments, cost or labour minutes.
  Preview and confirmation disclose that operational/progress/resource/calendar
  data are not imported. Do not convert elapsed duration into labour or sum
  summary work into actuals. Existing labour reconciliation remains independent.
- Preserve source calendar-date portions without timezone shifts; validate full
  source date/time syntax and real calendar dates. Explain that sub-day scheduling
  and calendars are outside the current register's resolution.
- Reject invalid/duplicate identities, invalid hierarchy, cycles, unsupported
  depth mappings, multiple predecessors, non-finish-to-start or lagged links,
  external links, and relationships the current same-level predecessor model
  cannot represent. No silent flattening, truncation or approximate dependency.
- Initial limits: 1 MiB decoded UTF-8 source, 500 tasks, XML depth 64, bounded
  fields/element count. Reject binary, DTD/entity declarations and all parser
  errors/warnings. No network resolution, model calls or raw XML in logs/audit.

## Dependency

Declare `@xmldom/xmldom` **0.8.15** as a direct API dependency (MIT, Node runtime
compatible). It is already pinned in the workspace's security-remediated graph;
do not reach through Mammoth's transitive dependencies or change the workspace
override. Configure fail-closed parsing and apply explicit bounds/namespace and
business validation; a DOM parser is not an MSPDI semantic validator.

Rejected: copying a third-party importer/schema, parsing XML with regular
expressions, using an undeclared transitive package, or introducing the archived
`saxes` package as a new production dependency. A newer XML parser line would
require separately tested dependency changes rather than a silent global bump.

## Atomic receipt and recovery

The commit carries the exact source bytes/hash, parser version, reviewed mapping
and stable request UUID. Core re-parses and validates the authoritative command;
client preview rows are never trusted as the source of truth. Acquire current
actor/tenant admission and project locks, then check an actor-bound receipt,
validate and insert all tasks topologically, and append a semantic receipt in
one transaction. Preserve existing tenant/RLS/audit rules and scope every query.

Use existing task source, client request IDs and request hashes. Store the bounded
UID-to-task-ID mapping, original versions, mapping choices and source hash in the
append-only semantic audit receipt. Retry returns that original receipt even
after tasks are edited. A hash establishes identity, not file retention. This
one-shot append-only import does not synchronize, replace or merge existing tasks.
No schema migration is needed for this bounded contract.

The UI freezes an unconfirmed command for exact retry, fences actor/project
lifetimes and separates committed success from refresh warnings. Unsupported
source data produce an actionable preview error, not a partial silent import.

Persistent original downloads, indexed import history, re-import synchronization,
richer dependencies/calendars or resumable batches require a separate design.
O-04 template fidelity and O-09 official L2/L3 ownership/approval remain open.

## Verification gates

Parser malformed XML/XXE/bounds/namespace/date/identity cases; preview purity;
actual-Postgres atomic rollback, tenant denial, current lifecycle/role admission,
exact replay after edits and changed-command rejection; mounted browser preview,
explicit mapping, confirmation, uncertainty retry, scope change and mobile states;
normal types/lint/build/security/CI gates. Production recovery gates are unchanged.

## Sources

- [Microsoft Project XML reference](https://learn.microsoft.com/en-us/office-project/xml-data-interchange/introduction-to-project-xml-data?view=project-client-2016)
- [Microsoft Project 2007 namespace reference](https://learn.microsoft.com/en-us/previous-versions/office/developer/office-2007/bb968695(v=office.12))
- [xmldom documentation and license](https://github.com/xmldom/xmldom)
- `docs/PRD.md` O-04/O-09 and post-MVP schedule requirement
- `docs/adrs/ADR-026-deterministic-document-intake-and-tenant-cache.md`
