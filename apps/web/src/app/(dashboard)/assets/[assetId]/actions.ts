'use server'

import { revalidatePath } from 'next/cache'
import { requireCapability, requireUserProfile } from '@third-code-erp/auth'
import {
  createAssetMaintenanceRecordCommandSchema,
} from '@third-code-erp/shared-types'
import {
  assetMaintenanceCreateWritesUseCoreApi,
  createAssetMaintenanceThroughCoreApi,
} from '@/lib/erp-core-client'
import { z } from 'zod'

const uuidSchema = z.string().uuid()

export async function createAssetMaintenance(
  assetId: string,
  formData: FormData
): Promise<void> {
  const profile = await requireUserProfile()
  requireCapability(profile, 'asset.maintenance.manage')
  const parsedAssetId = uuidSchema.parse(assetId)

  // The action is intentionally closed unless the exact tenant is canaried.
  // There is no direct browser/database fallback for this sensitive write.
  if (!assetMaintenanceCreateWritesUseCoreApi(profile.tenantId)) return

  const command = createAssetMaintenanceRecordCommandSchema.parse({
    maintenanceType: formData.get('maintenanceType'),
    summary: formData.get('summary'),
    performedOn: formData.get('performedOn'),
    nextDueOn: formData.get('nextDueOn') || null,
    vendorName: formData.get('vendorName') || null,
    costCents: Number(formData.get('costCents') || 0),
    notes: formData.get('notes') || null,
  })
  const idempotencyKey = z
    .string()
    .trim()
    .min(1)
    .max(256)
    .parse(formData.get('idempotencyKey'))
  const result = await createAssetMaintenanceThroughCoreApi(
    parsedAssetId,
    command,
    idempotencyKey
  )
  if (!result.ok) throw new Error(result.error ?? 'Maintenance record was not created.')

  revalidatePath(`/assets/${parsedAssetId}`)
  revalidatePath('/assets')
}
