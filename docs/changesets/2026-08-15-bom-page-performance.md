# BOM page performance hardening

## Changed

- Parallelized independent BOM, review, vendor, division, DUPA, price-history,
  assembly, and catalog reads on the server route.
- Avoided loading assembly templates and catalogs when a project has no BOM.
- Preserved tenant predicates, ordering, pricing provenance, and empty states.

## Verification

- PASS — web TypeScript typecheck, including all E2E TypeScript projects.
- NOT RUN — hosted browser timing until this branch is deployed behind a
  passing production data-boundary gate.
