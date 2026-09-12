import styles from './procurement.module.css'

const VENDOR_ROWS = 5
const PURCHASE_ORDER_ROWS = 4

function SkeletonRows({ count }: { count: number }) {
  return Array.from({ length: count }).map((_, index) => (
    <div
      key={index}
      style={{
        padding: '14px 20px',
        borderBottom: index < count - 1 ? '1px solid var(--color-border)' : undefined,
      }}
    >
      <div className="skeleton" style={{ height: '14px', width: '160px', marginBottom: '7px' }} />
      <div className="skeleton" style={{ height: '12px', width: '210px' }} />
    </div>
  ))
}

export default function ProcurementLoading() {
  return (
    <div className={styles.loading} aria-busy="true" aria-label="Loading procurement workspace">
      <div className="page-header">
        <div className="skeleton" style={{ height: '24px', width: '130px', marginBottom: '6px' }} />
        <div className="skeleton" style={{ height: '14px', width: '280px' }} />
      </div>

      <div className={styles.workspaceColumns}>
        <div className={styles.sectionPanel}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div className="skeleton" style={{ height: '14px', width: '110px' }} />
            <div className="skeleton" style={{ height: '30px', width: '98px', borderRadius: '6px' }} />
          </div>
          <div style={{ background: 'white', border: '1px solid var(--color-border)', borderRadius: '8px', overflow: 'hidden' }}>
            <SkeletonRows count={VENDOR_ROWS} />
          </div>
        </div>

        <div className={styles.sectionPanel}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div className="skeleton" style={{ height: '14px', width: '170px' }} />
            <div className="skeleton" style={{ height: '14px', width: '72px' }} />
          </div>
          <div style={{ background: 'white', border: '1px solid var(--color-border)', borderRadius: '8px', overflow: 'hidden' }}>
            <SkeletonRows count={PURCHASE_ORDER_ROWS} />
          </div>
        </div>
      </div>
    </div>
  )
}
