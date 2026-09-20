# Production route-audit hardening

- Treat the intentional `/crm/opportunities` canonical redirect to `/pipeline`
  as a verified route contract instead of a failed response.
- Preserve sanitized browser page-error messages in the production audit
  artifact so a future runtime failure is diagnosable without storing URLs,
  record identifiers, or response bodies.
