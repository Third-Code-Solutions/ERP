/**
 * Development seed script.
 * Run: pnpm --filter @third-code-erp/database db:seed
 *
 * Creates a dev tenant + admin user record (Supabase Auth user must exist separately).
 * Set SEED_USER_ID to the Supabase Auth UID you want to use as the admin.
 */
import { db } from './client'
import { costCodes, tenants, users } from './schema'
import { eq } from 'drizzle-orm'

const TENANT_SLUG = 'thrd-code-dev'
const TENANT_NAME = 'Th/rd Code Construction (Dev)'
const ADMIN_EMAIL = process.env['SEED_ADMIN_EMAIL'] ?? 'admin@thirdcode-erp.test'
const ADMIN_USER_ID = process.env['SEED_USER_ID'] ?? ''

async function seed() {
  if (!ADMIN_USER_ID) {
    console.error('Set SEED_USER_ID env var to your Supabase Auth UID before seeding.')
    process.exit(1)
  }

  // Upsert tenant
  const [existingTenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.slug, TENANT_SLUG))

  let tenantId: string

  if (existingTenant) {
    tenantId = existingTenant.id
    console.log(`Tenant already exists: ${tenantId}`)
  } else {
    const [tenant] = await db
      .insert(tenants)
      .values({
        name: TENANT_NAME,
        slug: TENANT_SLUG,
        bir_tin: '000-000-000-000',
        dpo_contact: ADMIN_EMAIL,
      })
      .returning()

    tenantId = tenant!.id
    console.log(`Created tenant: ${tenantId}`)
  }

  // Upsert admin user
  const [existingUser] = await db
    .select()
    .from(users)
    .where(eq(users.id, ADMIN_USER_ID))

  if (existingUser) {
    console.log(`User already exists: ${existingUser.email}`)
  } else {
    await db.insert(users).values({
      id: ADMIN_USER_ID,
      tenant_id: tenantId,
      email: ADMIN_EMAIL,
      full_name: 'Admin User',
      role: 'admin',
    })
    console.log(`Created user: ${ADMIN_EMAIL} (role: admin)`)
  }

  await db
    .insert(costCodes)
    .values([
      { tenant_id: tenantId, code: 'MAT', name: 'Materials', category: 'material', created_by: ADMIN_USER_ID },
      { tenant_id: tenantId, code: 'LAB', name: 'Labour', category: 'labour', created_by: ADMIN_USER_ID },
      { tenant_id: tenantId, code: 'SUB', name: 'Subcontractors', category: 'subcontractor', created_by: ADMIN_USER_ID },
      { tenant_id: tenantId, code: 'EQP', name: 'Equipment', category: 'equipment', created_by: ADMIN_USER_ID },
      { tenant_id: tenantId, code: 'OHD', name: 'Project overhead', category: 'overhead', created_by: ADMIN_USER_ID },
      { tenant_id: tenantId, code: 'OTH', name: 'Other project cost', category: 'other', created_by: ADMIN_USER_ID },
    ])
    .onConflictDoNothing()
  console.log('Ensured default Cost Codes.')

  console.log('Seed complete.')
  process.exit(0)
}

seed().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
