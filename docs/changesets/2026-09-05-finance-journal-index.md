# Finance journal collection route

## Evidence and scope

The complete production route audit on `5c38986cd1a7` covered 131 page templates
and 35 HTTP handlers. Two journal pages failed its navigation/console gate.
An isolated authenticated read confirmed both pages returned HTTP200 and rendered
their expected headings, but their shared breadcrumb prefetched the absent
`/finance/journals` collection and received HTTP404. The network-idle timeout
remains separately subject to browser replay; HTTP200 alone was not treated as
an audit pass.

## Change

Add the missing collection route, enforce authenticated `finance.read` access,
and redirect to the existing journal list at `/finance`. Reuse Finance loading
and error boundaries. Register the route with the existing Finance read-role
policy and extend the independent per-route, 13-role authorization inventory.
No new dependency, accounting mutation, migration, credential, or provider cost.

## Verification and rollback

The new route regression first failed because the route module did not exist.
Tests cover the canonical destination, denied capability, and missing session.
Full CI, production promotion and live browser replay must pass before calling
this follow-up verified in production. Preserve the original failed audit.

Rollback through the production provider's previous verified artifact; this is
schema-compatible. Reverting this change restores the known breadcrumb404.
