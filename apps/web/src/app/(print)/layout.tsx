import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Third Code ERP' }

export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <style>{`
          *, *::before, *::after { box-sizing: border-box; }
          body {
            margin: 0;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            font-size: 14px;
            color: #111827;
            background: #f3f4f6;
          }
          @media print {
            body { background: white; }
            .no-print { display: none !important; }
            @page { margin: 20mm; size: A4; }
          }
        `}</style>
      </head>
      <body>{children}</body>
    </html>
  )
}
