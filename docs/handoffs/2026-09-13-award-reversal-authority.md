# WO-13 authenticated award and reversal admission

PRD WO-13 requires an atomic, reversible signed-BOM handoff. Inspection found that
the mounted reversal action checks a stale profile outside the transaction and
does not lock the handoff. Concurrent reversals can overwrite reason/actor evidence.

1. Main Agent01 records scope; Luna verification lane reproduces current behavior
   through the real mounted action against synthetic PostgreSQL. Own new action
   integration tests only, no application changes.
2. Main Agent03 fixes the existing authenticated action authority and serialization:
   active current user/capability/tenant locks; existing award advisory identity;
   locked scoped handoff; one state transition and semantic audit. The public
   signing helper's nullable actor contract remains unchanged.
3. Luna BOM UI lane owns award-automation-panel.tsx and new focused component/browser
   tests. Pending/unknown/committed outcomes must be truthful and duplicate submission
   prevented. Preserve existing handoff and reversal paths and design tokens.
4. Astra independently reviews transaction order, current authority and integrity.
5. Main Agent13 integrates test gates, checks and changeset, then pushes the PR.

No schema, dependency or public-signing policy change. Separate lanes do not edit
the same files. Production recovery remains required. A separate operational update
staged the verified existing Storage credential on Core with --skip-deploys; no
deployment was triggered and no credential is recorded in repository artifacts.
