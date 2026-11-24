import React from 'react'
import Link from 'next/link'

/**
 * A bill's Purchase Order number. Roles that cannot open the Purchase Order
 * pages (Finance) see the number as plain text instead of a link that bounces.
 */
export function PurchaseOrderRef({
  id,
  number,
  canOpen,
}: {
  id: string
  number: string
  canOpen: boolean
}) {
  if (!canOpen) return <>{number}</>
  return <Link href={`/purchase-orders/${id}`}>{number}</Link>
}
