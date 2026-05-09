import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Documents' }

export default async function ProjectDocumentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <div className="page-header">
      <h1 className="page-title">Documents</h1>
      <p className="page-subtitle">Project {id}</p>
    </div>
  )
}
