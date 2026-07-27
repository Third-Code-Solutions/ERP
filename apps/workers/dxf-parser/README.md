# CAD Parser Worker

FastAPI service that converts DWG files to DXF (via libredwg) and extracts
scope items (via ezdxf). Used by Third Code ERP when a user uploads a binary DWG
that the in-process JS extractor can't handle.

## Run locally

From `/apps/web/`:

```bash
pnpm dev:worker
```

This launches the worker on `http://localhost:8000` against your
`apps/web/.env.local` (database + Supabase credentials are reused).

After the worker is running, add this to `apps/web/.env.local`:

```
DXF_PARSER_URL=http://localhost:8000
```

Then restart `pnpm dev`. DWG uploads will be parsed inline — `/api/upload/complete`
calls the worker directly, awaits the scope extraction, and returns a rich
result with the auto-drafted BOM.

## Prerequisites

- **Python 3.11+** — comes with macOS or installable via `pyenv`
- **libredwg-tools** — provides the `dwg2dxf` binary
  - macOS (Homebrew): `brew install libredwg`
  - Debian/Ubuntu: `sudo apt-get install libredwg-tools`
  - From source: <https://www.gnu.org/software/libredwg/>

The worker pre-flight script (`run-local.sh`) checks for these and offers
guidance if anything is missing.

## API

```
POST /parse
  Body: {
    document_id, project_id, tenant_id,
    storage_path, format ("dxf" | "dwg"), file_name?
  }
  Response: { count, scope_items, warnings, parsed_format, source_format }

GET /health
  Response: { status: "ok", dwg_support: true|false }
```

## Production deployment

Deploy to Railway, Fly.io, Render, or any platform that runs Docker.
The provided `Dockerfile` installs Python + libredwg-tools and runs uvicorn
on `$PORT`. Set:

- `DATABASE_URL` (the same Postgres URL the web app uses)
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Then point `DXF_PARSER_URL` (in the web app's environment) at the deployed
worker's URL.

## Without the worker

If `DXF_PARSER_URL` is unset, DWG uploads are still **stored** correctly —
they just aren't auto-extracted. The user-facing message tells them to either
deploy the worker or re-export their drawing as DXF for instant in-browser
extraction.

DXF uploads work with or without the worker; they're parsed in-process by
`apps/web/src/lib/cad/dxf-extractor.ts` (pure JS, no external dependency).
