# Unified dashboard design

User request: restyle Platform Control, company executive dashboard and My Work using the supplied Cloudflare dashboard reference, including the light sidebar.

1. Agent 02 / main: shared neutral design tokens, sidebar and shell styling. Preserve existing actions, visible role navigation, authentication and data boundaries.
2. Agent 09 / dashboard subtask: compact dashboard headers and light Today panels within dashboard components and dashboard page only. Own module CSS; do not edit globals or navigation.
3. Agent 03 / main: platform layout and navigation adopt the same visual structure; local navigation search and responsive behavior.
4. Main integration: focused tests, types, browser verification at desktop/mobile and changeset. No database mutations or authorization changes.

Separate file ownership permits independent implementation; integration is sequential. The screenshot controls the design direction where optional skill aesthetics differ.
