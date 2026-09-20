import { z } from 'zod'

export const inspectionPhotoTransportSchema = z.object({
  actorId: z.string().uuid(),
  tenantId: z.string().uuid(),
  opportunityId: z.string().uuid(),
  uploadUrl: z.string().url(),
}).strict()

export function inspectionPhotoUploadUrl(base: string, opportunityId: string): string {
  const url = new URL(base)
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) ||
    url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Inspection photo transport configuration is invalid')
  }
  return `${url.origin}/v1/opportunities/${z.string().uuid().parse(opportunityId).toLowerCase()}/inspection-photos/upload`
}

export function safeInspectionPhotoFileName(name: string): string {
  return name.trim().replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.{2,}/g, '_').slice(0, 160) || 'inspection-photo'
}
