// Database helpers shared by the tenant setup scripts (bootstrap-trial-tenant,
// import-material-items). They take an open postgres.js transaction.

/** The user rows are written as: the one given, else the tenant's earliest active owner/admin. */
export async function resolveActor(tx, { tenantId, actorUserId }) {
  if (actorUserId) {
    const [actor] = await tx`
      select id::text as id
        from public.users
       where tenant_id = ${tenantId}::uuid
         and id = ${actorUserId}::uuid
    `
    if (!actor) {
      throw new Error('--actor-user-id is not a user of this tenant')
    }
    return { id: actor.id, source: '--actor-user-id' }
  }
  const [actor] = await tx`
    select id::text as id
      from public.users
     where tenant_id = ${tenantId}::uuid
       and role in ('owner', 'admin')
       and account_status = 'active'
     order by created_at asc, id asc
     limit 1
  `
  if (!actor) {
    throw new Error(
      'No active owner or admin user found for this tenant. Pass --actor-user-id <uuid>.'
    )
  }
  return { id: actor.id, source: 'earliest active owner/admin' }
}

/** Audit triggers record auth.uid(); stamp the actor the way the app does. */
export async function stampActor(tx, actorId) {
  await tx`select pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.json_build_object('sub', ${actorId}::text, 'role', 'authenticated')::text,
    true)`
}

/** unit_aliases is created by migration 20261124140000; null until it exists. */
export async function readUnitAliases(tx, tenantId) {
  const [{ present }] = await tx`
    select pg_catalog.to_regclass('public.unit_aliases') is not null as present
  `
  if (!present) return null
  return tx`
    select alias.alias, uom.code as uom_code
      from public.unit_aliases alias
      join public.units_of_measure uom
        on uom.id = alias.uom_id and uom.tenant_id = alias.tenant_id
     where alias.tenant_id = ${tenantId}::uuid
  `
}
