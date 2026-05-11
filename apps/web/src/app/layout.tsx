import '@/lib/env'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { Inter, JetBrains_Mono } from 'next/font/google'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
  weight: ['400', '500', '600', '700'],
})

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jetbrains',
  weight: ['400', '500', '600'],
})

export const metadata: Metadata = {
  title: {
    template: '%s | BuildOps',
    default: 'BuildOps',
  },
  description: 'Construction ERP for Philippine contractors',
}

// Reading the per-request nonce from headers() opts the entire route tree
// into dynamic rendering. Without it, Next.js prerenders pages at build time
// and serves HTML whose <script> tags carry no nonce — every framework script
// is then blocked by the strict CSP we set in middleware.ts. The nonce itself
// is consumed by Next.js internals when present in the request CSP header;
// reading it here is what triggers per-request render + nonce injection.
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await headers()

  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrains.variable}`}
      suppressHydrationWarning
    >
      <body>{children}</body>
    </html>
  )
}
