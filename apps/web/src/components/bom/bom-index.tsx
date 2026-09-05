'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import styles from '@/components/projects/workspace.module.css'

export interface BomIndexRow {
  id: string
  version: number
  label: string | null
  status: string
  tcv_cents: number
  total_cost_cents: number
  gp_margin_bps: number
  project_id: string | null
  project_name: string | null
}

export function currentBomVersions(rows: BomIndexRow[]) {
  const latest = new Map<string, BomIndexRow>()
  for (const row of rows) {
    if (!row.project_id || row.status === 'archived') continue
    const previous = latest.get(row.project_id)
    if (!previous || row.version > previous.version)
      latest.set(row.project_id, row)
  }
  return [...latest.values()]
}

function money(cents: number) {
  if (!Number.isSafeInteger(cents)) return 'Amount unavailable'
  const value = BigInt(cents),
    absolute = value < 0n ? -value : value
  return `${value < 0n ? '-' : ''}₱${(absolute / 100n).toLocaleString('en-PH')}.${String(absolute % 100n).padStart(2, '0')}`
}

export function BomIndex({ rows }: { rows: BomIndexRow[] }) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [history, setHistory] = useState(false)
  const [page, setPage] = useState(1)
  const current = currentBomVersions(rows)
  const filtered = (history ? rows : current).filter(
    (row) =>
      (!status || row.status === status) &&
      `${row.label ?? ''} ${row.project_name ?? ''}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  )
  const pages = Math.max(1, Math.ceil(filtered.length / 20))
  const selectedPage = Math.min(page, pages)
  return (
    <section className={styles.workspace} aria-label="BOM workspace">
      <header className={styles.header}>
        <div>
          <h1>BOM Builder</h1>
          <p>
            Review estimates, resolve scope, and open a project’s current BOM.
          </p>
        </div>
        <Link className={styles.primary} href="/projects">
          Choose a project →
        </Link>
      </header>
      <div className={styles.summary}>
        <span>{current.length} projects with a current BOM</span>
        <span>
          {current.filter((row) => row.status === 'draft').length} drafts ·{' '}
          {rows.length} versions in history
        </span>
      </div>
      <div className={styles.toolbar}>
        <label>
          Find a BOM
          <input
            type="search"
            placeholder="Project or BOM name"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setPage(1)
            }}
          />
        </label>
        <label>
          Status
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value)
              setPage(1)
            }}
          >
            <option value="">All statuses</option>
            {['draft', 'approved', 'locked', 'archived'].map((value) => (
              <option key={value} value={value}>
                {value[0]?.toUpperCase()}
                {value.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <button
          className={styles.secondary}
          aria-pressed={history}
          onClick={() => {
            setHistory(!history)
            setPage(1)
          }}
        >
          {history ? 'Show current BOMs' : 'Show version history'}
        </button>
        <button
          className={styles.secondary}
          onClick={() => {
            setQuery('')
            setStatus('')
            setPage(1)
          }}
        >
          Reset filters
        </button>
      </div>
      <div className={styles.summary} role="status">
        <span>
          {filtered.length} {history ? 'versions' : 'current BOMs'} shown
        </span>
        <span>
          {history
            ? 'History is read-only here; Open current BOM opens the project editor.'
            : 'Latest non-archived version per project. Amounts are not added across versions.'}
        </span>
      </div>
      {!filtered.length ? (
        <div className={styles.empty}>
          <h2>
            {rows.length
              ? 'No BOMs match these filters'
              : 'Start with project scope'}
          </h2>
          <p>
            {rows.length
              ? 'Clear the filters or include version history.'
              : 'Open a project to create its first estimate.'}
          </p>
          <Link className={styles.secondary} href="/projects">
            Go to projects
          </Link>
        </div>
      ) : (
        <div className={styles.cards}>
          {filtered
            .slice((selectedPage - 1) * 20, selectedPage * 20)
            .map((row) => (
              <article className={styles.card} key={row.id}>
                <span className={styles.badge}>
                  {row.status} · v{row.version}
                </span>
                <h2>{row.label ?? `BOM v${row.version}`}</h2>
                <p>{row.project_name ?? 'Project unavailable'}</p>
                <dl>
                  <div>
                    <dt>Contract value</dt>
                    <dd>{money(row.tcv_cents)}</dd>
                  </div>
                  <div>
                    <dt>Estimated cost</dt>
                    <dd>{money(row.total_cost_cents)}</dd>
                  </div>
                  <div>
                    <dt>Gross margin</dt>
                    <dd>{(row.gp_margin_bps / 100).toFixed(1)}%</dd>
                  </div>
                  <div>
                    <dt>Version</dt>
                    <dd>{row.version}</dd>
                  </div>
                </dl>
                {row.project_id && (
                  <div className={styles.actions}>
                    <Link
                      className={styles.primary}
                      href={`/projects/${row.project_id}/bom`}
                    >
                      Open current BOM →
                    </Link>
                    <Link
                      className={styles.secondary}
                      href={`/projects/${row.project_id}`}
                    >
                      Project
                    </Link>
                  </div>
                )}
              </article>
            ))}
        </div>
      )}
      {pages > 1 && (
        <nav className={styles.summary} aria-label="BOM pagination">
          <button
            className={styles.secondary}
            disabled={selectedPage === 1}
            onClick={() => setPage(selectedPage - 1)}
          >
            Previous
          </button>
          <span>
            Page {selectedPage} of {pages}
          </span>
          <button
            className={styles.secondary}
            disabled={selectedPage === pages}
            onClick={() => setPage(selectedPage + 1)}
          >
            Next
          </button>
        </nav>
      )}
      <p className={styles.note}>
        CAD intake produces draft scope for review. Confirm quantities, resolve
        flagged items, and attach pricing before requesting client approval.
        Existing approval and version controls stay in the project editor.
      </p>
    </section>
  )
}
