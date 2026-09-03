import { createHash, randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

export const PLATFORM_OWNER_EMAIL = 'kurt@thirdcodesolutions.com'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function selectVerifiedOwner(users) {
  const matches = users.filter(
    (user) =>
      typeof user?.email === 'string' &&
      user.email.trim().toLowerCase() === PLATFORM_OWNER_EMAIL
  )
  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one authentication identity for the platform owner; found ${matches.length}`
    )
  }
  const [owner] = matches
  if (!UUID_PATTERN.test(owner.id)) {
    throw new Error('Platform-owner authentication identity has an invalid immutable ID')
  }
  if (!owner.email_confirmed_at) {
    throw new Error('Platform-owner authentication email is not provider-verified')
  }
  return owner
}

async function listAuthUsers(supabaseUrl, serviceRoleKey) {
  const users = []
  for (let page = 1; page <= 100; page += 1) {
    const response = await fetch(
      `${supabaseUrl}/auth/v1/admin/users?page=${page}&per_page=1000`,
      {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
      }
    )
    if (!response.ok) {
      throw new Error(
        `Supabase Auth owner lookup failed with HTTP ${response.status}`
      )
    }
    const payload = await response.json()
    const pageUsers = Array.isArray(payload?.users) ? payload.users : []
    users.push(...pageUsers)
    if (pageUsers.length < 1000) return users
  }
  throw new Error('Supabase Auth owner lookup exceeded the bounded page limit')
}

function connectionEnvironment(databaseUrl) {
  const parsed = new URL(databaseUrl)
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('PRODUCTION_DATABASE_URL must use PostgreSQL')
  }
  return {
    PGHOST: parsed.hostname,
    PGPORT: parsed.port || '5432',
    PGUSER: decodeURIComponent(parsed.username),
    PGPASSWORD: decodeURIComponent(parsed.password),
    PGDATABASE: parsed.pathname.replace(/^\//, ''),
    PGSSLMODE: parsed.searchParams.get('sslmode') || 'require',
  }
}

function bootstrapSql(ownerId) {
  const traceId = randomUUID()
  return String.raw`
begin;

do $bootstrap$
declare
  active_assignment_count integer;
  exact_assignment_count integer;
  eligible_user_count integer;
begin
  if to_regclass('public.platform_role_assignments') is null then
    raise exception 'ADR-027 migration is not installed';
  end if;

  select count(*) into eligible_user_count
    from public.users as app_user
    join public.tenants as tenant on tenant.id = app_user.tenant_id
   where app_user.id = '${ownerId}'::uuid
     and lower(app_user.email) = '${PLATFORM_OWNER_EMAIL}'
     and app_user.account_status = 'active'
     and tenant.status = 'active';

  if eligible_user_count <> 1 then
    raise exception 'platform owner application identity or tenant is not active and exact';
  end if;

  select count(*) into active_assignment_count
    from public.platform_role_assignments
   where revoked_at is null;

  select count(*) into exact_assignment_count
    from public.platform_role_assignments
   where user_id = '${ownerId}'::uuid
     and normalized_email = '${PLATFORM_OWNER_EMAIL}'
     and role = 'platform_owner'
     and revoked_at is null;

  if active_assignment_count = 0 then
    insert into public.platform_role_assignments (
      user_id,
      role,
      normalized_email,
      created_by
    ) values (
      '${ownerId}'::uuid,
      'platform_owner',
      '${PLATFORM_OWNER_EMAIL}',
      '${ownerId}'::uuid
    );

    insert into public.platform_audit_events (
      trace_id,
      actor_id,
      action,
      outcome,
      target_type,
      target_id,
      target_tenant_id,
      metadata
    )
    select
      '${traceId}'::uuid,
      app_user.id,
      'platform.owner.bootstrap',
      'succeeded',
      'platform_role_assignment',
      app_user.id::text,
      app_user.tenant_id,
      jsonb_build_object('method', 'reviewed_release_bootstrap')
    from public.users as app_user
    where app_user.id = '${ownerId}'::uuid;
  elsif active_assignment_count <> 1 or exact_assignment_count <> 1 then
    raise exception 'platform owner assignment does not match the sole reviewed identity';
  end if;
end
$bootstrap$;

commit;
`
}

async function main() {
  const supabaseUrl = (
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  ).replace(/\/$/, '')
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  const databaseUrl = process.env.PRODUCTION_DATABASE_URL || ''
  if (!supabaseUrl || !serviceRoleKey || !databaseUrl) {
    throw new Error(
      'SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY, and PRODUCTION_DATABASE_URL are required'
    )
  }

  const authUsers = await listAuthUsers(supabaseUrl, serviceRoleKey)
  const owner = selectVerifiedOwner(authUsers)
  const result = spawnSync('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-q'], {
    env: {
      ...process.env,
      ...connectionEnvironment(databaseUrl),
    },
    input: bootstrapSql(owner.id),
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  if (result.status !== 0) {
    throw new Error('Platform-owner database bootstrap failed')
  }

  const fingerprint = createHash('sha256').update(owner.id).digest('hex').slice(0, 12)
  console.log(
    `PASS sole platform owner is provider-verified and bound (identity fingerprint ${fingerprint})`
  )
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Platform-owner bootstrap failed')
    process.exitCode = 1
  })
}
