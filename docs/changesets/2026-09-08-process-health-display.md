# Process Health display correction

- Fix missing inner spacing in summary/loading cards and the update footer.
- Replace the unsupported missing-seed diagnosis with a truthful empty state and
  links to My Tasks and Projects; omit zero KPI tiles and escalation policy when
  no workflow activity is available.
- Keep actual populated BU metrics and failure/retry states distinct. Label the
  update time in Philippine time and use readable text contrast.
- No database, API, authorization or workflow-definition changes.

Verification: 1,838 Web tests passed; two database-dependent integration tests
were skipped by their existing environment guards. The 12 route QA tests cover
API failure, empty activity, populated BU totals and escalation messaging. Web
TypeScript and focused route lint checks passed. Manual browser testing against
local Next/Core/Postgres verified the empty state at desktop and 390px width,
with no page overflow, and both links reached their actual destination pages.

The full SD Framework catalog remains dependent on its approved source, as
documented in the existing source-boundary blocker. No workflow data was added
to production. Deployment is tracked separately in the release workflow.
