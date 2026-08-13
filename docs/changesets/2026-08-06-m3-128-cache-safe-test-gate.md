# M3.128 - Cache-safe runtime test gate

## Scope

- include database/Redis/integration environment inputs in Turbo's `test` cache
  key
- add a verifier and regression contract for the cache configuration
- run the verifier in CI before the test task

## Validation

- filtered Turbo database task: cache miss, 51/51 files, 324/324 tests,
  zero skips
- typecheck, lint, production build, migration verifier, Gitleaks, Actionlint,
  controlled-release, spend guard: pass
- no hosted SQL, provider setting, deployment, flag, or tenant-data write

## Rollback

Revert `turbo.json`, `package.json`, `.github/workflows/ci.yml`, and the two
cache-contract scripts. No hosted rollback is required.
