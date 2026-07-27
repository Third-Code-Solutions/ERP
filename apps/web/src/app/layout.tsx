import '@/lib/env'
import { Analytics } from '@vercel/analytics/next'
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
  metadataBase: new URL('https://thirdcode-erp.vercel.app'),
  title: {
    template: '%s | Third Code ERP',
    default: 'Third Code ERP',
  },
  description:
    'Third Code ERP is a connected operating system for construction pipeline, projects, procurement, cost, billing, compliance, and operational intelligence.',
  applicationName: 'Third Code ERP',
  authors: [{ name: 'Third Code Solutions Inc.' }],
  creator: 'Third Code Solutions Inc.',
  publisher: 'Third Code Solutions Inc.',
  category: 'business software',
  keywords: [
    'construction ERP',
    'construction management software',
    'project cost control',
    'construction procurement',
    'contractor billing',
    'Philippines construction software',
    'AI operations platform',
  ],
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
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
      <head>
        <link href="https://api.fontshare.com" rel="preconnect" />
        <link href="https://cdn.fontshare.com" rel="preconnect" crossOrigin="" />
        <link
          href="https://api.fontshare.com/v2/css?f[]=satoshi@300,400,500,700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
