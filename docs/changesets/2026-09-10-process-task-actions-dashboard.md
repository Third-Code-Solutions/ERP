# Process task actions from Today

## Scope

- Added a capability-gated `Process work queue` entry to the Today command
  center for roles with `process.task.manage`.
- Preserved the existing `/tasks` links, counts, and legacy My Tasks surface.
- Kept the process queue as a separate destination at `/process`; no dashboard
  query, Core client, API, schema, or Process Health behavior changed.

## Verification

- Focused `TodayCommandCenter` component tests passed.
- Web lint passed for the changed component and test.
