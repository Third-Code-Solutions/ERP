'use client'

// Print toolbar button. Hidden in @media print via the .no-print class
// in the (print) layout. Mirrors apps/web/src/app/(print)/invoices/[id]/print/print-button.tsx.
// The report is a full HTML document inside an iframe; printing the outer page
// would print only the first iframe-height page, so print the frame itself.
function printReport() {
  const frame = document.querySelector<HTMLIFrameElement>('iframe[data-print-report]')
  if (frame?.contentWindow) {
    frame.contentWindow.focus()
    frame.contentWindow.print()
    return
  }
  window.print()
}

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={printReport}
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
