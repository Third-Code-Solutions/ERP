import React from 'react'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'ABI OPS' }

export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="print-layout">
        <style>{`
          .print-layout, .print-layout *, .print-layout *::before, .print-layout *::after { box-sizing: border-box; }
          .print-layout {
            margin: 0;
            min-height: 100vh;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            font-size: 14px;
            color: #111827;
            background: #f3f4f6;
          }
          @media print {
            .print-layout { background: white; }
            .print-layout .no-print { display: none !important; }
            @page { margin: 20mm; size: A4; }
          }
        `}</style>
      {children}
    </div>
  )
}
