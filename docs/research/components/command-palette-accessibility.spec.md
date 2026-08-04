# Command Palette Accessibility and Search Consistency

## Outcome

Give every signed-in user one predictable, keyboard-first entry point for
finding tenant-authorized records or handing a question to Cortex. The palette
must never present a stale result as the answer to a newer query.

## Contract

- The input is the only `combobox`; it owns the stable result-list relationship
  and active descendant.
- Search and Cortex actions are `option` elements in a labelled `listbox`.
- Arrow keys wrap across the currently actionable options. Enter opens the
  active option; Escape closes the dialog.
- Debounced searches clear the previous result set and ignore late responses
  from an aborted or superseded request.
- Loading, empty, and failure states are announced without exposing a browser
  write or a new authorization path.

## Evidence

Pure navigation behavior is covered by
`apps/web/src/components/nav/command-palette-navigation.test.ts`; existing
selection behavior remains covered by its companion test. Web typecheck and
the full Web suite are required before source push. Authenticated desktop and
mobile browser proof remains a provider-runtime gate when Supabase DNS is not
available locally.

## Boundaries

This is a presentation-only change. It adds no tables, migrations, API
authority, Storage object, Railway setting, or Vercel deployment. Search
results remain subject to the existing server-side tenant and permission
policy; Cortex remains advisory/navigation-only until an explicit authority
route is invoked.
