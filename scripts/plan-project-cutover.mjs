#!/usr/bin/env node

/**
 * Read-only Project-write canary planner.
 *
 * Required environment:
 *   DATABASE_URL
 *   CANARY_TENANT_ID
 *   CANARY_PROJECT_ID
 *   CANARY_ACTOR_ID
 *
 * The report never prints UUIDs, names, clients, locations, notes, email
 * addresses, or database credentials. Business values are represented by a
 * stable SHA-256 evidence digest. This script never changes database state.
 */
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildProjectCutoverBlockers,
  evidenceDigest,
  isUuid,
  opaqueRef,
} from './lib/project-cutover-plan.mjs'

const scriptDirectory = fileURLToPath(new URL('.', import.meta.url))
const repoRoot = resolve(scriptDirectory, '..')
const jsonOutput = process.argv.includes('--json')
const requireReady = process.argv.includes('--require-ready')
const databaseUrl = process.env.DATABASE_URL
const tenantId = process.env.CANARY_TENANT_ID
const projectId = process.env.CANARY_PROJECT_ID
const actorId = process.env.CANARY_ACTOR_ID

const missing = [
  ['DATABASE_URL', databaseUrl],
  ['CANARY_TENANT_ID', tenantId],
  ['CANARY_PROJECT_ID', projectId],
  ['CANARY_ACTOR_ID', actorId],
]
  .filter(([, value]) => !value)
  .map(([name]) => name)

if (missing.length > 0) {
  console.error(`Missing required environment: ${missing.join(', ')}`)
  process.exit(1)
}

for (const [name, value] of [
  ['CANARY_TENANT_ID', tenantId],
  ['CANARY_PROJECT_ID', projectId],
  ['CANARY_ACTOR_ID', actorId],
]) {
  if (!isUuid(value)) {
    console.error(`${name} must be a canonical UUID`)
    process.exit(1)
  }
}

const requireFromDatabasePackage = createRequire(
  join(repoRoot, 'packages', 'database', 'package.json')
)
const postgres = requireFromDatabasePackage('postgres')
const sql = postgres(databaseUrl, {
  prepare: false,
  max: 1,
  connect_timeout: 10,
  idle_timeout: 5,
})

try {
  const report = await sql.begin(
    'isolation level repeatable read read only',
    async (transaction) => {
      const [server] = await transaction.unsafe(
        'show server_version_num'
      )
      const [tenant] = await transaction`
        select id
          from public.tenants
         where id = ${tenantId}::uuid
      `
      const [project] = await transaction`
        select
          id,
          tenant_id,
          name,
          client,
          status::text as status,
          project_type::text as project_type,
          total_sqm,
          location,
          notes,
          updated_at
        from public.projects
        where tenant_id = ${tenantId}::uuid
          and id = ${projectId}::uuid
      `
      const [actor] = await transaction`
        select id, role::text as role
          from public.users
         where tenant_id = ${tenantId}::uuid
           and id = ${actorId}::uuid
      `
      const [authIdentity] = await transaction`
        select id
          from auth.users
         where id = ${actorId}::uuid
      `
      const [audit] = await transaction`
        with tenant_chain as (
          select
            id,
            entity_type,
            entity_id,
            action,
            prev_hash,
            hash,
            created_at,
            lag(hash) over (
              partition by tenant_id
              order by id
            ) as expected_prev_hash
          from public.audit_log
          where tenant_id = ${tenantId}::uuid
        )
        select
          count(*)::int as rows,
          count(*) filter (
            where case
              when expected_prev_hash is null
                then prev_hash is distinct from 'genesis'
              else prev_hash is distinct from expected_prev_hash
            end
          )::int as link_mismatches,
          count(*) filter (
            where hash is distinct from encode(
              extensions.digest(
                prev_hash
                  || entity_type
                  || entity_id::text
                  || action
                  || created_at::text,
                'sha256'
              ),
              'hex'
            )
          )::int as hash_mismatches,
          count(*) filter (
            where entity_type = 'projects'
              and entity_id = ${projectId}::uuid
          )::int as project_rows,
          max(id) as tail_id
        from tenant_chain
      `
      const [controls] = await transaction`
        select
          exists (
            select 1
              from pg_catalog.pg_trigger trigger
              join pg_catalog.pg_class relation
                on relation.oid = trigger.tgrelid
              join pg_catalog.pg_namespace namespace
                on namespace.oid = relation.relnamespace
             where namespace.nspname = 'public'
               and relation.relname = 'projects'
               and trigger.tgname = 'audit_projects'
               and not trigger.tgisinternal
          ) as project_audit_trigger,
          coalesce((
            select
              function.prosecdef
              and function.proconfig @> array[
                'search_path=public, auth, extensions'
              ]::text[]
              and pg_catalog.pg_get_functiondef(function.oid)
                ilike '%pg_advisory_xact_lock%'
              and pg_catalog.pg_get_functiondef(function.oid)
                ilike '%v_created_at%'
            from pg_catalog.pg_proc function
            join pg_catalog.pg_namespace namespace
              on namespace.oid = function.pronamespace
            where namespace.nspname = 'public'
              and function.proname = 'audit_log_trigger'
              and pg_catalog.pg_get_function_identity_arguments(
                function.oid
              ) = ''
          ), false) as audit_function_hardened,
          coalesce((
            select
              not pg_catalog.has_function_privilege(
                'anon',
                function.oid,
                'EXECUTE'
              )
              and not pg_catalog.has_function_privilege(
                'authenticated',
                function.oid,
                'EXECUTE'
              )
            from pg_catalog.pg_proc function
            join pg_catalog.pg_namespace namespace
              on namespace.oid = function.pronamespace
            where namespace.nspname = 'public'
              and function.proname = 'audit_log_trigger'
              and pg_catalog.pg_get_function_identity_arguments(
                function.oid
              ) = ''
          ), false) as audit_function_not_public
      `

      const baseReport = {
        mode: 'read_only',
        generatedAt: new Date().toISOString(),
        database: {
          postgresMajor: Math.floor(
            Number(server?.server_version_num ?? 0) / 10_000
          ),
        },
        target: {
          tenantRef: opaqueRef(tenantId),
          projectRef: opaqueRef(projectId),
          actorRef: opaqueRef(actorId),
          tenantExists: Boolean(tenant),
          projectExists: Boolean(project),
          actorExists: Boolean(actor),
          actorRole: actor?.role ?? null,
          authIdentityExists: Boolean(authIdentity),
          projectUpdatedAt:
            project?.updated_at?.toISOString?.() ?? null,
          projectBaselineSha256: project
            ? evidenceDigest({
                name: project.name,
                client: project.client,
                status: project.status,
                projectType: project.project_type,
                totalSqm: project.total_sqm,
                location: project.location,
                notes: project.notes,
              })
            : null,
        },
        audit: {
          rows: Number(audit?.rows ?? 0),
          linkMismatches: Number(audit?.link_mismatches ?? 0),
          hashMismatches: Number(audit?.hash_mismatches ?? 0),
          projectRows: Number(audit?.project_rows ?? 0),
          tailId:
            audit?.tail_id === null ||
            audit?.tail_id === undefined
              ? null
              : String(audit.tail_id),
        },
        controls: {
          projectAuditTrigger: Boolean(
            controls?.project_audit_trigger
          ),
          auditFunctionHardened: Boolean(
            controls?.audit_function_hardened
          ),
          auditFunctionNotPublic: Boolean(
            controls?.audit_function_not_public
          ),
        },
      }

      return {
        ...baseReport,
        blockers: buildProjectCutoverBlockers(baseReport),
      }
    }
  )

  const status =
    report.blockers.length === 0 ? 'ready' : 'blocked'
  const output = { ...report, status }

  if (jsonOutput) {
    console.log(JSON.stringify(output, null, 2))
  } else {
    console.log('Third Code ERP Project cutover plan (READ ONLY)')
    console.log(`Status: ${status}`)
    console.log(
      `Target refs: tenant=${report.target.tenantRef} Project=${report.target.projectRef} actor=${report.target.actorRef}`
    )
    console.log(
      `PostgreSQL: ${report.database.postgresMajor}; audit rows: ${report.audit.rows}; Project rows: ${report.audit.projectRows}`
    )
    console.log(
      `Audit mismatches: links=${report.audit.linkMismatches}; hashes=${report.audit.hashMismatches}`
    )
    if (report.blockers.length > 0) {
      console.log('Blockers:')
      for (const blocker of report.blockers) {
        console.log(`- ${blocker}`)
      }
    }
    console.log('No business values or identifiers were printed.')
    console.log('No database state was changed.')
  }

  if (requireReady && report.blockers.length > 0) {
    process.exitCode = 2
  }
} catch (error) {
  console.error(
    `Project cutover planning failed: ${
      error instanceof Error ? error.message : String(error)
    }`
  )
  process.exitCode = 1
} finally {
  await sql.end({ timeout: 1 })
}
