# Verify stored inspection photo bytes before new registration

## Change

Core now verifies the private object before recording new inspection photo
metadata. The verifier streams at most 15 MiB within one ten-second deadline,
checks exact size and raster MIME/signature, and compares SHA-256 with the
existing Web uploader's content-addressed filename. Requests use only the
configured Storage origin and encoded segments; redirects and partial responses
are rejected. Provider details and credentials never enter returned errors.

Actor/tenant admission and opportunity locks remain held through verification,
document insertion and semantic audit. Missing or inconsistent bytes produce no
new document/audit. No failure deletes or overwrites an object.

New registrations using legacy unhashed filenames are now rejected. Exact
persisted receipt replay remains unchanged, including legacy names and project
conversion; it does not claim fresh or historical Storage verification.

## Verification

Behavioral RED reproduced both with the service fixture and actual PostgreSQL:
missing-object verification was ignored and a document was registered. Independent
review additionally reproduced three partial-response cases returning verified
success before the full-response guard was added.

- PASSED: main's final 73 focused Node 22 checks, no skips, including actual
  PostgreSQL admission/locking/rollback and real stream-verifier-to-database proof.
- PASSED: API type check and production Nest/Webpack build.
- PASSED: source ESLint, verified by the implementing agent, and main diff checks.
- The integration bridge stubs only provider fetch; the real verifier and database
  remain in the path. Provider availability and live uploads are not proven.

## Release requirements and limits

No dependency, migration or provider configuration changed. Existing four pending
claim/KYC/WAR migrations still require the database release runbook's recovery
evidence before production promotion.

Read-only production Core configuration inspection confirmed the correct
Supabase host but no `SUPABASE_SERVICE_ROLE_KEY`. Provision this server-only
credential through the approved secret manager before deploying this verifier;
otherwise new registration fails closed. No secret values were printed or saved.

This is not complete WO-12. The full multipart Web upload still exceeds Vercel's
documented 4.5 MB request limit for large photos; direct-to-private-Storage upload
is required. Inspection photo/report deletion retention also remains to be
implemented. Storage and PostgreSQL are not atomic, and a signature/hash check
does not prove full image decoding or malware absence. Existing replay does not
prove current object availability. No live upload or production deployment is
claimed.

Recovery is non-destructive: retain documents, audit history and private objects;
repair configuration or retry unchanged commands. Do not disable byte validation
or erase an uncertain upload to manufacture a successful retry.

Sources: [Supabase private downloads](https://supabase.com/docs/reference/javascript/file-buckets-download),
[Vercel function limits](https://vercel.com/docs/functions/limitations#request-body-size).
