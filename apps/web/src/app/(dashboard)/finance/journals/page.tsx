import { redirect } from 'next/navigation'
import { requireCapability, requireUserProfile } from '@third-code-erp/auth'

/** The journal collection lives in Finance; breadcrumb and deep links must resolve. */
export default async function JournalsIndexPage(): Promise<never> {
  const profile = await requireUserProfile()
  requireCapability(profile, 'finance.read')
  redirect('/finance')
}
