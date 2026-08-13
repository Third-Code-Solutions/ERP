# Cortex search accessibility and keyboard navigation

## Purpose

Make the Cortex knowledge-graph search usable without a pointer while keeping
the search path read-only, tenant-authorized, and quiet under rapid typing.
The graph remains an inspection and navigation surface; selecting a result
never approves, edits, or finalizes an ERP record.

## Behavior contract

- Search remains debounced and server-backed; terms shorter than two
  characters do not issue a request.
- `ArrowDown` and `ArrowUp` wrap through actionable results and skip results
  that have no authorized destination.
- `Enter` opens the highlighted result, or the first actionable result when no
  result is highlighted. `Escape` closes the result list without changing the
  query text.
- The input exposes `aria-controls`, `aria-expanded`, and
  `aria-activedescendant`; the list exposes a stable listbox id and each result
  exposes `aria-selected`.
- Loading, empty, and failed retrieval states are announced through status or
  alert regions. An empty result cannot look like a silently broken search.
- A new term clears the prior result set before the debounce window, so stale
  records cannot be opened after the user changes the query.

## Safety and acceptance evidence

- The component only calls the existing tenant/RBAC-gated
  `/api/cortex/search` read route.
- Pure navigation tests cover first selection, wrapping, unavailable-result
  skipping, and empty actionable sets.
- Web full tests, workspace lint/typecheck, diff check, and production build
  must remain green.
- A real browser must verify the authenticated Cortex page at desktop and
  mobile widths, zero new console errors, and no horizontal overflow. In this
  milestone the local authenticated replay reached the route but was blocked
  by the configured Supabase host failing DNS inside the Next Edge runtime;
  that provider-runtime gate remains open and is not represented as a pass.

## Release boundary

This slice changes only the Next.js Cortex presentation/client state and a
pure helper. It does not apply Supabase SQL, alter hosted data or Storage,
change migration history, mutate Railway variables, or trigger Vercel.
