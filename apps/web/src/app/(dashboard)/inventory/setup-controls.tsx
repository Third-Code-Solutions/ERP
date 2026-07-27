'use client'

import { useRef, useState, useTransition } from 'react'
import {
  configureInventoryItem,
  createUnitOfMeasure,
  createWarehouse,
} from './actions'

function useInventoryForm() {
  const formRef = useRef<HTMLFormElement>(null)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const run = (
    action: (formData: FormData) => Promise<{ ok: boolean; error?: string }>,
    formData: FormData
  ) => {
    setError(null)
    startTransition(async () => {
      const result = await action(formData)
      if (!result.ok) {
        setError(result.error ?? 'Could not save inventory setup.')
        return
      }
      formRef.current?.reset()
    })
  }
  return { formRef, pending, error, run }
}

export function CreateUomForm() {
  const state = useInventoryForm()
  return (
    <form
      ref={state.formRef}
      action={(data) => state.run(createUnitOfMeasure, data)}
      className="finance-setup-form"
    >
      <div className="finance-field">
        <label htmlFor="uom-code">Code</label>
        <input id="uom-code" name="code" required maxLength={32} placeholder="PCS" />
      </div>
      <div className="finance-field finance-field-grow">
        <label htmlFor="uom-name">Unit of measure</label>
        <input
          id="uom-name"
          name="name"
          required
          maxLength={120}
          placeholder="Pieces"
        />
      </div>
      <div className="finance-field">
        <label htmlFor="uom-decimals">Decimals</label>
        <select id="uom-decimals" name="decimalPlaces" defaultValue="0">
          {[0, 1, 2, 3, 4, 5, 6].map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        className="finance-primary-button"
        disabled={state.pending}
      >
        {state.pending ? 'Saving...' : 'Add UOM'}
      </button>
      {state.error && <p className="finance-form-error">{state.error}</p>}
    </form>
  )
}

export function CreateWarehouseForm({
  projects,
}: {
  projects: Array<{ id: string; code: string; name: string }>
}) {
  const state = useInventoryForm()
  return (
    <form
      ref={state.formRef}
      action={(data) => state.run(createWarehouse, data)}
      className="finance-setup-form"
    >
      <div className="finance-field">
        <label htmlFor="warehouse-code">Code</label>
        <input
          id="warehouse-code"
          name="code"
          required
          maxLength={40}
          placeholder="MAIN"
        />
      </div>
      <div className="finance-field finance-field-grow">
        <label htmlFor="warehouse-name">Warehouse</label>
        <input
          id="warehouse-name"
          name="name"
          required
          maxLength={160}
          placeholder="Main materials warehouse"
        />
      </div>
      <div className="finance-field finance-field-grow">
        <label htmlFor="warehouse-project">Project scope</label>
        <select id="warehouse-project" name="projectId" defaultValue="">
          <option value="">Shared across projects</option>
          {projects.map((project) => (
            <option value={project.id} key={project.id}>
              {project.code} / {project.name}
            </option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        className="finance-primary-button"
        disabled={state.pending}
      >
        {state.pending ? 'Saving...' : 'Add Warehouse'}
      </button>
      {state.error && <p className="finance-form-error">{state.error}</p>}
    </form>
  )
}

export function ConfigureItemForm({
  items,
  uoms,
}: {
  items: Array<{ id: string; code: string; description: string }>
  uoms: Array<{ id: string; code: string; name: string }>
}) {
  const state = useInventoryForm()
  return (
    <form
      ref={state.formRef}
      action={(data) => state.run(configureInventoryItem, data)}
      className="finance-setup-form"
    >
      <div className="finance-field finance-field-grow">
        <label htmlFor="inventory-item">Item</label>
        <select id="inventory-item" name="materialItemId" required defaultValue="">
          <option value="">Choose catalog item</option>
          {items.map((item) => (
            <option value={item.id} key={item.id}>
              {item.code} / {item.description}
            </option>
          ))}
        </select>
      </div>
      <div className="finance-field finance-field-grow">
        <label htmlFor="inventory-item-uom">Base UOM</label>
        <select id="inventory-item-uom" name="uomId" required defaultValue="">
          <option value="">Choose UOM</option>
          {uoms.map((uom) => (
            <option value={uom.id} key={uom.id}>
              {uom.code} / {uom.name}
            </option>
          ))}
        </select>
      </div>
      <label className="inventory-check">
        <input name="tracked" type="checkbox" defaultChecked />
        <span>
          <strong>Track perpetual stock</strong>
          <small>Posting creates immutable quantity and value movements.</small>
        </span>
      </label>
      <button
        type="submit"
        className="finance-primary-button"
        disabled={state.pending}
      >
        {state.pending ? 'Saving...' : 'Save item policy'}
      </button>
      {state.error && <p className="finance-form-error">{state.error}</p>}
    </form>
  )
}
