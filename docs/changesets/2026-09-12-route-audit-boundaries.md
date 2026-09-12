# Changeset: route audit boundary classification

## Change

- Treat the intentional `/finance/journals` → `/finance` collection redirect as a verified canonical navigation.
- Treat authenticated `401`/`403` responses as access-control evidence before browser console noise is evaluated.

## Why

The production route audit was rejecting healthy behavior: the journal collection is deliberately consolidated into Finance, and platform-admin pages correctly deny a tenant administrator. The audit now records both boundaries without weakening runtime, page-error, missing-route, or redirect-to-login failures.

## Verification

- Production promotion route audit must remain strict for unexpected redirects, runtime errors, missing pages, and console errors.
