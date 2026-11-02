import { updateTenantSettings } from '../actions'
import { nativeFormRedirect, readNativeForm } from '@/lib/native-form-request'

export async function POST(request: Request): Promise<Response> {
  const parsed = await readNativeForm(request)
  if (!parsed.ok) return parsed.response
  const result = await updateTenantSettings(parsed.formData)
  return nativeFormRedirect('/settings', result.error ? { error: result.error } : { notice: 'Workspace settings saved.' })
}
