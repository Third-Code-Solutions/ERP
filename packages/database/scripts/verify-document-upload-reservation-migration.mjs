import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const POSTGRES_IMAGE =
  'postgres:16-alpine@sha256:cf78e76683b9ca8c5733cbbdce6c9262b45b6767934dd0a95e671f9a0fc20685'
const containerName = `erp-reservation-migration-${process.pid}-${randomUUID().replaceAll('-', '').slice(0, 12)}`
const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const migrationPath = resolve(
  scriptDirectory,
  '../../../supabase/migrations/20260824110438_document_upload_reservations.sql',
)
const reconciliationIndexMigrationPath = resolve(
  scriptDirectory,
  '../../../supabase/migrations/20260824152813_document_upload_reconciliation_indexes.sql',
)

const foundationSql = String.raw`
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create table public.tenants (
  id uuid primary key
);

create table public.users (
  id uuid primary key,
  tenant_id uuid not null references public.tenants (id),
  unique (tenant_id, id)
);

create table public.projects (
  id uuid primary key,
  tenant_id uuid not null references public.tenants (id),
  unique (tenant_id, id)
);

create table public.documents (
  id uuid primary key,
  tenant_id uuid not null references public.tenants (id),
  project_id uuid references public.projects (id),
  unique (tenant_id, id)
);
`

const behaviorSql = String.raw`
create function public.expect_sqlstate(
  test_name text,
  statement text,
  expected_sqlstate text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  actual_sqlstate text;
begin
  begin
    execute statement;
  exception when others then
    get stacked diagnostics actual_sqlstate = returned_sqlstate;
    if actual_sqlstate = expected_sqlstate then
      return;
    end if;
    raise exception '% returned SQLSTATE %, expected %',
      test_name,
      actual_sqlstate,
      expected_sqlstate;
  end;

  raise exception '% unexpectedly succeeded', test_name;
end
$$;

insert into public.tenants (id) values
  ('11111111-1111-4111-8111-111111111111'),
  ('77777777-7777-4777-8777-777777777777');
insert into public.users (id, tenant_id) values
  ('44444444-4444-4444-8444-444444444444', '11111111-1111-4111-8111-111111111111'),
  ('88888888-8888-4888-8888-888888888888', '77777777-7777-4777-8777-777777777777');
insert into public.projects (id, tenant_id) values
  ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111'),
  ('33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111');
insert into public.documents (id, tenant_id, project_id) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', '11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333');

select public.expect_sqlstate(
  'foreign tenant project',
  $statement$
    insert into public.document_upload_reservations (
      id, tenant_id, project_id, actor_id, storage_path,
      original_file_name, declared_size_bytes, declared_content_type,
      idempotency_key, request_hash
    ) values (
      '99999999-9999-4999-8999-999999999991',
      '77777777-7777-4777-8777-777777777777',
      '22222222-2222-4222-8222-222222222222',
      '88888888-8888-4888-8888-888888888888',
      '77777777-7777-4777-8777-777777777777/22222222-2222-4222-8222-222222222222/99999999-9999-4999-8999-999999999991-project.pdf',
      'project.pdf', 10, 'application/pdf', 'foreign-project', repeat('1', 64)
    )
  $statement$,
  '23503'
);

select public.expect_sqlstate(
  'foreign tenant actor',
  $statement$
    insert into public.document_upload_reservations (
      id, tenant_id, project_id, actor_id, storage_path,
      original_file_name, declared_size_bytes, declared_content_type,
      idempotency_key, request_hash
    ) values (
      '99999999-9999-4999-8999-999999999992',
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      '88888888-8888-4888-8888-888888888888',
      '11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/99999999-9999-4999-8999-999999999992-actor.pdf',
      'actor.pdf', 10, 'application/pdf', 'foreign-actor', repeat('2', 64)
    )
  $statement$,
  '23503'
);

select public.expect_sqlstate(
  'terminal reservation insert',
  $statement$
    insert into public.document_upload_reservations (
      id, tenant_id, project_id, actor_id, storage_path,
      original_file_name, declared_size_bytes, declared_content_type,
      idempotency_key, request_hash, state, terminal_at
    ) values (
      '55555555-5555-4555-8555-555555555550',
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      '44444444-4444-4444-8444-444444444444',
      '11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/55555555-5555-4555-8555-555555555550-terminal.pdf',
      'terminal.pdf', 10, 'application/pdf', 'terminal-insert',
      repeat('a', 64), 'released', now()
    )
  $statement$,
  '23514'
);

insert into public.document_upload_reservations (
  id, tenant_id, project_id, actor_id, storage_path,
  original_file_name, description, declared_size_bytes,
  declared_content_type, idempotency_key, request_hash
) values (
  '55555555-5555-4555-8555-555555555551',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '44444444-4444-4444-8444-444444444444',
  '11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/55555555-5555-4555-8555-555555555551-plan.pdf',
  'plan.pdf', 'Plan', 10, 'application/pdf', 'complete-plan', repeat('b', 64)
);

select public.expect_sqlstate(
  'duplicate actor idempotency key',
  $statement$
    insert into public.document_upload_reservations (
      id, tenant_id, project_id, actor_id, storage_path,
      original_file_name, declared_size_bytes, declared_content_type,
      idempotency_key, request_hash
    ) values (
      '55555555-5555-4555-8555-555555555552',
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      '44444444-4444-4444-8444-444444444444',
      '11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/55555555-5555-4555-8555-555555555552-plan.pdf',
      'plan.pdf', 10, 'application/pdf', 'complete-plan', repeat('c', 64)
    )
  $statement$,
  '23505'
);

select public.expect_sqlstate(
  'unsafe storage path',
  $statement$
    insert into public.document_upload_reservations (
      id, tenant_id, project_id, actor_id, storage_path,
      original_file_name, declared_size_bytes, declared_content_type,
      idempotency_key, request_hash
    ) values (
      '55555555-5555-4555-8555-555555555553',
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      '44444444-4444-4444-8444-444444444444',
      '11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/55555555-5555-4555-8555-555555555553-..plan.pdf',
      'plan.pdf', 10, 'application/pdf', 'unsafe-path', repeat('d', 64)
    )
  $statement$,
  '23514'
);

select public.expect_sqlstate(
  'completed without document',
  $statement$
    update public.document_upload_reservations
    set state = 'completed', terminal_at = now(), updated_at = now()
    where id = '55555555-5555-4555-8555-555555555551'
  $statement$,
  '23514'
);

select public.expect_sqlstate(
  'cross-project completion',
  $statement$
    update public.document_upload_reservations
    set state = 'completed',
        document_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
        terminal_at = now(),
        updated_at = now()
    where id = '55555555-5555-4555-8555-555555555551'
  $statement$,
  '23503'
);

update public.document_upload_reservations
set state = 'completed',
    document_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    terminal_at = now(),
    updated_at = now()
where id = '55555555-5555-4555-8555-555555555551';

do $$
begin
  if not exists (
    select 1 from public.document_upload_reservations
    where id = '55555555-5555-4555-8555-555555555551'
      and state = 'completed'
      and document_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  ) then
    raise exception 'valid same-project completion was not persisted';
  end if;
end
$$;

delete from public.documents
where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

do $$
begin
  if not exists (
    select 1 from public.document_upload_reservations
    where id = '55555555-5555-4555-8555-555555555551'
      and state = 'completed'
      and document_id is null
  ) then
    raise exception 'document delete did not retain a completed tombstone';
  end if;
end
$$;

select public.expect_sqlstate(
  'terminal reopen',
  $statement$
    update public.document_upload_reservations
    set state = 'active', terminal_at = null, updated_at = now()
    where id = '55555555-5555-4555-8555-555555555551'
  $statement$,
  '23514'
);

insert into public.document_upload_reservations (
  id, tenant_id, project_id, actor_id, storage_path,
  original_file_name, declared_size_bytes, declared_content_type,
  idempotency_key, request_hash
) values (
  '66666666-6666-4666-8666-666666666666',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '44444444-4444-4444-8444-444444444444',
  '11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/66666666-6666-4666-8666-666666666666-cleanup.pdf',
  'cleanup.pdf', 10, 'application/pdf', 'cleanup-plan', repeat('e', 64)
);

update public.document_upload_reservations
set state = 'released', terminal_at = now(), updated_at = now()
where id = '66666666-6666-4666-8666-666666666666';

update public.document_upload_reservations
set cleanup_attempt_count = 2,
    cleanup_claimed_at = terminal_at + interval '10 seconds',
    cleanup_last_error_code = 'STORAGE_TIMEOUT',
    updated_at = terminal_at + interval '10 seconds'
where id = '66666666-6666-4666-8666-666666666666';

select public.expect_sqlstate(
  'cleanup attempt decrease',
  $statement$
    update public.document_upload_reservations
    set cleanup_attempt_count = 1
    where id = '66666666-6666-4666-8666-666666666666'
  $statement$,
  '23514'
);

select public.expect_sqlstate(
  'cleanup evidence clearing',
  $statement$
    update public.document_upload_reservations
    set cleanup_attempt_count = 0,
        cleanup_claimed_at = null,
        cleanup_completed_at = null,
        cleanup_last_error_code = null
    where id = '66666666-6666-4666-8666-666666666666'
  $statement$,
  '23514'
);

select public.expect_sqlstate(
  'cleanup claim backdating',
  $statement$
    update public.document_upload_reservations
    set cleanup_claimed_at = terminal_at + interval '5 seconds'
    where id = '66666666-6666-4666-8666-666666666666'
  $statement$,
  '23514'
);

update public.document_upload_reservations
set cleanup_last_error_code = null,
    updated_at = cleanup_claimed_at
where id = '66666666-6666-4666-8666-666666666666';

update public.document_upload_reservations
set cleanup_completed_at = cleanup_claimed_at + interval '1 second',
    updated_at = cleanup_claimed_at + interval '1 second'
where id = '66666666-6666-4666-8666-666666666666';

select public.expect_sqlstate(
  'completed cleanup reopen',
  $statement$
    update public.document_upload_reservations
    set cleanup_attempt_count = 3,
        cleanup_claimed_at = cleanup_claimed_at + interval '1 second',
        cleanup_completed_at = null,
        cleanup_last_error_code = 'REOPENED',
        updated_at = cleanup_claimed_at + interval '1 second'
    where id = '66666666-6666-4666-8666-666666666666'
  $statement$,
  '23514'
);
`

const catalogSql = String.raw`
do $$
declare
  service_privileges text[];
  direct_grant_count integer;
  policy_count integer;
begin
  if not exists (
    select 1
    from pg_catalog.pg_class
    where oid = 'public.document_upload_reservations'::regclass
      and relrowsecurity
      and relforcerowsecurity
  ) then
    raise exception 'reservation table must enable and force RLS';
  end if;

  select array_agg(privilege_type::text order by privilege_type::text)
  into service_privileges
  from information_schema.table_privileges
  where table_schema = 'public'
    and table_name = 'document_upload_reservations'
    and grantee = 'service_role';

  if service_privileges is distinct from array['INSERT', 'SELECT', 'UPDATE']::text[] then
    raise exception 'unexpected service_role privileges: %', service_privileges;
  end if;

  select count(*)
  into direct_grant_count
  from information_schema.table_privileges
  where table_schema = 'public'
    and table_name = 'document_upload_reservations'
    and grantee in ('anon', 'authenticated', 'PUBLIC');

  if direct_grant_count <> 0 then
    raise exception 'direct roles retain reservation table privileges';
  end if;

  select count(*)
  into policy_count
  from pg_catalog.pg_policy as policy
  where policy.polrelid = 'public.document_upload_reservations'::regclass
    and policy.polname = 'deny_direct_client_access'
    and policy.polcmd = '*'
    and policy.polpermissive
    and (
      select array_agg(role.rolname::text order by role.rolname::text)
      from unnest(policy.polroles) as policy_role(role_oid)
      join pg_catalog.pg_roles as role on role.oid = policy_role.role_oid
    ) = array['anon', 'authenticated']::text[]
    and regexp_replace(
      pg_get_expr(policy.polqual, policy.polrelid),
      '[()[:space:]]',
      '',
      'g'
    ) = 'false'
    and regexp_replace(
      pg_get_expr(policy.polwithcheck, policy.polrelid),
      '[()[:space:]]',
      '',
      'g'
    ) = 'false';

  if policy_count <> 1 then
    raise exception 'deny policy roles or expressions do not match the contract';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_roles
    where rolname = 'service_role' and rolbypassrls
  ) then
    raise exception 'service_role must retain BYPASSRLS';
  end if;
end
$$;
`

const reconciliationIndexVerificationSql = String.raw`
alter table public.document_upload_reservations disable trigger user;

with fixture as (
  select
    gen_random_uuid() as id,
    case when series <= 1200 then 'released' else 'completed' end::public.document_upload_reservation_state as state,
    timestamp with time zone '2026-08-24 00:00:00+00' as created_at
  from generate_series(1, 2400) as series
)
insert into public.document_upload_reservations (
  id,
  tenant_id,
  project_id,
  actor_id,
  storage_path,
  original_file_name,
  declared_size_bytes,
  declared_content_type,
  idempotency_key,
  request_hash,
  state,
  expires_at,
  terminal_at,
  created_at,
  updated_at
)
select
  fixture.id,
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '44444444-4444-4444-8444-444444444444',
  concat(
    '11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/',
    fixture.id::text,
    '-reconcile.pdf'
  ),
  'reconcile.pdf',
  10,
  'application/pdf',
  concat('reconcile-', fixture.id::text),
  repeat('a', 64),
  fixture.state,
  fixture.created_at + interval '2 hours',
  fixture.created_at + interval '1 hour',
  fixture.created_at,
  fixture.created_at + interval '1 hour'
from fixture;

alter table public.document_upload_reservations enable trigger user;
analyze public.document_upload_reservations;

do $$
declare
  terminal_plan json;
  completed_plan json;
  terminal_definition text;
  completed_definition text;
begin
  select pg_get_indexdef(index_class.oid)
  into terminal_definition
  from pg_catalog.pg_class as index_class
  join pg_catalog.pg_index as index_catalog on index_catalog.indexrelid = index_class.oid
  where index_class.oid = 'public.idx_document_upload_reservations_reconcile_terminal'::regclass
    and index_catalog.indisvalid
    and index_catalog.indisready;

  if terminal_definition is null
    or terminal_definition not like '%(tenant_id, id)%'
    or terminal_definition not like '%cleanup_completed_at IS NULL%'
  then
    raise exception 'terminal reconciliation index catalog contract mismatch: %', terminal_definition;
  end if;

  select pg_get_indexdef(index_class.oid)
  into completed_definition
  from pg_catalog.pg_class as index_class
  join pg_catalog.pg_index as index_catalog on index_catalog.indexrelid = index_class.oid
  where index_class.oid = 'public.idx_document_upload_reservations_reconcile_completed'::regclass
    and index_catalog.indisvalid
    and index_catalog.indisready;

  if completed_definition is null
    or completed_definition not like '%(tenant_id, id)%'
    or completed_definition not like '%state = %completed%'
  then
    raise exception 'completed reconciliation index catalog contract mismatch: %', completed_definition;
  end if;

  set local enable_seqscan = off;
  execute $query$
    explain (format json, costs off)
    select id
    from public.document_upload_reservations
    where tenant_id = '11111111-1111-4111-8111-111111111111'
      and state in ('released', 'expired')
      and cleanup_completed_at is null
      and id > '00000000-0000-0000-0000-000000000000'
    order by id
    limit 26
  $query$ into terminal_plan;

  if terminal_plan::text not like '%idx_document_upload_reservations_reconcile_terminal%' then
    raise exception 'terminal reconciliation plan did not use bounded partial index: %', terminal_plan;
  end if;

  execute $query$
    explain (format json, costs off)
    select reservation.id
    from public.document_upload_reservations as reservation
    left join public.documents as document
      on document.id = reservation.document_id
      and document.tenant_id = reservation.tenant_id
      and document.project_id = reservation.project_id
    where reservation.tenant_id = '11111111-1111-4111-8111-111111111111'
      and reservation.state = 'completed'
      and reservation.id > '00000000-0000-0000-0000-000000000000'
    order by reservation.id
    limit 26
  $query$ into completed_plan;

  if completed_plan::text not like '%idx_document_upload_reservations_reconcile_completed%' then
    raise exception 'completed reconciliation plan did not use bounded partial index: %', completed_plan;
  end if;
end
$$;
`

const activeChildren = new Set()

function run(
  command,
  args,
  {
    input,
    allowFailure = false,
    timeoutMs = 60_000,
    terminationGraceMs = 2_000,
  } = {},
) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      shell: false,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    activeChildren.add(child)
    let stdout = ''
    let stderr = ''
    let settled = false
    let timedOut = false
    let forcedTermination

    const timeout = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
      forcedTermination = setTimeout(() => {
        if (!child.killed || child.exitCode === null) child.kill('SIGKILL')
      }, terminationGraceMs)
    }, timeoutMs)

    function finish(callback) {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      clearTimeout(forcedTermination)
      activeChildren.delete(child)
      callback()
    }

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.stdin.on('error', () => undefined)
    child.on('error', (error) => finish(() => rejectPromise(error)))
    child.on('close', (code) => {
      finish(() => {
        if (timedOut) {
          rejectPromise(new Error(`${command} timed out after ${timeoutMs}ms`))
          return
        }

        const result = { code: code ?? 1, stdout, stderr }
        if (!allowFailure && result.code !== 0) {
          rejectPromise(
            new Error(
              `${command} exited ${result.code}: ${stderr.trim().slice(0, 2000)}`,
            ),
          )
          return
        }
        resolvePromise(result)
      })
    })

    child.stdin.end(input)
  })
}

function runDocker(args, options) {
  return run('docker', args, options)
}

function runPsql(sql, options) {
  return runDocker(
    [
      'exec',
      '-i',
      containerName,
      'psql',
      '-X',
      '--username=postgres',
      '--dbname=postgres',
      '--set=ON_ERROR_STOP=1',
      '--quiet',
    ],
    { timeoutMs: 30_000, ...options, input: sql },
  )
}

async function waitForPostgres() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const readiness = await runDocker(
      [
        'exec',
        containerName,
        'pg_isready',
        '--username=postgres',
        '--dbname=postgres',
      ],
      { allowFailure: true, timeoutMs: 5_000 },
    )
    if (readiness.code === 0) return
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500))
  }
  throw new Error('Disposable PostgreSQL did not become ready')
}

async function verifyAccessControls() {
  for (const role of ['anon', 'authenticated']) {
    const result = await runPsql(
      `set role ${role}; select count(*) from public.document_upload_reservations;`,
      { allowFailure: true },
    )
    assert.notEqual(result.code, 0, `${role} direct read unexpectedly succeeded`)
    assert.match(result.stderr, /permission denied/i)
  }

  await runPsql(String.raw`
grant select, insert on table public.document_upload_reservations
to anon, authenticated;
`)
  try {
    const policyInsertIds = {
      anon: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
      authenticated: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4',
    }

    for (const role of ['anon', 'authenticated']) {
      const visibleRows = await runPsql(
        `set role ${role}; select 'POLICY_ROWS:' || count(*) from public.document_upload_reservations;`,
      )
      assert.match(visibleRows.stdout, /POLICY_ROWS:0/)

      const reservationId = policyInsertIds[role]
      const insert = await runPsql(
        String.raw`
set role ${role};
insert into public.document_upload_reservations (
  id, tenant_id, project_id, actor_id, storage_path,
  original_file_name, declared_size_bytes, declared_content_type,
  idempotency_key, request_hash
) values (
  '${reservationId}',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '44444444-4444-4444-8444-444444444444',
  '11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/${reservationId}-policy.pdf',
  'policy.pdf', 10, 'application/pdf', 'policy-${role}', repeat('f', 64)
);
`,
        { allowFailure: true },
      )
      assert.notEqual(insert.code, 0, `${role} RLS insert unexpectedly succeeded`)
      assert.match(insert.stderr, /row-level security policy/i)
      assert.doesNotMatch(insert.stderr, /permission denied for table/i)
    }
  } finally {
    await runPsql(String.raw`
revoke select, insert on table public.document_upload_reservations
from anon, authenticated;
`)
  }

  await runPsql(catalogSql)

  const serviceRead = await runPsql(String.raw`
set role service_role;
select 'SERVICE_ROLE_OK:' || count(*)
from public.document_upload_reservations;
`)
  assert.match(serviceRead.stdout, /SERVICE_ROLE_OK:[1-9][0-9]*/)
}

function delay(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds))
}

async function removeOwnedContainer() {
  return runDocker(['rm', '--force', containerName], {
    allowFailure: true,
    timeoutMs: 15_000,
    terminationGraceMs: 1_000,
  })
}

let signalExitStarted = false
async function exitForSignal(signal) {
  if (signalExitStarted) return
  signalExitStarted = true

  for (const child of activeChildren) child.kill('SIGTERM')
  await delay(500)
  for (const child of activeChildren) child.kill('SIGKILL')
  await removeOwnedContainer().catch(() => undefined)
  process.exit(signal === 'SIGINT' ? 130 : 143)
}

process.once('SIGINT', () => {
  void exitForSignal('SIGINT')
})
process.once('SIGTERM', () => {
  void exitForSignal('SIGTERM')
})

let primaryFailure
try {
  const migrationSql = await readFile(migrationPath, 'utf8')
  const reconciliationIndexMigrationSql = await readFile(
    reconciliationIndexMigrationPath,
    'utf8',
  )
  await runDocker(
    [
      'run',
      '--detach',
      '--rm',
      '--name',
      containerName,
      '--env',
      'POSTGRES_HOST_AUTH_METHOD=trust',
      POSTGRES_IMAGE,
    ],
    { timeoutMs: 120_000 },
  )
  await waitForPostgres()
  await runPsql(foundationSql)
  await runPsql(migrationSql)
  await runPsql(reconciliationIndexMigrationSql)
  await runPsql(behaviorSql)
  await verifyAccessControls()
  await runPsql(reconciliationIndexVerificationSql)
  process.stdout.write('document upload reservation migration verification passed\n')
} catch (error) {
  primaryFailure = error
} finally {
  const cleanup = await removeOwnedContainer().catch((error) => ({
    code: 1,
    stderr: String(error),
  }))
  if (!primaryFailure && cleanup.code !== 0 && !/no such container/i.test(cleanup.stderr)) {
    primaryFailure = new Error('Failed to remove the owned disposable container')
  }
}

if (primaryFailure) throw primaryFailure
