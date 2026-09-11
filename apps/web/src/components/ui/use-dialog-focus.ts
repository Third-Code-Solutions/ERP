'use client'

import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/** Keeps keyboard focus inside a modal and returns it to the launch control. */
export function useDialogFocus<T extends HTMLElement>(
  open: boolean,
  initialFocus?: RefObject<HTMLElement | null>,
  containerRef?: RefObject<T | null>,
): RefObject<T | null> {
  const internalDialogRef = useRef<T | null>(null)
  const dialogRef = containerRef ?? internalDialogRef
  const previousFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    const focusInitial = window.setTimeout(() => {
      initialFocus?.current?.focus()
      if (!initialFocus?.current) dialogRef.current?.focus()
    }, 0)

    function keepFocus(event: KeyboardEvent) {
      if (event.key !== 'Tab') return
      const dialog = dialogRef.current
      if (!dialog) return
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((element) => element.getClientRects().length > 0)
      if (focusable.length === 0) {
        event.preventDefault()
        dialog.focus()
        return
      }
      const first = focusable[0]!
      const last = focusable[focusable.length - 1]!
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', keepFocus)
    return () => {
      window.clearTimeout(focusInitial)
      document.removeEventListener('keydown', keepFocus)
      previousFocusRef.current?.focus()
      previousFocusRef.current = null
    }
  }, [containerRef, dialogRef, initialFocus, open])

  return dialogRef
}
