# Supabase Edge Functions — schedulers

Three Deno edge functions back the ABI Ops automation surface
(REFACTOR.md §7.4). All share `_shared/email.ts` (Resend + PostgREST
helpers) and `_shared/cors.ts`.

| Function | Cron | Purpose |
|---|---|---|
| `sla-checker` | `*/30 * * * *` | Watch open `sla_logs`. Emit warn / breach notifications + email when elapsed crosses thresholds. |
| `permit-staleness-checker` | `0 0 * * *` (08:00 PHT) | Surface permits stuck > 7 days in non-terminal status to PM + GM. |
| `cnps-survey-sender` | `0 * * * *` | Send CNPS surveys for warranty tickets closed > 48h ago without an existing survey row. |

## Environment

Each function reads these env vars at runtime (Supabase auto-injects the
first two; set the rest via `supabase secrets`):

```text
SUPABASE_URL                    # auto
SUPABASE_SERVICE_ROLE_KEY       # auto
RESEND_API_KEY                  # required for outbound email
RESEND_FROM_EMAIL               # default sender (optional)
PUBLIC_CNPS_BASE_URL            # CNPS-only: portal origin for survey links
```

If `RESEND_API_KEY` is unset the helper logs and returns — useful for
local dev where we don't want to spam real customers.

## Deploy

```bash
supabase functions deploy sla-checker
supabase functions deploy permit-staleness-checker
supabase functions deploy cnps-survey-sender
```

Set secrets once per project:

```bash
supabase secrets set \
  RESEND_API_KEY=re_... \
  RESEND_FROM_EMAIL='BuildOps <notifications@buildops.dev>' \
  PUBLIC_CNPS_BASE_URL=https://app.buildops.dev
```

## Cron setup

Use the Supabase Dashboard's "Scheduled Functions" UI, **or** wire
`pg_cron` + `pg_net` from SQL — replace `<ref>` with your project ref and
`<anon>` with the project's anon key:

```sql
-- sla-checker — every 30 min
SELECT cron.schedule(
  'sla-checker',
  '*/30 * * * *',
  $$ SELECT net.http_post(
       url := 'https://<ref>.functions.supabase.co/sla-checker',
       headers := jsonb_build_object('Authorization', 'Bearer <anon>')
     ) $$
);

-- permit-staleness-checker — daily 00:00 UTC == 08:00 PHT
SELECT cron.schedule(
  'permit-staleness-checker',
  '0 0 * * *',
  $$ SELECT net.http_post(
       url := 'https://<ref>.functions.supabase.co/permit-staleness-checker',
       headers := jsonb_build_object('Authorization', 'Bearer <anon>')
     ) $$
);

-- cnps-survey-sender — hourly
SELECT cron.schedule(
  'cnps-survey-sender',
  '0 * * * *',
  $$ SELECT net.http_post(
       url := 'https://<ref>.functions.supabase.co/cnps-survey-sender',
       headers := jsonb_build_object('Authorization', 'Bearer <anon>')
     ) $$
);
```

To unschedule:

```sql
SELECT cron.unschedule('sla-checker');
```

## Manual invocation

Useful while debugging. Returns `{ processed, errors, ... }`:

```bash
curl -X POST \
  "https://<ref>.functions.supabase.co/sla-checker" \
  -H "Authorization: Bearer <anon-or-service-role>"
```

## Local dev

```bash
supabase functions serve sla-checker --env-file ./supabase/.env.local
```

The functions are written against the Deno runtime, use Web `fetch`, and
have **no** npm/workspace deps — they boot in < 200ms on Supabase's edge.
