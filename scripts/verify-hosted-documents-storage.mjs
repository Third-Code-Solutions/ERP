#!/usr/bin/env node

import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const requireFromApiPackage = createRequire(
  new URL('../apps/api/package.json', import.meta.url),
)
const requireFromDatabasePackage = createRequire(
  new URL('../packages/database/package.json', import.meta.url),
)
const { createClient } = requireFromApiPackage('@supabase/supabase-js')

export const DOCUMENTS_BUCKET = 'documents'
export const DOCUMENTS_BUCKET_MAX_BYTES = 100 * 1024 * 1024
export const DOCUMENTS_BUCKET_ALLOWED_MIME_TYPES = Object.freeze([
  'application/acad',
  'application/dxf',
  'application/json',
  'application/msword',
  'application/pdf',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/bmp',
  'image/gif',
  'image/heic',
  'image/jpeg',
  'image/png',
  'image/tiff',
  'image/webp',
  'text/csv',
  'text/html',
  'text/plain',
])

function requiredEnvironment(environment, name) {
  const value = environment[name]?.trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}

function normalizeMimeTypes(value) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map((item) => String(item).trim().toLowerCase()))].sort()
}

export function verifyDocumentsBucket(bucket) {
  const expectedMimeTypes = [...DOCUMENTS_BUCKET_ALLOWED_MIME_TYPES].sort()
  const actualMimeTypes = normalizeMimeTypes(bucket.allowed_mime_types)
  return {
    private: bucket.public === false,
    exactLimit: Number(bucket.file_size_limit) === DOCUMENTS_BUCKET_MAX_BYTES,
    exactMimeTypes:
      actualMimeTypes.length === expectedMimeTypes.length &&
      actualMimeTypes.every((value, index) => value === expectedMimeTypes[index]),
  }
}

export function browserStoragePoliciesAreDenied(policies) {
  return policies.every((policy) => {
    const roles = Array.isArray(policy.roles)
      ? policy.roles.map((role) => String(role).toLowerCase())
      : String(policy.roles ?? '')
          .toLowerCase()
          .replace(/[{}]/g, '')
          .split(',')
          .filter(Boolean)
    const grantsBrowserRole = roles.some((role) =>
      ['anon', 'authenticated', 'public'].includes(role),
    )
    if (!grantsBrowserRole) return true

    const predicate = `${policy.qual ?? ''} ${policy.with_check ?? ''}`.toLowerCase()
    // A browser policy scoped to another bucket is safe. A policy that does
    // not explicitly constrain bucket_id can include documents and is denied.
    return predicate.includes('bucket_id') && !predicate.includes(DOCUMENTS_BUCKET)
  })
}

async function main() {
  const apply = process.argv.includes('--apply')
  const url = requiredEnvironment(process.env, 'NEXT_PUBLIC_SUPABASE_URL')
  const serviceRoleKey = requiredEnvironment(process.env, 'SUPABASE_SERVICE_ROLE_KEY')
  const anonKey = requiredEnvironment(process.env, 'NEXT_PUBLIC_SUPABASE_ANON_KEY')
  const databaseUrl = requiredEnvironment(process.env, 'PRODUCTION_DATABASE_URL')
  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  if (apply) {
    const { error } = await admin.storage.updateBucket(DOCUMENTS_BUCKET, {
      public: false,
      fileSizeLimit: DOCUMENTS_BUCKET_MAX_BYTES,
      allowedMimeTypes: [...DOCUMENTS_BUCKET_ALLOWED_MIME_TYPES],
    })
    if (error) throw new Error('Unable to apply documents bucket configuration')
  }

  const { data: buckets, error: bucketError } = await admin.storage.listBuckets()
  if (bucketError || !buckets) throw new Error('Unable to read documents bucket configuration')
  const bucket = buckets.find((candidate) => candidate.id === DOCUMENTS_BUCKET)
  if (!bucket) throw new Error('Documents bucket was not found')
  const verification = verifyDocumentsBucket(bucket)
  if (!Object.values(verification).every(Boolean)) {
    throw new Error('Documents bucket configuration does not match the approved policy')
  }

  // A private bucket does not by itself deny authenticated browser writes: a
  // Storage RLS policy could still grant them. Read the hosted policy catalog
  // and reject every browser policy that can name this bucket before testing
  // the anon direct-write path below.
  const postgres = requireFromDatabasePackage('postgres')
  const sql = postgres(databaseUrl, {
    max: 1,
    idle_timeout: 5,
    prepare: !databaseUrl.includes(':6543') && !databaseUrl.includes('pgbouncer=true'),
  })
  let documentsPolicies
  try {
    documentsPolicies = await sql`
      select policyname, roles, qual, with_check
      from pg_policies
      where schemaname = 'storage'
        and tablename = 'objects'
      order by policyname
    `
  } finally {
    await sql.end({ timeout: 5 })
  }
  if (!browserStoragePoliciesAreDenied(documentsPolicies)) {
    throw new Error('Documents bucket still has a direct-browser Storage policy')
  }

  // This requests a signed-upload credential with an anon client. It never
  // uploads an object; after the RLS migration it must be denied because direct
  // browser Storage writes are not an authority.
  const browser = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: directData, error: directError } = await browser.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUploadUrl(`direct-browser-denial/${crypto.randomUUID()}.txt`)
  if (!directError || directData) {
    throw new Error('Direct browser Storage write was unexpectedly authorized')
  }

  console.log(
    JSON.stringify({
      bucket: DOCUMENTS_BUCKET,
      fileSizeLimit: DOCUMENTS_BUCKET_MAX_BYTES,
      allowedMimeTypeCount: DOCUMENTS_BUCKET_ALLOWED_MIME_TYPES.length,
      directBrowserPoliciesDenied: true,
      directBrowserWriteDenied: true,
      applied: apply,
    })
  )
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
