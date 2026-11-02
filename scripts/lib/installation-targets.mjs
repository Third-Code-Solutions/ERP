const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function installationTargets(env) {
  const required = (name, pattern) => {
    const value = env[name]?.trim()
    if (!value || (pattern && !pattern.test(value))) throw new Error(`${name} must explicitly identify this installation`)
    return value
  }
  const origin = (name) => {
    const value = required(name)
    let url
    try { url = new URL(value) } catch { throw new Error(`${name} must be an HTTPS origin`) }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error(`${name} must be an HTTPS origin`)
    return url.origin
  }
  const supabaseRef = required('SUPABASE_PROJECT_REF', /^[a-z]{20}$/)
  if (origin('NEXT_PUBLIC_SUPABASE_URL') !== `https://${supabaseRef}.supabase.co`) throw new Error('Supabase URL does not match the explicit project reference')
  return {
    supabaseRef,
    railwayProject: required('RAILWAY_PROJECT_ID', UUID),
    railwayEnvironment: required('RAILWAY_ENVIRONMENT_ID', UUID),
    apiService: required('RAILWAY_API_SERVICE_ID', UUID),
    cadService: required('RAILWAY_CAD_SERVICE_ID', UUID),
    apiOrigin: origin('ERP_CORE_API_URL'),
    cadOrigin: origin('CAD_WORKER_URL'),
    webOrigin: origin('PRODUCTION_URL'),
    vercelScope: required('VERCEL_SCOPE', /^team_[a-zA-Z0-9]+$/),
    vercelProject: required('VERCEL_PROJECT_ID', /^prj_[a-zA-Z0-9]+$/),
    vercelName: required('VERCEL_PROJECT_NAME', /^[a-z0-9][a-z0-9-]*$/),
  }
}

export function databaseTargets(env, projectRef) {
  const targets = {}
  for (const name of ['SUPABASE_MIGRATION_DATABASE_URL', 'PRODUCTION_DATABASE_URL', 'RUNTIME_DATABASE_URL']) {
    let url
    try { url = new URL(env[name]) } catch { throw new Error(`${name} must be an explicit PostgreSQL connection`) }
    const direct = url.hostname === `db.${projectRef}.supabase.co`
    const pooler = url.hostname.endsWith('.pooler.supabase.com')
    const username = decodeURIComponent(url.username)
    const suffix = `.${projectRef}`
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || (!direct && !pooler) ||
        url.pathname !== '/postgres' || !url.password ||
        (pooler && !username.endsWith(suffix)) ||
        !(name === 'SUPABASE_MIGRATION_DATABASE_URL' ? ['5432'] : ['5432', '6543']).includes(url.port || '5432')) {
      throw new Error(`${name} does not match the exact Supabase project/database/port`)
    }
    targets[name] = { role: pooler ? username.slice(0, -suffix.length) : username }
  }
  const roles = Object.values(targets).map(target => target.role)
  if (roles.some(role => !role) || new Set(roles).size !== roles.length) throw new Error('Migration, verification and runtime must use three distinct database roles')
  return targets
}
