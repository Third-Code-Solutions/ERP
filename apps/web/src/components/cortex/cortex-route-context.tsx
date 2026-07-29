import React from 'react'
import { CortexEntityPanel } from './cortex-entity-panel'
import { cortexRecordRoute } from '@/lib/cortex/record-route'

interface Props {
  pathname: string
}

/** Route-derived Cortex backlinks for supported operational record pages. */
export function CortexRouteContext({ pathname }: Props) {
  const record = cortexRecordRoute(pathname)
  if (!record) return null

  return (
    <div
      className="cortex-route-context"
      data-cortex-record-context={record.refTable}
    >
      <CortexEntityPanel
        refTable={record.refTable}
        refId={record.refId}
      />
    </div>
  )
}
