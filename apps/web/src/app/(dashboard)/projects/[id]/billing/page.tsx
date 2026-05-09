import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Billing' }

export default async function ProjectBillingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <div className="page-header">
      <h1 className="page-title">Billing</h1>
      <p className="page-subtitle">Project {id}</p>
    </div>
  )
}
