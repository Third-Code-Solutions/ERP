'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { repairInspectionReport } from '@/app/(dashboard)/crm/opportunities/[id]/proposal/actions'
import styles from './inspection-report-repair.module.css'

type Props = { opportunityId: string; inspectionId: string; actorId: string; tenantId: string }

export function InspectionReportRepair(props: Props) {
  return <RepairControl key={`${props.tenantId}:${props.actorId}:${props.opportunityId}:${props.inspectionId}`} {...props} />
}

function RepairControl({ opportunityId, inspectionId, actorId, tenantId }: Props) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [documentId, setDocumentId] = useState<string | null>(null)
  const inFlight = useRef(false)
  const live = useRef(false)
  useEffect(() => { live.current = true; return () => { live.current = false } }, [])

  async function repair() {
    if (inFlight.current || documentId) return
    inFlight.current = true
    setPending(true); setError('')
    try {
      const result = await repairInspectionReport(opportunityId, inspectionId, { actorId, tenantId })
      if (!live.current) return
      if (!result.ok) { setError(result.error); return }
      setDocumentId(result.documentId)
      try { router.refresh() } catch { /* Archive receipt remains confirmed; reload is optional. */ }
    } catch {
      if (live.current) setError('Archive outcome is unconfirmed. Your findings remain submitted. Retry this report.')
    } finally {
      inFlight.current = false
      if (live.current) setPending(false)
    }
  }

  return <section className={styles.root} aria-label="Inspection report archive" aria-busy={pending}>
    <p className={styles.message} role="status">{documentId ? 'Report archived. Your saved findings are unchanged.' : 'Findings are saved. The print-ready HTML report still needs archiving.'}</p>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {documentId ? <a className={styles.button} href={`/api/documents/${documentId}?download=1`}>Download archived HTML</a>
      : <button className={styles.button} type="button" disabled={pending} onClick={() => void repair()}>{pending ? 'Archiving report…' : 'Retry report archive'}</button>}
  </section>
}
