# Next Actions

## Exact next action

Complete remaining M1 controls without enabling production writes:

1. Disable Vercel Git auto-deploy before the next Git push. Keep the current
   READY production deployment online. Future Vercel releases are one explicit
   manual deployment after green CI; do not create a duplicate preview.
2. Publish the already validated LF/Gitleaks/Vercel guard in one source push.
   Prove that push creates zero Vercel deployments, then rerun
   `.github/workflows/ci-self-hosted.yml` on the exact SHA. Attach the GitHub
   run ID and confirm the transient runner deregistered.
3. Keep deployed tenant-canary source at
   `ERP_PROJECT_WRITES_VIA_API=false`; leave the tenant allowlist empty until
   clean self-hosted GitHub workflow evidence is attached.
4. After clean CI, perform the provider-level enable/rollback drill for a
   controlled tenant:
   capture provider configuration, enable exact `true`, prove one compatible
   Web-to-Nest demo command and reconciliation, restore exact `false`, and
   prove the legacy branch is selected.
5. Record provider release IDs, runtime logs, final data reconciliation, and
   the tested rollback procedure before starting M2.

## Following milestone

M2: remove the Python `scope_items` direct-write path. Python returns immutable
processing evidence; BullMQ transports it; a new Nest command authorizes,
idempotently validates, and commits accepted changes.

## Do not start yet

- No finance migration before M1 integration evidence.
- No broad Server Action replacement.
- No production feature-flag enablement.
- No new microservices.
- No external ERP source, schema, UI, or wording reuse.
