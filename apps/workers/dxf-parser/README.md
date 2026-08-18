# ABI OPS CAD evidence worker

FastAPI service converts DWG to DXF and extracts bounded CAD evidence. It is
evidence-only: no database client, database URL, Supabase service-role key, or
official `scope_items` write exists in this worker.

## Run locally

From `/apps/web/`:

```bash
pnpm dev:worker
```

For local-only unauthenticated calls, set
`PARSER_ALLOW_UNAUTHENTICATED_LOCAL=true`. Production requires
`PARSER_SHARED_SECRET`.

## API

```text
POST /parse (legacy compatibility route)
  Authorization: Bearer <PARSER_SHARED_SECRET>
  Body: {
    job_id, attempt, source_url, source_sha256,
    source_format ("dxf" | "dwg"), file_name,
    max_bytes?, max_items?
  }
  Response: immutable extraction evidence with item keys and source hash

POST /parse-evidence (private Core bridge)
  X-Third-Code-Request-Timestamp: unix seconds
  X-Third-Code-Request-Id: <job_id>
  X-Third-Code-Request-Signature: HMAC-SHA256(
    "<timestamp>.<job_id>." + exact UTF-8 JSON body
  )
  Body: {
    job_id, attempt, source_url, source_format, file_name?,
    limits: { max_bytes, max_items }
  }
  Response: bounded evidence accepted by the Core document-processing contract

GET /health
  Response: { status, dwg_support, evidence_only: true }
```

`source_url` must be an exact-object, short-lived signed URL. Worker does not
log or persist it. NestJS/Next.js owns tenant authorization, official database
writes, audit attribution, idempotency, and draft-BOM creation.

`/parse-evidence` is not a browser endpoint. It requires a configured secret
of at least 20 characters, a request ID equal to the body `job_id`, and a
signature timestamp within five minutes. It verifies the exact received body
before reading the signed URL, caps the request body at 64 KiB, rejects
redirects, and bounds the source download. The legacy `/parse` route remains
for compatibility; it uses bearer authentication and a caller-provided source
hash.

## Production deployment

The production service is Railway `ABI OPS CAD Worker` at
`https://abi-ops-cad-worker-production.up.railway.app`. Set only
`PARSER_SHARED_SECRET` on the worker and the same value as a server-only
Vercel variable. The official Core caller uses `/parse-evidence`; it supplies
signed object URLs and the worker never receives tenant or database authority.
The legacy `/parse` route remains bearer-protected for compatibility.

The Docker image builds the pinned LibreDWG `0.13.4` release because Debian
does not provide a `libredwg-tools` package, then installs Python and ezdxf.
No Postgres client or database credential is required.

## Without the worker

If `DXF_PARSER_URL` is unset, DWG uploads remain stored and report that server-
side conversion is unavailable. DXF uploads use the in-process JS extractor.
