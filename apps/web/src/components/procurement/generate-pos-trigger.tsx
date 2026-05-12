'use client'

/**
 * GeneratePosTrigger — opens a BOM picker modal listing the tenant's
 * approved/locked BOMs. Selecting one launches the existing
 * GroupBySupplierForm wizard (which calls createPosFromBomGrouped).
 *
 * This is a thin nav glue point so the /purchase-orders list page can
 * offer "Generate POs from BOM" alongside its existing Create PO button.
 */

import { useState } from 'react'
import { GroupBySupplierForm } from './group-by-supplier-form'

export interface BomOption {
  id: string
  project_name: string
  version: number
  status: string
  total_cost_cents: number
}

interface Props {
  boms: BomOption[]
}

function formatPHP(cents: number): string {
  return (
    '₱' +
    (cents / 100).toLocaleString('en-PH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  )
}

export function GeneratePosTrigger({ boms }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [selectedBomId, setSelectedBomId] = useState<string | null>(null)

  const hasBoms = boms.length > 0

  return (
    <>
      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        disabled={!hasBoms}
        title={hasBoms ? undefined : 'No approved or locked BOMs available'}
        style={{
          padding: '7px 14px',
          borderRadius: '6px',
          fontSize: '0.8125rem',
          fontWeight: 600,
          border: '1px solid var(--color-border)',
          background: hasBoms ? 'white' : 'var(--color-neutral-100)',
          color: hasBoms ? 'var(--color-neutral-800)' : 'var(--color-neutral-400)',
          cursor: hasBoms ? 'pointer' : 'not-allowed',
        }}
      >
        Generate POs from BOM
      </button>

      {pickerOpen && !selectedBomId && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Select BOM for PO generation"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
            padding: 24,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setPickerOpen(false)
          }}
        >
          <div
            style={{
              background: 'white',
              borderRadius: 12,
              width: '100%',
              maxWidth: 560,
              maxHeight: '85vh',
              overflow: 'auto',
              boxShadow: '0 20px 60px rgba(15, 23, 42, 0.25)',
            }}
          >
            <header
              style={{
                padding: '20px 24px',
                borderBottom: '1px solid var(--color-border)',
              }}
            >
              <h2 style={{ margin: 0, fontSize: '1.0625rem', fontWeight: 700, color: 'var(--color-neutral-900)' }}>
                Select an approved BOM
              </h2>
              <p style={{ margin: '4px 0 0', fontSize: '0.8125rem', color: 'var(--color-neutral-500)' }}>
                Draft POs will be created, grouped by the best-rate vendor for each line.
              </p>
            </header>

            <div style={{ padding: '8px 0' }}>
              {boms.map((bom) => (
                <button
                  key={bom.id}
                  type="button"
                  onClick={() => setSelectedBomId(bom.id)}
                  style={{
                    width: '100%',
                    padding: '12px 24px',
                    background: 'white',
                    border: 'none',
                    borderBottom: '1px solid var(--color-border)',
                    textAlign: 'left',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-neutral-900)' }}>
                      {bom.project_name}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-neutral-500)', marginTop: 2 }}>
                      v{bom.version} · {bom.status}
                    </div>
                  </div>
                  <div style={{ fontSize: '0.8125rem', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--color-neutral-800)' }}>
                    {formatPHP(bom.total_cost_cents)}
                  </div>
                </button>
              ))}
            </div>

            <footer
              style={{
                padding: '14px 24px',
                borderTop: '1px solid var(--color-border)',
                display: 'flex',
                justifyContent: 'flex-end',
              }}
            >
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                style={{
                  padding: '8px 14px',
                  borderRadius: 6,
                  border: '1px solid var(--color-border)',
                  background: 'white',
                  color: 'var(--color-neutral-700)',
                  fontSize: '0.8125rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </footer>
          </div>
        </div>
      )}

      {/*
        Once a BOM is picked, hand off to the existing wizard. We render
        it in a hidden-trigger configuration by mounting it with the
        chosen bomId; the wizard owns its own modal lifecycle. We auto-
        open it by giving it a label that matches the picker's intent —
        the user only sees the wizard's modal.
      */}
      {selectedBomId && (
        <AutoOpenGroupBySupplier
          bomId={selectedBomId}
          onClosed={() => {
            setSelectedBomId(null)
            setPickerOpen(false)
          }}
        />
      )}
    </>
  )
}

/**
 * Tiny adapter that auto-opens the GroupBySupplierForm modal once a
 * BOM has been selected. The wizard's trigger button is rendered off-
 * screen and clicked once; the modal then takes over.
 */
function AutoOpenGroupBySupplier({ bomId, onClosed }: { bomId: string; onClosed: () => void }) {
  return (
    <div style={{ position: 'fixed', left: -9999, top: -9999 }}>
      <AutoClicker onClosed={onClosed}>
        <GroupBySupplierForm bomId={bomId} />
      </AutoClicker>
    </div>
  )
}

function AutoClicker({ children, onClosed }: { children: React.ReactNode; onClosed: () => void }) {
  // Mount the wizard and click its trigger via ref after mount.
  const ref = (node: HTMLDivElement | null) => {
    if (!node) return
    const btn = node.querySelector('button')
    if (btn && !btn.dataset.autoclicked) {
      btn.dataset.autoclicked = '1'
      btn.click()
    }
    // Detect dialog close to clear parent state.
    const observer = new MutationObserver(() => {
      if (!node.querySelector('[role="dialog"]')) {
        observer.disconnect()
        onClosed()
      }
    })
    observer.observe(node, { childList: true, subtree: true })
  }
  return <div ref={ref}>{children}</div>
}
