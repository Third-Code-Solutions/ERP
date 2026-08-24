# Public workbook confidentiality blocker

- Date: 2026-08-24
- Finding: AUD-007
- Severity/status: P0 / Critical active confidentiality risk — BLOCKED
- Owner: project owner and DPO, with Security/DevSecOps review

## Verified evidence

- `gh repo view Third-Code-Solutions/ERP --json nameWithOwner,url,visibility,isPrivate,defaultBranchRef`
  returned `visibility: PUBLIC`, `isPrivate: false`, default branch `main`, at
  <https://github.com/Third-Code-Solutions/ERP>.
- Git tracks root files `source_data.xlsx` (blob
  `679f497f7a6d8510b971a6f4c3a24d447039519c`) and
  `executive-dashboard.xlsx` (blob
  `7a42db0c40328931510c7148d643b16571823eb1`), plus generator
  `build_dashboard.py` (blob
  `59b8ab52a36a3e65f93e1b65aec0518dc2d40140`).
- All three first appear in commit
  `38af6cdc88fbddaa70e7f06b374e843b4ed37f92` (`chore: preserve existing files
  before BuildOps monorepo scaffold`).
- Read-only workbook inspection recorded aggregate evidence only: six sales
  source sheets, 108 populated business rows, 85 distinct hashed account
  identifiers, 66 remarks cells, and commercial TCV/GP fields. No row value,
  account name, rep name, remark, or credential is reproduced here. See
  `docs/audit/FULL_REPOSITORY_AUDIT.md` AUD-007.

Because the repository is public, removing the current files alone does not
remove them from reachable Git history or existing clones/caches. Classification,
retention, notification, and repository mutations require owner/DPO authority.
The audit branch must not be pushed while this decision is open.

## Three separately authorized actions required

1. **Visibility containment.** The repository owner must separately authorize
   changing `Third-Code-Solutions/ERP` from public to private and name the
   approved organization/team access list. Verify visibility and anonymous
   denial afterward. This contains future access but cannot recall prior copies.
2. **Current-file quarantine.** The owner and DPO must separately classify the
   two workbooks, authorize removal from the current tree, choose a restricted
   evidence/retention location, and approve any synthetic replacements. The
   exact targets are the two workbook paths above; no unrelated file may be
   removed by implication.
3. **Coordinated history response.** After containment and quarantine, the
   owner and DPO must make a separate explicit decision on a coordinated Git
   history rewrite. Approval must cover all branches/tags, protected backup,
   collaborator notification and re-clone, force-push window, cache/fork review,
   and post-rewrite blob/reference scans. Rewriting cannot guarantee recall of
   existing clones, so the DPO must also decide whether notification or incident
   handling is required.

No provider setting, file, reference, or history was changed while writing this
brief.
