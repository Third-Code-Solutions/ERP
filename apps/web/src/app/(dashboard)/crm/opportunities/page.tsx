import { redirect } from 'next/navigation'

/**
 * Opportunity list lives in the pipeline board. Keep the CRM collection URL
 * canonical so breadcrumbs, Cortex links, and deep links never terminate in a
 * 404.
 */
export default function OpportunitiesIndexPage(): never {
  redirect('/pipeline/board')
}
