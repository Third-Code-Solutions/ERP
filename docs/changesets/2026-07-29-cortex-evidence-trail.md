# Cortex evidence trail

## Outcome

Cortex record context now shows a bounded, human-readable trail explaining
when and how graph evidence was recorded.

## Security and compatibility

- Existing authentication, tenant, source/type ownership, and current-role
  checks run before provenance retrieval.
- Server returns at most six normalized events.
- Browser receives only safe kind, label, explanation, and ISO timestamp.
- Actor ID, internal reference, hashes, sequence, tenant ID, and subject ID
  remain server-only.
- Unknown origins fail safely; malformed timestamps are omitted.
- Existing entity-response fields remain compatible.
- No schema, hosted row, Auth, Storage, queue, backend, or provider change.

## Interface

- Native collapsed disclosure; no custom state dependency.
- Mutation, document, AI analysis, and import events use clear original copy.
- UTC timestamps preserve deterministic meaning across offices.
- Disclosure target is 44px with visible keyboard focus.
- Timeline remains one column at desktop, tablet, and mobile.
- Reduced-motion users receive no indicator transition.

## Validation

- Focused tests: 17/17 pass.
- Root lint and typecheck: pass.
- Root tests: 350 pass; 132 writable-database-gated checks skip.
- API and Web production builds: pass.
- Web static generation: 77/77.
- Hosted aggregate evidence coverage: 385/385 current nodes.
- Local unauthenticated entity API: expected 401.
- Browser 1440/768/390: disclosure works, 44px target, visible focus, readable
  timeline, no overflow.

## Rollback

Revert the evidence projection, route retrieval bound, disclosure component/
style, tests, spec, and documentation together. Existing Cortex summary,
relationships, and citations remain functional. No data or provider rollback
is required. If later deployed, promote the retained last-known-good Vercel
artifact.
