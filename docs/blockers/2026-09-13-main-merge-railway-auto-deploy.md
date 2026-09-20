# Main merge would bypass the production release hold

Status: production deployment authorized; database recovery evidence remains
unverified. No provider change made. Routine permission is not the blocker.

Read-only Railway API evidence on 2026-09-13:

- Project: `a21fd382-80b2-4218-8025-11f420a062e3`.
- Production environment: `ce3a09da-9334-4256-a0a6-85d69676cb89`.
- API service: `c45b3d01-036a-4663-a524-0713d782fce3`.
- Deployment trigger: `8b297e97-8c43-4ee9-a38e-ee7ff0156ae9`, GitHub
  `Third-Code-Solutions/ERP`, branch `main`, `checkSuites=false`.
- CAD service query returned no deployment triggers. Vercel repository config
  keeps `git.deploymentEnabled=false`; production GitHub workflow is manual.

All PR heads #67 through #80 are ancestors of #80's tested head
`4dd500f7acf9b4691455df35746801474a7fdadd`. These are an overlapping stack,
not fourteen independent final integrations. PR #80's CI run `34712761703`
passed all jobs. Its downloaded API/database/Web/browser reports passed
no-skips assertions and the schema diff was empty. Supabase Preview was
cancelled because concurrent branch capacity was exhausted.

Code verification and production authorization are distinct. The stack includes
API and migration-dependent changes, so merging to `main` while this trigger is
connected can deploy production before database/Storage recovery evidence and
hosted migration preflight are complete. A healthy current `/ready` is not proof
that the pending source and schema are safe to deploy.

The owner subsequently authorized pushing and deploying every verified PR and
asked that routine permission requests stop. That authorizes release execution,
but does not supply the database release runbook's required recovery evidence.
The current ledger is 169/173. Four claim/KYC/WAR migrations remain pending;
physical backup/PITR, separate Storage recovery and a restored rehearsal have not
been verified. Available PostgreSQL 17 tools and protected credential names are
not evidence of recoverability. Do not merge into the watched branch or apply
those migrations until the technical release gates pass. No further conversational
approval is needed for the already authorized release once those gates pass.

The two inspection-photo safety commits following #80 are locally verified and
published on `codex/inspection-photo-evidence`; their final-head CI is separate.
Once the merge/deployment coupling is resolved, prefer an ancestry-preserving
merge of the verified combined head, then reconcile superseded PR metadata.
Do not squash away the stack and misrepresent its older PRs as separately merged.
