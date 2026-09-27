# Inspection draft revision stability

- Loading a saved inspection in another browser tab no longer writes the unchanged draft and advances its IndexedDB revision.
- Debounced autosave now runs only for edits that have not already been saved; successful manual saves record that edit version too. Clearing a submitted report resets the edit marker.
- Reproduced the stale-tab conflict from CI locally before the fix. The focused case and all 19 inspection-draft browser tests pass with zero retries after the fix.
- Production role-matrix browser errors now include the active route, so an intermittent hydration failure can be traced to the rendered page without weakening the console-error gate.
