# Release-control recovery checkpoint

## Scope

Documentation-only recovery control after discovering unrelated local and
`origin/main` histories, blocked GitHub Actions billing, missing current
read-only Supabase parity evidence, and unresolved ABI fractional-quantity/DUPA
policy inputs.

## Verified facts

- Local `HEAD` and `origin/main` have no common ancestor.
- The last observed production Vercel deployment is `dpl_piz7EeuK` from
  2026-08-23.
- PR #13 security gates are blocked by GitHub Actions billing.

## Recovery decision

The controlled order is: fresh `origin/main` clone plus clean cherry-pick port;
restore GitHub Actions billing and rerun unchanged security gates; obtain a
valid read-only Supabase credential and parity report; then obtain ABI inputs
and an accepted ADR before fractional-quantity/DUPA implementation. No force
push, deployment, provider mutation, or security-gate bypass is authorized.
