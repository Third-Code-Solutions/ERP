# M3.46 — Command palette accessibility and race safety

Added wrapped keyboard navigation and pure helper coverage to the universal
Search/Ask Cortex palette. Moved combobox semantics to the input, labelled the
result list, exposed active option IDs, and announced loading/empty/failure
states. Superseded debounced requests can no longer overwrite newer results.

Source checkpoint: `e3dc6d6`. Validation: focused navigation/selection tests
7/7, Web suite 66 files/450 tests, workspace lint/typecheck, `git diff --check`,
and the 79/79-route production build pass. Authenticated browser proof remains
open when local Supabase DNS cannot resolve.

No hosted SQL, data, Storage, Railway setting/deployment, or Vercel build was
changed. Vercel remains disconnected and spend-protected; Supabase remains at
its blocked 55/87 migration boundary.
