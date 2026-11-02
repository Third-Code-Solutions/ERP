import { nativeFormRedirect, readNativeForm } from '@/lib/native-form-request'
import { dispatchPlatformAdminCommand } from '../actions'

export async function POST(request: Request): Promise<Response> {
  const parsed = await readNativeForm(request)
  if (!parsed.ok) return parsed.response
  const outcome = await dispatchPlatformAdminCommand(parsed.formData)
  if (!outcome) return new Response('Unsupported platform administration operation.', { status: 400, headers: { 'cache-control': 'no-store' } })
  return nativeFormRedirect(outcome.destination, 'notice' in outcome ? { notice: outcome.notice } : { error: outcome.error })
}
