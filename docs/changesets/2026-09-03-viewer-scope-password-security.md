# Viewer scope and password-change security

## Scope

- Keep `/projects/[id]/scope` readable for Viewer while omitting add, CAD upload,
  inline cost edit, and delete controls.
- Require the central `project.update` capability before every scope-item server
  mutation and commit each mutation with its audit record in one database
  transaction.
- Move authenticated profile password changes behind a server action.

## Security decisions

- The password action derives email, user ID, and tenant ID only from the
  authenticated server profile. Client input contains passwords only.
- Current-password verification uses an isolated, non-persistent Supabase anon
  session. The returned identity must match the authenticated profile before the
  same session can update its password.
- No service-role client is used: the reauthenticated user's own provider session
  is sufficient and preserves least privilege.
- A bounded audit authorization record is persisted before the external Auth
  update. It contains only flow/phase metadata; passwords and provider errors are
  never logged. Audit failure prevents the provider mutation.
- Successful changes clear the request's local session. Password-recovery behavior
  remains unchanged.

## Verification

- Focused scope and password suites cover Viewer zero-write denials, capable-role
  scope mutation, atomic audit failure, read-only rendered controls, identity
  mismatch, incorrect current password, provider errors, redacted audit failure,
  successful password update, and sign-out.
