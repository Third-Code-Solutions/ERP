# Sales calendar dates and lifecycle reporting

Agent 05 added a Manila calendar-date formatter and shared active, lead, won,
and lost stage groups covering canonical and legacy persisted values. These
contracts prevent UTC date drift and reporting omissions without rewriting data
or changing stage permissions.

Verification: shared reporting regressions PASSED (2/2). Existing Core stage and
conversion guard/service suites PASSED (101/101). The Web integration is handed
to Agents 03/09/11 in the Sales readiness handoff.

No schema, dependency, stored date, or authorization policy changed.
