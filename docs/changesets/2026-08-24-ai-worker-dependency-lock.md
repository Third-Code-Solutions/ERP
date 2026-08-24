# AI worker dependency lock

## Scope

- constrained the AI worker to the repository-authoritative Python 3.12 runtime;
- added a deterministic `uv.lock` plus hashed runtime and development exports;
- documented frozen local test and launch commands.

## Verification

- `uv lock --check` — PASSED with CPython 3.12.10;
- `uv run --frozen --extra dev pytest -q` — PASSED, 8 tests;
- both requirements exports were generated from the frozen lock and retain
  package hashes.

## Deployment

No image, provider, Railway service, or production environment was changed.
Docker digest pinning and locked image installation remain a separate Agent 13
release slice.
