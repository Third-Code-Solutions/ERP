import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { can, requireUserProfile } from '@third-code-erp/auth'
import { vendorPerformanceQuerySchema, type VendorPerformanceResult } from '@third-code-erp/shared-types'
import { getVendorPerformanceThroughCoreApi, vendorPerformanceReadsUseCoreApi } from '@/lib/erp-core-client'
import { readVendorPerformanceForTenant } from '@/lib/procurement/vendor-performance'
import { VendorPerformanceTable } from '@/components/procurement/vendor-performance-table'

export const metadata: Metadata = { title: 'Vendor performance' }

interface PageProps {
  searchParams: Promise<{ projectId?: string }>
}

export default async function VendorPerformancePage({ searchParams }: PageProps) {
  const profile = await requireUserProfile()
  if (!can(profile.role, 'procurement.vendor_performance.read')) {
    redirect('/dashboard?error=forbidden')
  }
  const params = await searchParams
  const parsedQuery = vendorPerformanceQuerySchema.safeParse({
    projectId: params.projectId,
  })
  if (!parsedQuery.success) {
    return <Unavailable message="The project filter is invalid. Open the register without a filter and try again." />
  }

  let result: VendorPerformanceResult | null = null
  let error: string | null = null
  if (vendorPerformanceReadsUseCoreApi(profile.tenantId)) {
    const response = await getVendorPerformanceThroughCoreApi(parsedQuery.data)
    if (response.ok && response.data) result = response.data
    else error = response.error ?? 'Vendor performance is unavailable.'
  } else {
    try {
      result = await readVendorPerformanceForTenant(profile.tenantId, parsedQuery.data)
    } catch {
      error = 'Vendor performance could not be loaded from the current data source.'
    }
  }

  return (
    <div>
      <div className="page-header">
        <p className="page-eyebrow"><Link href="/procurement" style={{ color: 'inherit' }}>Procurement</Link> / Controls</p>
        <h1 className="page-title">Vendor performance</h1>
        <p className="page-subtitle">Evidence-based delivery, acceptance, commitment, and posted-spend signals for supplier conversations.</p>
      </div>
      {error ? <Unavailable message={error} /> : result ? <VendorPerformanceTable result={result} /> : <Unavailable message="No vendor performance result was returned." />}
    </div>
  )
}

function Unavailable({ message }: { message: string }) {
  return (
    <div className="card" role="status">
      <h2 className="card-title">Vendor performance unavailable</h2>
      <p className="card-subtitle">{message}</p>
      <p className="muted" style={{ marginTop: 8 }}>No score or spend estimate has been fabricated.</p>
    </div>
  )
}
