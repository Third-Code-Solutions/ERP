import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const POSTGRES_IMAGE =
  'postgres:16-alpine@sha256:cf78e76683b9ca8c5733cbbdce6c9262b45b6767934dd0a95e671f9a0fc20685'
const containerName = `erp-document-opportunity-${process.pid}-${randomUUID().replaceAll('-', '').slice(0, 12)}`
const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const migrationPath = resolve(
  scriptDirectory,
  '../../../supabase/migrations/20260824144430_document_opportunity_project_integrity.sql',
)

const foundationSql = String.raw`
create table public.tenants (
  id uuid primary key
);

create table public.projects (
  id uuid primary key,
  tenant_id uuid not null references public.tenants (id)
);

create table public.opportunities (
  id uuid primary key,
  tenant_id uuid not null references public.tenants (id),
  project_id uuid references public.projects (id) on delete cascade
);

create unique index ux_opportunities_tenant_id_id
  on public.opportunities (tenant_id, id);

create table public.documents (
  id uuid primary key,
  tenant_id uuid not null references public.tenants (id),
  project_id uuid references public.projects (id) on delete cascade,
  opportunity_id uuid,
  constraint documents_opportunity_tenant_fk
    foreign key (tenant_id, opportunity_id)
    references public.opportunities (tenant_id, id)
    on delete cascade,
  constraint documents_project_or_opportunity
    check (project_id is not null or opportunity_id is not null)
);

insert into public.tenants (id) values
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222');

insert into public.projects (id, tenant_id) values
  ('33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111'),
  ('44444444-4444-4444-8444-444444444444', '11111111-1111-4111-8111-111111111111'),
  ('55555555-5555-4555-8555-555555555555', '22222222-2222-4222-8222-222222222222');

insert into public.opportunities (id, tenant_id, project_id) values
  ('66666666-6666-4666-8666-666666666666', '11111111-1111-4111-8111-111111111111', null),
  ('77777777-7777-4777-8777-777777777777', '11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333'),
  ('88888888-8888-4888-8888-888888888888', '11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333'),
  ('99999999-9999-4999-8999-999999999999', '22222222-2222-4222-8222-222222222222', null),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '11111111-1111-4111-8111-111111111111', null),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', '11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333');

-- This row is legal under the legacy two-column FK and must fail preflight.
insert into public.documents (id, tenant_id, project_id, opportunity_id) values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '11111111-1111-4111-8111-111111111111',
  '44444444-4444-4444-8444-444444444444',
  '77777777-7777-4777-8777-777777777777'
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

-- MATCH SIMPLE intentionally permits a pre-project document while the retained
-- two-column FK still binds its tenant and opportunity.
insert into public.documents (id, tenant_id, project_id, opportunity_id) values (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
  '11111111-1111-4111-8111-111111111111',
  null,
  '66666666-6666-4666-8666-666666666666'
);

-- A project-only document has no opportunity correlation to validate.
insert into public.documents (id, tenant_id, project_id, opportunity_id) values (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb8',
  '11111111-1111-4111-8111-111111111111',
  '33333333-3333-4333-8333-333333333333',
  null
);

select public.expect_sqlstate(
  'document without project or opportunity',
  $statement$
    insert into public.documents (id, tenant_id, project_id, opportunity_id) values (
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb9',
      '11111111-1111-4111-8111-111111111111',
      null,
      null
    )
  $statement$,
  '23514'
);

select public.expect_sqlstate(
  'wrong-tenant pre-project document',
  $statement$
    insert into public.documents (id, tenant_id, project_id, opportunity_id) values (
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
      '22222222-2222-4222-8222-222222222222',
      null,
      '66666666-6666-4666-8666-666666666666'
    )
  $statement$,
  '23503'
);

select public.expect_sqlstate(
  'wrong-project linked document',
  $statement$
    insert into public.documents (id, tenant_id, project_id, opportunity_id) values (
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3',
      '11111111-1111-4111-8111-111111111111',
      '44444444-4444-4444-8444-444444444444',
      '77777777-7777-4777-8777-777777777777'
    )
  $statement$,
  '23503'
);

select public.expect_sqlstate(
  'project-linked document against a projectless opportunity',
  $statement$
    insert into public.documents (id, tenant_id, project_id, opportunity_id) values (
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb10',
      '22222222-2222-4222-8222-222222222222',
      '55555555-5555-4555-8555-555555555555',
      '99999999-9999-4999-8999-999999999999'
    )
  $statement$,
  '23503'
);

select public.expect_sqlstate(
  'wrong-tenant linked document',
  $statement$
    insert into public.documents (id, tenant_id, project_id, opportunity_id) values (
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb6',
      '22222222-2222-4222-8222-222222222222',
      '55555555-5555-4555-8555-555555555555',
      '77777777-7777-4777-8777-777777777777'
    )
  $statement$,
  '23503'
);

insert into public.documents (id, tenant_id, project_id, opportunity_id) values (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4',
  '11111111-1111-4111-8111-111111111111',
  '33333333-3333-4333-8333-333333333333',
  '77777777-7777-4777-8777-777777777777'
);

select public.expect_sqlstate(
  'linked opportunity reparent',
  $statement$
    update public.opportunities
    set project_id = '44444444-4444-4444-8444-444444444444'
    where id = '77777777-7777-4777-8777-777777777777'
  $statement$,
  '23503'
);

-- Reparenting an opportunity that has only pre-project documents remains
-- valid because their null project_id intentionally opts out under MATCH SIMPLE.
update public.opportunities
set project_id = '33333333-3333-4333-8333-333333333333'
where id = '66666666-6666-4666-8666-666666666666';

do $$
begin
  if not exists (
    select 1 from public.opportunities
    where id = '66666666-6666-4666-8666-666666666666'
      and project_id = '33333333-3333-4333-8333-333333333333'
  ) then
    raise exception 'pre-project-only opportunity reparent did not persist';
  end if;
end
$$;

insert into public.documents (id, tenant_id, project_id, opportunity_id) values (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb5',
  '11111111-1111-4111-8111-111111111111',
  '33333333-3333-4333-8333-333333333333',
  '88888888-8888-4888-8888-888888888888'
);

delete from public.opportunities
where id = '88888888-8888-4888-8888-888888888888';

insert into public.documents (id, tenant_id, project_id, opportunity_id) values (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb7',
  '11111111-1111-4111-8111-111111111111',
  null,
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
);

delete from public.opportunities
where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

do $$
begin
  if exists (
    select 1 from public.documents
    where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb5'
  ) then
    raise exception 'opportunity delete did not cascade to its document';
  end if;
  if exists (
    select 1 from public.documents
    where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb7'
  ) then
    raise exception 'pre-project opportunity delete did not cascade to its document';
  end if;
end
$$;
`

const catalogSql = String.raw`
do $$
declare
  project_constraint record;
  retained_constraint record;
  parent_index record;
  child_index record;
begin
  select
    constraint_record.confmatchtype,
    constraint_record.confdeltype,
    constraint_record.confupdtype,
    constraint_record.convalidated,
    array(
      select attribute.attname
      from unnest(constraint_record.conkey) with ordinality as key(attnum, position)
      join pg_catalog.pg_attribute as attribute
        on attribute.attrelid = constraint_record.conrelid
       and attribute.attnum = key.attnum
      order by key.position
    ) as child_columns,
    array(
      select attribute.attname
      from unnest(constraint_record.confkey) with ordinality as key(attnum, position)
      join pg_catalog.pg_attribute as attribute
        on attribute.attrelid = constraint_record.confrelid
       and attribute.attnum = key.attnum
      order by key.position
    ) as parent_columns
  into project_constraint
  from pg_catalog.pg_constraint as constraint_record
  where constraint_record.conrelid = 'public.documents'::regclass
    and constraint_record.conname = 'documents_opportunity_project_tenant_fk';

  if not found then
    raise exception 'project correlation constraint is missing';
  end if;
  if project_constraint.confmatchtype <> 's' then
    raise exception 'project correlation constraint must use MATCH SIMPLE';
  end if;
  if project_constraint.confdeltype <> 'c' then
    raise exception 'project correlation constraint must cascade deletes';
  end if;
  if project_constraint.confupdtype <> 'a' then
    raise exception 'project correlation constraint must use NO ACTION updates';
  end if;
  if not project_constraint.convalidated then
    raise exception 'project correlation constraint was not validated';
  end if;
  if project_constraint.child_columns <> array['tenant_id', 'opportunity_id', 'project_id']::name[] then
    raise exception 'project correlation child column order is malformed';
  end if;
  if project_constraint.parent_columns <> array['tenant_id', 'id', 'project_id']::name[] then
    raise exception 'project correlation parent column order is malformed';
  end if;

  select
    constraint_record.convalidated,
    constraint_record.confmatchtype,
    constraint_record.confdeltype,
    constraint_record.confupdtype,
    array(
      select attribute.attname
      from unnest(constraint_record.conkey) with ordinality as key(attnum, position)
      join pg_catalog.pg_attribute as attribute
        on attribute.attrelid = constraint_record.conrelid
       and attribute.attnum = key.attnum
      order by key.position
    ) as child_columns,
    array(
      select attribute.attname
      from unnest(constraint_record.confkey) with ordinality as key(attnum, position)
      join pg_catalog.pg_attribute as attribute
        on attribute.attrelid = constraint_record.confrelid
       and attribute.attnum = key.attnum
      order by key.position
    ) as parent_columns
  into retained_constraint
  from pg_catalog.pg_constraint as constraint_record
  where constraint_record.conrelid = 'public.documents'::regclass
    and constraint_record.conname = 'documents_opportunity_tenant_fk';

  if not found or not retained_constraint.convalidated then
    raise exception 'tenant/opportunity constraint was not retained';
  end if;
  if retained_constraint.child_columns <> array['tenant_id', 'opportunity_id']::name[] then
    raise exception 'retained constraint child column order is malformed';
  end if;
  if retained_constraint.parent_columns <> array['tenant_id', 'id']::name[] then
    raise exception 'retained constraint parent column order is malformed';
  end if;
  if retained_constraint.confmatchtype <> 's'
    or retained_constraint.confdeltype <> 'c'
    or retained_constraint.confupdtype <> 'a'
  then
    raise exception 'retained constraint actions are malformed';
  end if;

  select
    index_record.indisunique,
    index_record.indisvalid,
    index_record.indisready,
    index_record.indislive,
    index_record.indpred is null as nonpartial,
    index_record.indexprs is null as plain_columns,
    index_record.indnkeyatts,
    index_record.indnatts,
    access_method.amname,
    array(
      select attribute.attname
      from unnest(index_record.indkey::smallint[]) with ordinality as key(attnum, position)
      join pg_catalog.pg_attribute as attribute
        on attribute.attrelid = index_record.indrelid
       and attribute.attnum = key.attnum
      order by key.position
    ) as columns
  into parent_index
  from pg_catalog.pg_index as index_record
  join pg_catalog.pg_class as index_class
    on index_class.oid = index_record.indexrelid
  join pg_catalog.pg_am as access_method
    on access_method.oid = index_class.relam
  where index_record.indrelid = 'public.opportunities'::regclass
    and index_class.relname = 'ux_opportunities_tenant_id_id_project_id';

  if not found
    or not parent_index.indisunique
    or not parent_index.indisvalid
    or not parent_index.indisready
    or not parent_index.indislive
    or not parent_index.nonpartial
    or not parent_index.plain_columns
    or parent_index.indnkeyatts <> 3
    or parent_index.indnatts <> 3
    or parent_index.amname <> 'btree'
    or parent_index.columns <> array['tenant_id', 'id', 'project_id']::name[]
  then
    raise exception 'parent unique index is missing or malformed';
  end if;

  select
    index_record.indisunique,
    index_record.indisvalid,
    index_record.indisready,
    index_record.indislive,
    index_record.indpred is null as nonpartial,
    index_record.indexprs is null as plain_columns,
    index_record.indnkeyatts,
    index_record.indnatts,
    access_method.amname,
    array(
      select attribute.attname
      from unnest(index_record.indkey::smallint[]) with ordinality as key(attnum, position)
      join pg_catalog.pg_attribute as attribute
        on attribute.attrelid = index_record.indrelid
       and attribute.attnum = key.attnum
      order by key.position
    ) as columns
  into child_index
  from pg_catalog.pg_index as index_record
  join pg_catalog.pg_class as index_class
    on index_class.oid = index_record.indexrelid
  join pg_catalog.pg_am as access_method
    on access_method.oid = index_class.relam
  where index_record.indrelid = 'public.documents'::regclass
    and index_class.relname = 'idx_documents_tenant_opportunity_project';

  if not found
    or child_index.indisunique
    or not child_index.indisvalid
    or not child_index.indisready
    or not child_index.indislive
    or not child_index.nonpartial
    or not child_index.plain_columns
    or child_index.indnkeyatts <> 3
    or child_index.indnatts <> 3
    or child_index.amname <> 'btree'
    or child_index.columns <> array['tenant_id', 'opportunity_id', 'project_id']::name[]
  then
    raise exception 'child lookup index is missing or malformed';
  end if;
end
$$;
`

const activeChildren = new Set()

function run(
  command,
  args,
  { input, allowFailure = false, onStdout, timeoutMs = 60_000 } = {},
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
    let forcedTermination
    const timeout = setTimeout(() => {
      child.kill('SIGTERM')
      forcedTermination = setTimeout(() => child.kill('SIGKILL'), 2_000)
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
      onStdout?.(chunk)
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.stdin.on('error', () => undefined)
    child.on('error', (error) => finish(() => rejectPromise(error)))
    child.on('close', (code) => {
      finish(() => {
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

function runPsqlInDatabase(database, sql, options) {
  return runDocker(
    [
      'exec',
      '-i',
      containerName,
      'psql',
      '-X',
      '--username=postgres',
      `--dbname=${database}`,
      '--set=ON_ERROR_STOP=1',
      '--quiet',
    ],
    { timeoutMs: 30_000, ...options, input: sql },
  )
}

function runPsql(sql, options) {
  return runPsqlInDatabase('postgres', sql, options)
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

function delay(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds))
}

async function verifyMigrationNameCollisions(migrationSql) {
  const collisions = [
    {
      database: 'collision_parent_index',
      setup: String.raw`
create unique index ux_opportunities_tenant_id_id_project_id
  on public.opportunities (tenant_id, project_id, id);
`,
      expectedState: /COLLISION_STATE:1:0:0:-/,
    },
    {
      database: 'collision_child_index',
      setup: String.raw`
create index idx_documents_tenant_opportunity_project
  on public.documents (tenant_id, project_id, opportunity_id);
`,
      expectedState: /COLLISION_STATE:0:1:0:-/,
    },
    {
      database: 'collision_constraint',
      setup: String.raw`
alter table public.documents
  add constraint documents_opportunity_project_tenant_fk check (true);
`,
      expectedState: /COLLISION_STATE:0:0:1:c/,
    },
  ]

  for (const collision of collisions) {
    await runPsql(`create database ${collision.database};`)
    await runPsqlInDatabase(collision.database, foundationSql)
    await runPsqlInDatabase(
      collision.database,
      String.raw`
delete from public.documents
where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
${collision.setup}
`,
    )

    const result = await runPsqlInDatabase(collision.database, migrationSql, {
      allowFailure: true,
    })
    assert.notEqual(
      result.code,
      0,
      `${collision.database} same-name collision unexpectedly succeeded`,
    )
    assert.match(result.stderr, /already exists/i)

    const state = await runPsqlInDatabase(
      collision.database,
      String.raw`
select format(
  'COLLISION_STATE:%s:%s:%s:%s',
  (
    select count(*)
    from pg_catalog.pg_class
    where relnamespace = 'public'::regnamespace
      and relname = 'ux_opportunities_tenant_id_id_project_id'
  ),
  (
    select count(*)
    from pg_catalog.pg_class
    where relnamespace = 'public'::regnamespace
      and relname = 'idx_documents_tenant_opportunity_project'
  ),
  (
    select count(*)
    from pg_catalog.pg_constraint
    where conrelid = 'public.documents'::regclass
      and conname = 'documents_opportunity_project_tenant_fk'
  ),
  coalesce(
    (
      select contype::text
      from pg_catalog.pg_constraint
      where conrelid = 'public.documents'::regclass
        and conname = 'documents_opportunity_project_tenant_fk'
    ),
    '-'
  )
);
`,
    )
    assert.match(state.stdout, collision.expectedState)
  }
}

async function verifyIntakeLockSchedule() {
  let signalIntakeLock
  let rejectIntakeLock
  let intakeOutput = ''
  const intakeLocked = new Promise((resolvePromise, rejectPromise) => {
    signalIntakeLock = resolvePromise
    rejectIntakeLock = rejectPromise
  })
  const intakeReadyTimeout = setTimeout(
    () => rejectIntakeLock(new Error('Intake session did not acquire its row lock')),
    5_000,
  )
  const intake = runPsql(
    String.raw`
begin;
select id
from public.opportunities
where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'
for update;
\echo INTAKE_LOCKED
select pg_sleep(3);
insert into public.documents (id, tenant_id, project_id, opportunity_id) values (
  'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
  '11111111-1111-4111-8111-111111111111',
  '33333333-3333-4333-8333-333333333333',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'
);
commit;
`,
    {
      onStdout: (chunk) => {
        intakeOutput += chunk
        if (intakeOutput.includes('INTAKE_LOCKED')) signalIntakeLock()
      },
    },
  )
  await intakeLocked
  clearTimeout(intakeReadyTimeout)

  let signalReparentPid
  let rejectReparentPid
  let reparentOutput = ''
  const reparentPidReady = new Promise((resolvePromise, rejectPromise) => {
    signalReparentPid = resolvePromise
    rejectReparentPid = rejectPromise
  })
  const reparentPidTimeout = setTimeout(
    () => rejectReparentPid(new Error('Reparent session did not publish its PID')),
    5_000,
  )
  const reparent = runPsql(
    String.raw`
\pset tuples_only on
select 'REPARENT_PID:' || pg_backend_pid();
do $reparent$
declare
  actual_sqlstate text;
begin
  begin
    update public.opportunities
    set project_id = '44444444-4444-4444-8444-444444444444'
    where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
  exception when others then
    get stacked diagnostics actual_sqlstate = returned_sqlstate;
    if actual_sqlstate <> '23503' then
      raise exception 'reparent returned SQLSTATE %, expected 23503', actual_sqlstate;
    end if;
    raise notice 'REPARENT_SQLSTATE:%', actual_sqlstate;
    return;
  end;
  raise exception 'concurrent reparent unexpectedly succeeded';
end
$reparent$;
`,
    {
      onStdout: (chunk) => {
        reparentOutput += chunk
        const match = reparentOutput.match(/REPARENT_PID:(\d+)/)
        if (match) signalReparentPid(Number(match[1]))
      },
    },
  )
  const reparentPid = await reparentPidReady
  clearTimeout(reparentPidTimeout)

  let blockingObserved = false
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const blocking = await runPsql(
      `select 'BLOCKER_COUNT:' || cardinality(pg_blocking_pids(${reparentPid}));`,
    )
    if (/BLOCKER_COUNT:[1-9][0-9]*/.test(blocking.stdout)) {
      blockingObserved = true
      break
    }
    await delay(100)
  }
  assert.equal(
    blockingObserved,
    true,
    'concurrent reparent was not observed waiting on the intake row lock',
  )

  await intake
  const reparentResult = await reparent
  assert.match(reparentResult.stderr, /REPARENT_SQLSTATE:23503/)

  const state = await runPsql(String.raw`
select 'INTAKE_STATE:' || opportunity.project_id || ':' || count(document.id)
from public.opportunities as opportunity
left join public.documents as document
  on document.tenant_id = opportunity.tenant_id
 and document.opportunity_id = opportunity.id
where opportunity.id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'
group by opportunity.project_id;
`)
  assert.match(
    state.stdout,
    /INTAKE_STATE:33333333-3333-4333-8333-333333333333:1/,
  )
}

async function removeOwnedContainer() {
  return runDocker(['rm', '--force', containerName], {
    allowFailure: true,
    timeoutMs: 15_000,
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
  await verifyMigrationNameCollisions(migrationSql)
  await runPsql(foundationSql)

  const preflight = await runPsql(migrationSql, { allowFailure: true })
  assert.notEqual(preflight.code, 0, 'legacy project mismatch passed preflight')
  assert.match(preflight.stderr, /associations that require repair/i)

  await runPsql(String.raw`
update public.documents
set project_id = '33333333-3333-4333-8333-333333333333'
where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
`)

  let signalReparentReady
  let rejectReparentReady
  const reparentReady = new Promise((resolvePromise, rejectPromise) => {
    signalReparentReady = resolvePromise
    rejectReparentReady = rejectPromise
  })
  const readinessTimeout = setTimeout(
    () => rejectReparentReady(new Error('Concurrent reparent session did not become ready')),
    5_000,
  )
  const reparent = runPsql(
    String.raw`
begin;
update public.opportunities
set project_id = '44444444-4444-4444-8444-444444444444'
where id = '77777777-7777-4777-8777-777777777777';
\echo REPARENT_READY
select pg_sleep(2);
commit;
`,
    {
      onStdout: (chunk) => {
        if (chunk.includes('REPARENT_READY')) signalReparentReady()
      },
    },
  )
  await reparentReady
  clearTimeout(readinessTimeout)

  const racedMigration = await runPsql(migrationSql, { allowFailure: true })
  await reparent
  assert.notEqual(
    racedMigration.code,
    0,
    'concurrent opportunity reparent bypassed migration validation',
  )
  assert.match(
    racedMigration.stderr,
    /associations that require repair|violates foreign key constraint/i,
  )

  await runPsql(String.raw`
update public.opportunities
set project_id = '33333333-3333-4333-8333-333333333333'
where id = '77777777-7777-4777-8777-777777777777';
`)
  await runPsql(migrationSql)
  await verifyIntakeLockSchedule()
  await runPsql(behaviorSql)
  await runPsql(catalogSql)
  process.stdout.write(
    'document opportunity/project migration verification passed\n',
  )
} catch (error) {
  primaryFailure = error
} finally {
  for (const child of activeChildren) child.kill('SIGTERM')
  const cleanup = await removeOwnedContainer().catch((error) => ({
    code: 1,
    stderr: String(error),
  }))
  if (
    !primaryFailure &&
    cleanup.code !== 0 &&
    !/no such container/i.test(cleanup.stderr)
  ) {
    primaryFailure = new Error('Failed to remove the owned disposable container')
  }
}

if (primaryFailure) throw primaryFailure
