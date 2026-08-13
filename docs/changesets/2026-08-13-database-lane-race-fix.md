# Database lane shutdown race fix

Date: 2026-08-13

## Scope

- Made local Redis shutdown cleanup tolerant of the expected connection-close
  race when restarting the isolated WSL database lane.
- Updated signup provisioning runtime evidence to use the current neutral demo
  tenant identity.

## Verification

- PASS — isolated WSL database lane: 61 migrations, PostgreSQL 17, Redis 7.4.9.
- PASS — database tests: 242/242 with zero skips.
- PASS — API database integration tests: 3/3.
- PASS — schema hash unchanged before and after the lane.
- PASS — local PostgreSQL and Redis stopped cleanly after the run.
