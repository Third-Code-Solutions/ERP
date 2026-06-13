import { redirect } from 'next/navigation'

/**
 * Bare `/crm` has no landing surface of its own — Accounts is the CRM home.
 * The destination page enforces its own RBAC, so this is a plain redirect.
 */
export default function CrmIndexPage() {
  redirect('/crm/accounts')
}
