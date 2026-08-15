import { headers } from 'next/headers'
import { FinanceNavigation } from './finance-navigation-view'

export default async function FinanceLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = (await headers()).get('x-pathname') ?? '/finance'

  return (
    <>
      <FinanceNavigation pathname={pathname} />
      {children}
    </>
  )
}
