'use client'

// Print toolbar button. Hidden in @media print via the .no-print class
// in the (print) layout. Mirrors apps/web/src/app/(print)/inspection/[id]/print-button.tsx.
export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      style={{
        padding: '8px 20px',
        borderRadius: '6px',
        fontSize: '0.875rem',
        fontWeight: 600,
        background: '#1F3864',
        color: 'white',
        border: 'none',
        cursor: 'pointer',
      }}
    >
      Print / Save as PDF
    </button>
  )
}
