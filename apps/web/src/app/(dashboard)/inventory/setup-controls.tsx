'use client'

import { useRef, useState, useTransition } from 'react'
import {
  configureInventoryItem,
  createUnitOfMeasure,
  createWarehouse,
  updateUnitOfMeasure,
  updateWarehouse,
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

export function EditUomForm({
  uom,
}: {
  uom: {
    id: string
    code: string
    name: string
    decimalPlaces: number
    isActive: boolean
  }
}) {
  const state = useInventoryForm()

  return (
    <details className="inventory-uom-editor">
      <summary className="finance-secondary-button">Edit UOM</summary>
      <form
        ref={state.formRef}
        action={(data) =>
          state.run((formData) => updateUnitOfMeasure(uom.id, formData), data)
        }
        className="finance-setup-form"
      >
        <p className="finance-form-hint">
          <strong>{uom.code}</strong> / {uom.decimalPlaces} decimals are
          immutable after stock evidence.
        </p>
        <div className="finance-field finance-field-grow">
          <label htmlFor={`uom-${uom.id}-name`}>Name</label>
          <input
            id={`uom-${uom.id}-name`}
            name="name"
            required
            maxLength={120}
            defaultValue={uom.name}
          />
        </div>
        <label className="inventory-check">
          <input
            name="isActive"
            type="checkbox"
            defaultChecked={uom.isActive}
          />
          <span>
            <strong>Available for new assignments</strong>
            <small>Existing stock evidence remains unchanged.</small>
          </span>
        </label>
        <button
          type="submit"
          className="finance-primary-button"
          disabled={state.pending}
        >
          {state.pending ? 'Saving...' : 'Save UOM'}
        </button>
        {state.error && <p className="finance-form-error">{state.error}</p>}
      </form>
    </details>
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

export function EditWarehouseForm({
  warehouse,
}: {
  warehouse: {
    id: string
    code: string
    name: string
    isActive: boolean
  }
}) {
  const state = useInventoryForm()

  return (
    <details className="inventory-warehouse-editor">
      <summary className="finance-secondary-button">Edit</summary>
      <form
        ref={state.formRef}
        action={(data) =>
          state.run((formData) => updateWarehouse(warehouse.id, formData), data)
        }
        className="finance-setup-form"
      >
        <p className="finance-form-hint">
          <strong>{warehouse.code}</strong> is the immutable warehouse code.
        </p>
        <div className="finance-field finance-field-grow">
          <label htmlFor={`warehouse-${warehouse.id}-name`}>Name</label>
          <input
            id={`warehouse-${warehouse.id}-name`}
            name="name"
            required
            maxLength={160}
            defaultValue={warehouse.name}
          />
        </div>
        <label className="inventory-check">
          <input
            name="isActive"
            type="checkbox"
            defaultChecked={warehouse.isActive}
          />
          <span>
            <strong>Available for new receipts</strong>
            <small>Deactivation requires zero net stock.</small>
          </span>
        </label>
        <button
          type="submit"
          className="finance-primary-button"
          disabled={state.pending}
        >
          {state.pending ? 'Saving...' : 'Save changes'}
        </button>
        {state.error && <p className="finance-form-error">{state.error}</p>}
      </form>
    </details>
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

export function EditInventoryItemPolicyForm({
  item,
  uoms,
}: {
  item: {
    id: string
    code: string
    description: string
    baseUomId: string
    inventoryTracked: boolean
  }
  uoms: Array<{ id: string; code: string; name: string; isActive: boolean }>
}) {
  const state = useInventoryForm()

  return (
    <details className="inventory-item-editor">
      <summary className="finance-secondary-button">Edit policy</summary>
      <form
        ref={state.formRef}
        action={(data) => state.run(configureInventoryItem, data)}
        className="finance-setup-form"
      >
        <input type="hidden" name="materialItemId" value={item.id} />
        <p className="finance-form-hint">
          <strong>{item.code}</strong> identity stays stable after stock posts.
        </p>
        <div className="finance-field finance-field-grow">
          <label htmlFor={`inventory-${item.id}-uom`}>Base UOM</label>
          <select
            id={`inventory-${item.id}-uom`}
            name="uomId"
            required
            defaultValue={item.baseUomId}
          >
            <option value="">Choose UOM</option>
            {uoms.map((uom) => (
              <option
                value={uom.id}
                key={uom.id}
                disabled={!uom.isActive && uom.id !== item.baseUomId}
              >
                {uom.code} / {uom.name}
                {!uom.isActive ? ' (inactive)' : ''}
              </option>
            ))}
          </select>
        </div>
        <label className="inventory-check">
          <input
            name="tracked"
            type="checkbox"
            defaultChecked={item.inventoryTracked}
          />
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
          {state.pending ? 'Saving...' : 'Save policy'}
        </button>
        {state.error && <p className="finance-form-error">{state.error}</p>}
      </form>
    </details>
  )
}
