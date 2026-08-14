'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { upsertDupaForBomLine } from '@/app/(dashboard)/projects/[id]/bom/actions'
import type {
  BomDupaDetail,
  BomDupaEquipmentLine,
  BomDupaLabourLine,
  BomDupaMaterialLine,
} from './bom-line-row'

const RATE_SOURCES = ['catalog', 'rfq', 'history', 'manual'] as const
type RateSource = (typeof RATE_SOURCES)[number]

interface BomWorkItem {
  id: string
  description: string
  unit: string | null
  quantity: number
  dupa?: BomDupaDetail
}

interface MaterialDraft {
  catalogItemId: string | null
  description: string
  quantity: string
  uom: string
  unitRate: string
  rateSource: RateSource
  rateAsOf: string
}

interface LabourDraft {
  crewRoleId: string | null
  description: string
  noOfPersons: string
  hourlyRate: string
  productivityPerHour: string
}

interface EquipmentDraft {
  equipmentId: string | null
  description: string
  noOfUnits: string
  hourlyRate: string
  productivityPerHour: string
}

export interface DupaAssemblyOption {
  id: string
  label: string
  uom: string
  materials: MaterialDraft[]
  labour: LabourDraft[]
  equipment: EquipmentDraft[]
}

interface DupaDraft {
  headerQuantity: string
  uom: string
  assemblyId: string | null
  ocmBps: string
  profitBps: string
  vatBps: string
  vatBase: 'direct_only' | 'direct_plus_indirect'
  materials: MaterialDraft[]
  labour: LabourDraft[]
  equipment: EquipmentDraft[]
}

interface DupaEditorProps {
  projectId: string
  bomId: string
  line: BomWorkItem | null
  assemblyOptions: DupaAssemblyOption[]
  isEditable: boolean
  onClose: () => void
}

function isRateSource(value: string): value is RateSource {
  return RATE_SOURCES.some((source) => source === value)
}

function toMoneyInput(centavos: string): string {
  try {
    const value = BigInt(centavos)
    const absolute = value < 0n ? -value : value
    return `${value < 0n ? '-' : ''}${absolute / 100n}.${(absolute % 100n)
      .toString()
      .padStart(2, '0')}`
  } catch {
    return ''
  }
}

function toCentavos(value: string): string | null {
  const normalized = value.trim().replace(/,/gu, '')
  const match = /^(?:0|[1-9]\d*)(?:\.\d{0,2})?$/u.exec(normalized)
  if (!match) return null
  const parts = normalized.split('.')
  const whole = parts[0]
  const fraction = parts[1] ?? ''
  if (!whole) return null
  return (BigInt(whole) * 100n + BigInt((fraction + '00').slice(0, 2))).toString()
}

function asRateSource(value: string): RateSource {
  return isRateSource(value) ? value : 'manual'
}

function materialDraftFromRow(row: BomDupaMaterialLine): MaterialDraft {
  return {
    catalogItemId: row.catalog_item_id,
    description: row.description,
    quantity: row.quantity,
    uom: row.uom,
    unitRate: toMoneyInput(row.unit_rate_centavos),
    rateSource: asRateSource(row.rate_source),
    rateAsOf: row.rate_as_of ?? '',
  }
}

function labourDraftFromRow(row: BomDupaLabourLine): LabourDraft {
  return {
    crewRoleId: null,
    description: row.description,
    noOfPersons: row.no_of_persons,
    hourlyRate: toMoneyInput(row.hourly_rate_centavos),
    productivityPerHour: row.productivity_per_hour,
  }
}

function equipmentDraftFromRow(row: BomDupaEquipmentLine): EquipmentDraft {
  return {
    equipmentId: null,
    description: row.description,
    noOfUnits: row.no_of_units,
    hourlyRate: toMoneyInput(row.hourly_rate_centavos),
    productivityPerHour: row.productivity_per_hour,
  }
}

function draftFromLine(line: BomWorkItem): DupaDraft {
  const dupa = line.dupa
  return {
    headerQuantity: dupa?.header_quantity ?? String(line.quantity),
    uom: dupa?.uom ?? line.unit ?? '',
    assemblyId: dupa?.assembly_id ?? null,
    ocmBps: String(dupa?.ocm_bps ?? 800),
    profitBps: String(dupa?.profit_bps ?? 700),
    vatBps: String(dupa?.vat_bps ?? 1200),
    vatBase: dupa?.vat_base ?? 'direct_only',
    materials: dupa?.materials.map(materialDraftFromRow) ?? [],
    labour: dupa?.labour.map(labourDraftFromRow) ?? [],
    equipment: dupa?.equipment.map(equipmentDraftFromRow) ?? [],
  }
}

function inputStyle(): React.CSSProperties {
  return {
    width: '100%',
    minHeight: 32,
    padding: '5px 7px',
    border: '1px solid var(--color-border)',
    borderRadius: 5,
    background: 'var(--color-surface)',
    color: 'var(--color-neutral-900)',
    fontSize: 12,
  }
}

function sectionStyle(): React.CSSProperties {
  return {
    display: 'grid',
    gap: 8,
    padding: 12,
    border: '1px solid var(--color-border)',
    borderRadius: 7,
    background: 'var(--color-neutral-50)',
  }
}

export function DupaEditor({ projectId, bomId, line, assemblyOptions, isEditable, onClose }: DupaEditorProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [draft, setDraft] = useState<DupaDraft>(() => (line ? draftFromLine(line) : draftFromLine({ id: '', description: '', unit: '', quantity: 1 })))
  const [error, setError] = useState('')
  const [savedMessage, setSavedMessage] = useState('')

  useEffect(() => {
    if (!line) return
    setDraft(draftFromLine(line))
    setError('')
    setSavedMessage('')
  }, [line?.id])

  if (!line) return null

  function updateDraft<K extends keyof DupaDraft>(key: K, value: DupaDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }))
    setError('')
    setSavedMessage('')
  }

  function handleSave() {
    setError('')
    setSavedMessage('')
    const bps = [draft.ocmBps, draft.profitBps, draft.vatBps].map((value) => Number(value))
    if (bps.some((value) => !Number.isInteger(value) || value < 0 || value > 10_000)) {
      setError('OCM, profit, and VAT must be whole basis points from 0 to 10000.')
      return
    }

    const materialRates = draft.materials.map((row) => toCentavos(row.unitRate))
    const labourRates = draft.labour.map((row) => toCentavos(row.hourlyRate))
    const equipmentRates = draft.equipment.map((row) => toCentavos(row.hourlyRate))
    if (
      materialRates.some((value) => value === null) ||
      labourRates.some((value) => value === null) ||
      equipmentRates.some((value) => value === null)
    ) {
      setError('Rates must be non-negative peso values with at most two decimals.')
      return
    }

    startTransition(async () => {
      const result = await upsertDupaForBomLine(projectId, bomId, {
        lineItemId: line?.id ?? '',
        headerQuantity: draft.headerQuantity,
        uom: draft.uom,
        assemblyId: draft.assemblyId,
        ocmBps: bps[0],
        profitBps: bps[1],
        vatBps: bps[2],
        vatBase: draft.vatBase,
        materials: draft.materials.map((row, index) => ({
          catalogItemId: row.catalogItemId,
          description: row.description,
          quantity: row.quantity,
          uom: row.uom,
          unitRateCentavos: materialRates[index]!,
          rateSource: row.rateSource,
          rateAsOf: row.rateAsOf || null,
        })),
        labour: draft.labour.map((row, index) => ({
          crewRoleId: row.crewRoleId,
          description: row.description,
          noOfPersons: row.noOfPersons,
          hourlyRateCentavos: labourRates[index]!,
          productivityPerHour: row.productivityPerHour,
        })),
        equipment: draft.equipment.map((row, index) => ({
          equipmentId: row.equipmentId,
          description: row.description,
          noOfUnits: row.noOfUnits,
          hourlyRateCentavos: equipmentRates[index]!,
          productivityPerHour: row.productivityPerHour,
        })),
      })
      if ('error' in result) {
        setError(result.error)
        return
      }
      setSavedMessage(`Saved. Unit rate ₱${toMoneyInput(result.totals.unitRateCentavos)}`)
      router.refresh()
    })
  }

  function applyAssembly(value: string) {
    const assembly = assemblyOptions.find((option) => option.id === value)
    if (!assembly) {
      updateDraft('assemblyId', null)
      return
    }
    setDraft((current) => ({
      ...current,
      assemblyId: assembly.id,
      materials: assembly.materials.map((row) => ({ ...row })),
      labour: assembly.labour.map((row) => ({ ...row })),
      equipment: assembly.equipment.map((row) => ({ ...row })),
    }))
    setError('')
    setSavedMessage('')
  }

  const buttonStyle: React.CSSProperties = {
    minHeight: 30,
    padding: '4px 8px',
    border: '1px solid var(--color-border)',
    borderRadius: 5,
    background: 'var(--color-surface)',
    color: 'var(--color-neutral-700)',
    fontSize: 11,
    fontWeight: 600,
    cursor: isPending ? 'not-allowed' : 'pointer',
  }

  return (
    <aside
      aria-label={`DUPA editor for ${line.description}`}
      style={{
        display: 'grid',
        gap: 12,
        marginTop: 16,
        padding: 16,
        border: '1px solid var(--color-navy-200)',
        borderRadius: 8,
        background: 'var(--color-surface)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
        <div>
          <div style={{ color: 'var(--color-navy-700)', fontSize: 11, fontWeight: 800, letterSpacing: '0.05em' }}>
            DUPA BUILDER
          </div>
          <h3 style={{ margin: '3px 0 0', color: 'var(--color-neutral-900)', fontSize: 15 }}>
            {line.description}
          </h3>
          <p style={{ margin: '4px 0 0', color: 'var(--color-neutral-500)', fontSize: 11 }}>
            Persisted unit rate is derived from H. No line-level markup is accepted.
          </p>
        </div>
        <button type="button" onClick={onClose} style={buttonStyle}>
          Close
        </button>
      </div>

      {!isEditable && (
        <div role="status" style={{ color: 'var(--color-neutral-600)', fontSize: 12 }}>
          This BOM is not a draft. DUPA inputs are read-only.
        </div>
      )}

      <fieldset disabled={!isEditable || isPending} style={{ display: 'grid', gap: 12, border: 0, padding: 0, margin: 0 }}>
        <legend style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden' }}>DUPA inputs</legend>
        <div style={{ ...sectionStyle(), gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
          <label style={{ display: 'grid', gap: 4, color: 'var(--color-neutral-600)', fontSize: 11 }}>
            Header quantity
            <input value={draft.headerQuantity} onChange={(event) => updateDraft('headerQuantity', event.target.value)} style={inputStyle()} inputMode="decimal" />
          </label>
          <label style={{ display: 'grid', gap: 4, color: 'var(--color-neutral-600)', fontSize: 11 }}>
            Unit
            <input value={draft.uom} onChange={(event) => updateDraft('uom', event.target.value)} style={inputStyle()} />
          </label>
          <label style={{ display: 'grid', gap: 4, color: 'var(--color-neutral-600)', fontSize: 11 }}>
            OCM (bps)
            <input value={draft.ocmBps} onChange={(event) => updateDraft('ocmBps', event.target.value)} style={inputStyle()} inputMode="numeric" />
          </label>
          <label style={{ display: 'grid', gap: 4, color: 'var(--color-neutral-600)', fontSize: 11 }}>
            Profit (bps)
            <input value={draft.profitBps} onChange={(event) => updateDraft('profitBps', event.target.value)} style={inputStyle()} inputMode="numeric" />
          </label>
          <label style={{ display: 'grid', gap: 4, color: 'var(--color-neutral-600)', fontSize: 11 }}>
            VAT (bps)
            <input value={draft.vatBps} onChange={(event) => updateDraft('vatBps', event.target.value)} style={inputStyle()} inputMode="numeric" />
          </label>
          <label style={{ display: 'grid', gap: 4, color: 'var(--color-neutral-600)', fontSize: 11 }}>
            VAT base
            <select value={draft.vatBase} onChange={(event) => updateDraft('vatBase', event.target.value as DupaDraft['vatBase'])} style={inputStyle()}>
              <option value="direct_only">Direct only</option>
              <option value="direct_plus_indirect">Direct + indirect</option>
            </select>
          </label>
          <label style={{ display: 'grid', gap: 4, color: 'var(--color-neutral-600)', fontSize: 11 }}>
            Assembly template
            <select
              value={draft.assemblyId ?? ''}
              onChange={(event) => applyAssembly(event.target.value)}
              style={inputStyle()}
            >
              <option value="">Manual lines</option>
              {assemblyOptions
                .filter((assembly) => assembly.uom.trim().toLowerCase() === draft.uom.trim().toLowerCase())
                .map((assembly) => (
                  <option key={assembly.id} value={assembly.id}>{assembly.label}</option>
                ))}
            </select>
          </label>
        </div>

        <div style={sectionStyle()}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
            <strong style={{ color: 'var(--color-neutral-800)', fontSize: 12 }}>Materials</strong>
            <button type="button" style={buttonStyle} onClick={() => updateDraft('materials', [...draft.materials, { catalogItemId: null, description: '', quantity: '1', uom: draft.uom, unitRate: '0.00', rateSource: 'manual', rateAsOf: '' }])}>+ Add material</button>
          </div>
          {draft.materials.map((row, index) => (
            <div key={`material-${index}`} style={{ display: 'grid', gridTemplateColumns: '2fr 0.8fr 0.7fr 1fr 0.9fr auto', gap: 6, alignItems: 'end' }}>
              <label style={{ display: 'grid', gap: 3, color: 'var(--color-neutral-500)', fontSize: 10 }}>Description<input value={row.description} onChange={(event) => { const next = [...draft.materials]; next[index] = { ...row, description: event.target.value }; updateDraft('materials', next) }} style={inputStyle()} /></label>
              <label style={{ display: 'grid', gap: 3, color: 'var(--color-neutral-500)', fontSize: 10 }}>Qty<input value={row.quantity} onChange={(event) => { const next = [...draft.materials]; next[index] = { ...row, quantity: event.target.value }; updateDraft('materials', next) }} style={inputStyle()} inputMode="decimal" /></label>
              <label style={{ display: 'grid', gap: 3, color: 'var(--color-neutral-500)', fontSize: 10 }}>UOM<input value={row.uom} onChange={(event) => { const next = [...draft.materials]; next[index] = { ...row, uom: event.target.value }; updateDraft('materials', next) }} style={inputStyle()} /></label>
              <label style={{ display: 'grid', gap: 3, color: 'var(--color-neutral-500)', fontSize: 10 }}>Rate ₱<input value={row.unitRate} onChange={(event) => { const next = [...draft.materials]; next[index] = { ...row, unitRate: event.target.value }; updateDraft('materials', next) }} style={inputStyle()} inputMode="decimal" /></label>
              <label style={{ display: 'grid', gap: 3, color: 'var(--color-neutral-500)', fontSize: 10 }}>Source<select value={row.rateSource} onChange={(event) => { const next = [...draft.materials]; next[index] = { ...row, rateSource: asRateSource(event.target.value) }; updateDraft('materials', next) }} style={inputStyle()}>{RATE_SOURCES.map((source) => <option key={source} value={source}>{source}</option>)}</select></label>
              <button type="button" aria-label={`Remove material ${index + 1}`} style={buttonStyle} onClick={() => updateDraft('materials', draft.materials.filter((_, rowIndex) => rowIndex !== index))}>×</button>
            </div>
          ))}
          {draft.materials.length === 0 && <span style={{ color: 'var(--color-neutral-500)', fontSize: 11 }}>No material rows.</span>}
        </div>

        <div style={sectionStyle()}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
            <strong style={{ color: 'var(--color-neutral-800)', fontSize: 12 }}>Labour</strong>
            <button type="button" style={buttonStyle} onClick={() => updateDraft('labour', [...draft.labour, { crewRoleId: null, description: '', noOfPersons: '1', hourlyRate: '0.00', productivityPerHour: '1' }])}>+ Add labour</button>
          </div>
          {draft.labour.map((row, index) => (
            <div key={`labour-${index}`} style={{ display: 'grid', gridTemplateColumns: '2fr 0.8fr 1fr 1fr auto', gap: 6, alignItems: 'end' }}>
              <label style={{ display: 'grid', gap: 3, color: 'var(--color-neutral-500)', fontSize: 10 }}>Description<input value={row.description} onChange={(event) => { const next = [...draft.labour]; next[index] = { ...row, description: event.target.value }; updateDraft('labour', next) }} style={inputStyle()} /></label>
              <label style={{ display: 'grid', gap: 3, color: 'var(--color-neutral-500)', fontSize: 10 }}>Persons<input value={row.noOfPersons} onChange={(event) => { const next = [...draft.labour]; next[index] = { ...row, noOfPersons: event.target.value }; updateDraft('labour', next) }} style={inputStyle()} inputMode="decimal" /></label>
              <label style={{ display: 'grid', gap: 3, color: 'var(--color-neutral-500)', fontSize: 10 }}>Hourly ₱<input value={row.hourlyRate} onChange={(event) => { const next = [...draft.labour]; next[index] = { ...row, hourlyRate: event.target.value }; updateDraft('labour', next) }} style={inputStyle()} inputMode="decimal" /></label>
              <label style={{ display: 'grid', gap: 3, color: 'var(--color-neutral-500)', fontSize: 10 }}>Productivity<input value={row.productivityPerHour} onChange={(event) => { const next = [...draft.labour]; next[index] = { ...row, productivityPerHour: event.target.value }; updateDraft('labour', next) }} style={inputStyle()} inputMode="decimal" /></label>
              <button type="button" aria-label={`Remove labour ${index + 1}`} style={buttonStyle} onClick={() => updateDraft('labour', draft.labour.filter((_, rowIndex) => rowIndex !== index))}>×</button>
            </div>
          ))}
          {draft.labour.length === 0 && <span style={{ color: 'var(--color-neutral-500)', fontSize: 11 }}>No labour rows.</span>}
        </div>

        <div style={sectionStyle()}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
            <strong style={{ color: 'var(--color-neutral-800)', fontSize: 12 }}>Equipment</strong>
            <button type="button" style={buttonStyle} onClick={() => updateDraft('equipment', [...draft.equipment, { equipmentId: null, description: '', noOfUnits: '1', hourlyRate: '0.00', productivityPerHour: '1' }])}>+ Add equipment</button>
          </div>
          {draft.equipment.map((row, index) => (
            <div key={`equipment-${index}`} style={{ display: 'grid', gridTemplateColumns: '2fr 0.8fr 1fr 1fr auto', gap: 6, alignItems: 'end' }}>
              <label style={{ display: 'grid', gap: 3, color: 'var(--color-neutral-500)', fontSize: 10 }}>Description<input value={row.description} onChange={(event) => { const next = [...draft.equipment]; next[index] = { ...row, description: event.target.value }; updateDraft('equipment', next) }} style={inputStyle()} /></label>
              <label style={{ display: 'grid', gap: 3, color: 'var(--color-neutral-500)', fontSize: 10 }}>Units<input value={row.noOfUnits} onChange={(event) => { const next = [...draft.equipment]; next[index] = { ...row, noOfUnits: event.target.value }; updateDraft('equipment', next) }} style={inputStyle()} inputMode="decimal" /></label>
              <label style={{ display: 'grid', gap: 3, color: 'var(--color-neutral-500)', fontSize: 10 }}>Hourly ₱<input value={row.hourlyRate} onChange={(event) => { const next = [...draft.equipment]; next[index] = { ...row, hourlyRate: event.target.value }; updateDraft('equipment', next) }} style={inputStyle()} inputMode="decimal" /></label>
              <label style={{ display: 'grid', gap: 3, color: 'var(--color-neutral-500)', fontSize: 10 }}>Productivity<input value={row.productivityPerHour} onChange={(event) => { const next = [...draft.equipment]; next[index] = { ...row, productivityPerHour: event.target.value }; updateDraft('equipment', next) }} style={inputStyle()} inputMode="decimal" /></label>
              <button type="button" aria-label={`Remove equipment ${index + 1}`} style={buttonStyle} onClick={() => updateDraft('equipment', draft.equipment.filter((_, rowIndex) => rowIndex !== index))}>×</button>
            </div>
          ))}
          {draft.equipment.length === 0 && <span style={{ color: 'var(--color-neutral-500)', fontSize: 11 }}>No equipment rows.</span>}
        </div>
      </fieldset>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {isEditable && <button type="button" onClick={handleSave} disabled={isPending} style={{ ...buttonStyle, background: 'var(--color-navy-700)', color: 'white', borderColor: 'var(--color-navy-700)' }}>{isPending ? 'Saving…' : 'Save DUPA'}</button>}
        {error && <span role="alert" style={{ color: 'var(--color-danger)', fontSize: 12 }}>{error}</span>}
        {savedMessage && <span role="status" style={{ color: 'var(--color-success)', fontSize: 12 }}>{savedMessage}</span>}
      </div>
    </aside>
  )
}
