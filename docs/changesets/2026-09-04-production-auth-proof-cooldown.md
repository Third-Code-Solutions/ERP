# Production auth proof cooldown isolation

## Executive summary

The first production promotion deployed successfully, but its final browser
gate could not accept the release because Supabase rejected the password-reset
email during a temporary security cooldown. The application behaved correctly;
the release test had reused an account moments after generating a magic link.

This change makes the evidence deterministic without weakening security:

- authenticated production and all-role access checks run first;
- the real password-recovery request runs afterward as its own one-shot test;
- automatic retries are disabled for the email-sending proof;
- profile password change and restoration remain the final authentication gate;
- CI now prevents accidental reordering or re-enabling retries.

## Security and data impact

- No authentication policy, rate limit, RLS policy, schema, or production data
  is changed.
- No secret or account credential is written to source, logs, or this report.
- The recovery response remains enumeration-safe.
- The password-rotation harness still restores the original credential and
  fails closed if restoration cannot be verified.

## Verification

See the linked CI and protected production-promotion runs in the final release
report. This changeset is complete only after both are green.
