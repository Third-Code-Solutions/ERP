# Self-hosted CI Auth-lane repair handoff

## Scope

Documentation-only cross-agent handoff for the database-test topology failure
in self-hosted run `33075859440`.

## Decision

The raw PostgreSQL reproducibility/RLS lane remains a required gate. The real
Supabase Auth Admin API invitation suite becomes a separate required disposable
local-Supabase lane with zero skips, mandatory cleanup, and an independent
security review. No production, provider, billing, or deployment action is
authorized by this documentation change.

## Ownership sequence

Agent 04 defines the database test/bootstrap contract, then Agent 13 wires the
required self-hosted workflow and cleanup, then Agent 12 reviews the bounded
local security surface.
