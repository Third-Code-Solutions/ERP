import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'BOM' }

export default async function ProjectBomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <div className="page-header">
      <h1 className="page-title">Bill of Materials</h1>
      <p className="page-subtitle">Project {id}</p>
    </div>
  )
}
